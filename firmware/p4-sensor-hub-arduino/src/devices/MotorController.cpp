#include "devices/MotorController.h"

#include <math.h>

#include "AppConfig.h"

namespace {
constexpr float kRsenseOhms = 0.05f;  // from Adafruit schematic for TMC2209
constexpr uint8_t kDriverAddress = 0b00;
constexpr uint16_t kMotorCurrentMa = 950;
constexpr uint32_t kMaxTcoolthrs = 0xFFFFF;
}  // namespace

volatile bool MotorController::diagInterruptArmed_ = false;
volatile bool MotorController::diagInterruptPending_ = false;

MotorController::MotorController(HardwareSerial& serial)
    : serial_(serial), driver_(&serial_, kRsenseOhms, kDriverAddress) {}

void MotorController::begin() {
  pinMode(Pins::kMotorEnable, OUTPUT);
  pinMode(Pins::kMotorDiag, INPUT);
  pinMode(Pins::kMotorIndex, INPUT);
  pinMode(
      Pins::kMotorEndstop,
      Config::kEndstopActiveLow ? INPUT_PULLUP : INPUT_PULLDOWN);

  driverMutex_ = xSemaphoreCreateMutex();
  attachInterrupt(
      digitalPinToInterrupt(Pins::kMotorDiag), handleDiagInterrupt, RISING);

  setEnabled(false);
  serial_.begin(
      Config::kTmcBaud,
      SERIAL_8N1,
      Pins::kTmcUartRx,
      Pins::kTmcUartTx);

  stepGenerator_.begin();
  configureDriver();
  setEnabled(false);
}

void MotorController::configureDriver() {
  stopImmediately();

  lockDriver();
  driver_.begin();
  driver_.pdn_disable(true);
  driver_.mstep_reg_select(true);
  driver_.I_scale_analog(false);
  driver_.rms_current(kMotorCurrentMa, 0.25f);  // 0.25f is the multiplier for hold current
  driver_.microsteps(Config::kMicrosteps);
  // SpreadCycle settings (change if needed for noise or vibration issues)
  driver_.toff(5);                              // spreadcycle settings - recirculation time
//driver_.tbl(2);                               // spreadcycle settings - measurement "blank time"
//driver_.hend(4);                              // spreadcycle settings - basic hysteresis value
//driver_.hstrt(0);                             // spreadcycle settings - hysteresis start value
  driver_.en_spreadCycle(true);
  driver_.pwm_autoscale(true);
  //driver_.TPWMTHRS(0);
  driver_.TCOOLTHRS(Config::kStallGuardCoolThreshold);
  driver_.SGTHRS(Config::kStallGuardThreshold);
  driverMotionProfile_ = DriverMotionProfile::Normal;
  unlockDriver();
}

void MotorController::service() {
  if (!enabled_ || !stepGenerator_.ready()) {
    return;
  }

  if (serviceAxisCalibration()) {
    return;
  }

  if (enforceSoftwareLimits()) {
    return;
  }

  if (endstopActive() && appliedVelocityMmS_ < 0.0f) {
    const StallMotionMode mode = stallMotionMode_;
    stopImmediately();
    stepGenerator_.setPositionSteps(0);
    disarmStallGuard();
    cancelStallMotion();
    if (mode == StallMotionMode::Test) {
      motionEvent_ = MotorMotionEvent::StallTestEndstop;
    }
    return;
  }

  if (stallMotionMode_ == StallMotionMode::Test && diagInterruptPending_) {
    stopImmediately();
    disarmStallGuard();
    cancelStallMotion();
    motionEvent_ = MotorMotionEvent::StallDetected;
    return;
  }

  if (positionMoveActive_) {
    servicePositionMove();
  } else if (velocityMode_) {
    serviceVelocityRamp();
  }

  if (enforceSoftwareLimits()) {
    return;
  }

  if (stallMotionMode_ == StallMotionMode::Test &&
      labs(positionSteps() - stallTestStartSteps_) >=
          stallTestMaxTravelSteps_) {
    stopImmediately();
    cancelStallMotion();
    motionEvent_ = MotorMotionEvent::StallTestTravelLimit;
  }
}

void MotorController::stop() {
  cancelStallMotion();
  cancelAxisCalibration();
  stopImmediately();
}

void MotorController::moveToSteps(long steps) {
  if (!limitsValid_) {
    motionEvent_ = MotorMotionEvent::CalibrationIncomplete;
    return;
  }

  cancelStallMotion();
  cancelAxisCalibration();
  applyNormalDriverProfile();
  startPositionMove(clampToSoftwareLimits(steps));
}

void MotorController::moveToMm(float mm) {
  moveToSteps(static_cast<long>(mm * Config::kStepsPerMm));
}

void MotorController::setVelocityMmS(float velocityMmS) {
  if (!limitsValid_) {
    motionEvent_ = MotorMotionEvent::CalibrationIncomplete;
    return;
  }

  if (velocityMmS == 0.0f) {
    stop();
    return;
  }

  const bool continuingVelocityCommand =
      velocityMode_ && stallMotionMode_ == StallMotionMode::None &&
      !calibrationActive();
  cancelStallMotion();
  cancelAxisCalibration();
  applyNormalDriverProfile();
  if (!continuingVelocityCommand) {
    stopImmediately();
  }

  const long position = positionSteps();
  if ((velocityMmS < 0.0f && position <= minLimitSteps_) ||
      (velocityMmS > 0.0f && position >= maxLimitSteps_)) {
    stopImmediately();
    motionEvent_ = MotorMotionEvent::SoftwareLimitHit;
    return;
  }

  velocityMode_ = true;
  targetVelocityMmS_ = constrain(
      velocityMmS,
      -Config::kMaxStageSpeedMmS,
      Config::kMaxStageSpeedMmS);
  if (lastVelocityRampUs_ == 0) {
    lastVelocityRampUs_ = micros();
  }
}

void MotorController::homeHere() {
  cancelStallMotion();
  cancelAxisCalibration();
  stopImmediately();
  limitsValid_ = false;
  stepGenerator_.setPositionSteps(0);
}

long MotorController::positionSteps() {
  return stepGenerator_.positionSteps();
}

float MotorController::positionMm() {
  return static_cast<float>(positionSteps()) / Config::kStepsPerMm;
}

bool MotorController::enabled() const {
  return enabled_;
}

bool MotorController::stepGeneratorReady() const {
  return stepGenerator_.ready();
}

bool MotorController::velocityMode() const {
  return velocityMode_;
}

bool MotorController::calibrationActive() const {
  return calibrationMode_ != AxisCalibrationMode::None;
}

bool MotorController::limitsValid() const {
  return limitsValid_;
}

float MotorController::minLimitMm() const {
  return static_cast<float>(minLimitSteps_) / Config::kStepsPerMm;
}

float MotorController::maxLimitMm() const {
  return static_cast<float>(maxLimitSteps_) / Config::kStepsPerMm;
}

bool MotorController::endstopActive() const {
  const int value = digitalRead(Pins::kMotorEndstop);
  return Config::kEndstopActiveLow ? value == LOW : value == HIGH;
}

void MotorController::setEnabled(bool enabled) {
  if (!enabled || !stepGenerator_.ready()) {
    stop();
    enabled = false;
  }

  enabled_ = enabled;
  const bool pinLevel = Config::kMotorEnableActiveLow ? !enabled : enabled;
  digitalWrite(Pins::kMotorEnable, pinLevel ? HIGH : LOW);
}

bool MotorController::configureStallGuard(
    uint8_t threshold,
    uint32_t coolThreshold) {
  if (coolThreshold > kMaxTcoolthrs ||
      stallMotionMode_ != StallMotionMode::None || calibrationActive() ||
      motionActive()) {
    return false;
  }

  lockDriver();
  driver_.SGTHRS(threshold);
  driver_.TCOOLTHRS(coolThreshold);
  unlockDriver();
  return true;
}

bool MotorController::startStallTest(
    float velocityMmS,
    float maxTravelMm) {
  if (!enabled_ || velocityMmS == 0.0f || maxTravelMm <= 0.0f ||
      maxTravelMm > Config::kMaxStallTestTravelMm || motionActive() ||
      calibrationActive() ||
      fabsf(velocityMmS) > Config::kMaxStageSpeedMmS ||
      digitalRead(Pins::kMotorDiag) == HIGH) {
    return false;
  }

  const long maxTravelSteps =
      static_cast<long>(maxTravelMm * Config::kStepsPerMm);
  if (maxTravelSteps <= 0) {
    return false;
  }

  stopImmediately();
  motionEvent_ = MotorMotionEvent::None;
  stallTestStartSteps_ = positionSteps();
  stallTestMaxTravelSteps_ = maxTravelSteps;
  stallMotionMode_ = StallMotionMode::Test;
  applyStallGuardDriverProfile();
  startRampedVelocity(velocityMmS);
  requestStallGuardArm();
  return true;
}

bool MotorController::startAxisCalibration(float maxTravelMm) {
  if (!enabled_ || maxTravelMm <= 0.0f ||
      maxTravelMm > Config::kAxisCalibrationMaxTravelMm || motionActive() ||
      stallMotionMode_ != StallMotionMode::None || calibrationActive() ||
      fabsf(Config::kAxisCalibrationVelocityMmS) >
          Config::kMaxStageSpeedMmS ||
      digitalRead(Pins::kMotorDiag) == HIGH) {
    return false;
  }

  const long maxTravelSteps =
      static_cast<long>(maxTravelMm * Config::kStepsPerMm);
  const long backoffSteps = static_cast<long>(
      Config::kAxisCalibrationBackoffMm * Config::kStepsPerMm);
  if (maxTravelSteps <= 0 || backoffSteps <= 0) {
    return false;
  }

  stopImmediately();
  configureDriver();
  applyStallGuardDriverProfile();
  limitsValid_ = false;
  motionEvent_ = MotorMotionEvent::None;
  calibrationStartSteps_ = positionSteps();
  calibrationMaxTravelSteps_ = maxTravelSteps;
  calibrationBackoffSteps_ = backoffSteps;
  calibrationSeekMaxDiagIgnoreUntilMs_ = 0;
  calibrationMode_ = AxisCalibrationMode::SeekMin;
  setStallGuardThreshold(Config::kAxisCalibrationSeekMinSgthrs);
  startRampedVelocity(-fabsf(Config::kAxisCalibrationVelocityMmS));
  requestStallGuardArm();
  return true;
}

MotorMotionEvent MotorController::takeMotionEvent() {
  const MotorMotionEvent event = motionEvent_;
  motionEvent_ = MotorMotionEvent::None;
  return event;
}

TmcDriverDiagnostics MotorController::readDriverDiagnostics() {
  TmcDriverDiagnostics diagnostics;
  lockDriver();
  diagnostics.connection_result = driver_.test_connection();
  diagnostics.ifcnt = driver_.IFCNT();
  diagnostics.ioin = driver_.IOIN();
  diagnostics.version = driver_.version();
  diagnostics.drv_status = driver_.DRV_STATUS();
  diagnostics.rms_current_ma = driver_.rms_current();
  diagnostics.microsteps = driver_.microsteps();
  unlockDriver();
  return diagnostics;
}

TmcStallDiagnostics MotorController::readStallDiagnostics() {
  TmcStallDiagnostics diagnostics;
  lockDriver();
  diagnostics.sg_result = driver_.SG_RESULT();
  diagnostics.sg_threshold = driver_.SGTHRS();
  diagnostics.tstep = driver_.TSTEP();
  diagnostics.tcoolthrs = driver_.TCOOLTHRS();
  diagnostics.tpwmthrs = driver_.TPWMTHRS();
  diagnostics.drv_status = driver_.DRV_STATUS();
  diagnostics.spreadcycle_enabled = driver_.en_spreadCycle();
  unlockDriver();

  diagnostics.diag_pin = digitalRead(Pins::kMotorDiag) == HIGH;
  diagnostics.diag_interrupt_pending = diagInterruptPending_;
  diagnostics.stall_guard_armed = diagInterruptArmed_;
  diagnostics.stall_test_active =
      stallMotionMode_ == StallMotionMode::Test;
  diagnostics.enabled = enabled_;
  diagnostics.velocity_mode = velocityMode_;
  diagnostics.speed_mm_s =
      stepGenerator_.speedStepsPerSecond() / Config::kStepsPerMm;
  const float stallTravelMm =
      static_cast<float>(labs(positionSteps() - stallTestStartSteps_)) /
      Config::kStepsPerMm;
  diagnostics.stall_test_travel_mm =
      stallMotionMode_ == StallMotionMode::Test ? stallTravelMm : 0.0f;
  return diagnostics;
}

void IRAM_ATTR MotorController::handleDiagInterrupt() {
  if (diagInterruptArmed_) {
    diagInterruptPending_ = true;
  }
}

void MotorController::armStallGuard() {
  noInterrupts();
  diagInterruptPending_ = false;
  diagInterruptArmed_ = true;
  interrupts();
  stallGuardArmPending_ = false;
}

void MotorController::requestStallGuardArm() {
  disarmStallGuard();
  stallGuardArmPending_ = true;
}

void MotorController::armStallGuardIfReady() {
  if (!stallGuardArmPending_) {
    return;
  }

  const float requestedMagnitudeMmS = fabsf(targetVelocityMmS_);
  const float armVelocityMmS =
      fminf(requestedMagnitudeMmS, Config::kStallGuardArmVelocityMmS);
  const float hardwareVelocityMmS =
      fabsf(stepGenerator_.speedStepsPerSecond()) / Config::kStepsPerMm;
  if (hardwareVelocityMmS >= armVelocityMmS) {
    armStallGuard();
  }
}

void MotorController::disarmStallGuard() {
  noInterrupts();
  diagInterruptArmed_ = false;
  diagInterruptPending_ = false;
  interrupts();
  stallGuardArmPending_ = false;
}

void MotorController::cancelStallMotion() {
  const bool wasActive = stallMotionMode_ != StallMotionMode::None;
  stallMotionMode_ = StallMotionMode::None;
  disarmStallGuard();
  if (wasActive && !calibrationActive()) {
    applyNormalDriverProfile();
  }
}

void MotorController::startPositionMove(long targetSteps) {
  stopImmediately();
  targetPositionSteps_ = targetSteps;
  const long remainingSteps = targetPositionSteps_ - positionSteps();
  if (remainingSteps == 0) {
    return;
  }

  positionMoveDirection_ = remainingSteps > 0 ? 1 : -1;
  positionMoveActive_ = true;
  lastVelocityRampUs_ = micros();
}

void MotorController::startRampedVelocity(float velocityMmS) {
  velocityMode_ = true;
  positionMoveActive_ = false;
  targetVelocityMmS_ = velocityMmS;
  appliedVelocityMmS_ = 0.0f;
  lastVelocityRampUs_ = micros();
  stepGenerator_.stopImmediately();
}

void MotorController::setStallGuardThreshold(uint8_t threshold) {
  lockDriver();
  driver_.SGTHRS(threshold);
  unlockDriver();
}

void MotorController::applyNormalDriverProfile() {
  if (driverMotionProfile_ == DriverMotionProfile::Normal) {
    return;
  }

  lockDriver();
  driver_.en_spreadCycle(true);
  driverMotionProfile_ = DriverMotionProfile::Normal;
  unlockDriver();
}

void MotorController::applyStallGuardDriverProfile() {
  if (driverMotionProfile_ == DriverMotionProfile::StallGuard) {
    return;
  }

  lockDriver();
  driver_.en_spreadCycle(false);
  driverMotionProfile_ = DriverMotionProfile::StallGuard;
  unlockDriver();
}

void MotorController::cancelAxisCalibration() {
  const bool wasActive = calibrationActive();
  calibrationMode_ = AxisCalibrationMode::None;
  calibrationSeekMaxDiagIgnoreUntilMs_ = 0;
  disarmStallGuard();
  if (wasActive) {
    applyNormalDriverProfile();
  }
}

bool MotorController::serviceAxisCalibration() {
  if (!calibrationActive()) {
    return false;
  }

  if (calibrationMode_ == AxisCalibrationMode::SeekMin &&
      (endstopActive() || diagInterruptPending_)) {
    startCalibrationMinBackoff();
    return true;
  }

  if (calibrationMode_ == AxisCalibrationMode::SeekMax &&
      (endstopActive() || seekMaxDiagPending())) {
    startCalibrationMaxBackoff();
    return true;
  }

  if (positionMoveActive_) {
    servicePositionMove();
  } else if (velocityMode_) {
    serviceVelocityRamp();
  }

  if ((calibrationMode_ == AxisCalibrationMode::SeekMin ||
       calibrationMode_ == AxisCalibrationMode::SeekMax) &&
      labs(positionSteps() - calibrationStartSteps_) >=
          calibrationMaxTravelSteps_) {
    stopImmediately();
    cancelAxisCalibration();
    motionEvent_ = MotorMotionEvent::AxisCalibrationTravelLimit;
    return true;
  }

  if (calibrationMode_ == AxisCalibrationMode::BackoffMin &&
      !positionMoveActive_) {
    stopImmediately();
    stepGenerator_.setPositionSteps(0);
    minLimitSteps_ = 0;
    calibrationStartSteps_ = 0;
    calibrationMode_ = AxisCalibrationMode::SeekMax;
    setStallGuardThreshold(Config::kAxisCalibrationSeekMaxSgthrs);
    startRampedVelocity(fabsf(Config::kAxisCalibrationVelocityMmS));
    calibrationSeekMaxDiagIgnoreUntilMs_ =
        millis() + Config::kAxisCalibrationSeekMaxDiagIgnoreMs;
    motionEvent_ = MotorMotionEvent::AxisCalibrationMinSet;
    requestStallGuardArm();
    return true;
  }

  if (calibrationMode_ == AxisCalibrationMode::BackoffMax &&
      !positionMoveActive_) {
    stopImmediately();
    maxLimitSteps_ = positionSteps();
    limitsValid_ = maxLimitSteps_ > minLimitSteps_;
    if (!limitsValid_) {
      cancelAxisCalibration();
      motionEvent_ = MotorMotionEvent::AxisCalibrationTravelLimit;
      return true;
    }

    calibrationMode_ = AxisCalibrationMode::MoveCenter;
    startPositionMove((minLimitSteps_ + maxLimitSteps_) / 2);
    return true;
  }

  if (calibrationMode_ == AxisCalibrationMode::MoveCenter &&
      !positionMoveActive_) {
    stopImmediately();
    delay(100); // Allow time for the stage to settle before enabling stall guard
    applyNormalDriverProfile();
    calibrationMode_ = AxisCalibrationMode::None;
    motionEvent_ = MotorMotionEvent::AxisCalibrationComplete;
  }

  return true;
}

bool MotorController::seekMaxDiagPending() {
  if (static_cast<int32_t>(
          millis() - calibrationSeekMaxDiagIgnoreUntilMs_) < 0) {
    noInterrupts();
    diagInterruptPending_ = false;
    interrupts();
    return false;
  }

  return diagInterruptPending_;
}

void MotorController::startCalibrationMinBackoff() {
  stopImmediately();
  disarmStallGuard();
  calibrationMode_ = AxisCalibrationMode::BackoffMin;
  startPositionMove(positionSteps() + calibrationBackoffSteps_);
}

void MotorController::startCalibrationMaxBackoff() {
  stopImmediately();
  disarmStallGuard();
  calibrationMode_ = AxisCalibrationMode::BackoffMax;
  startPositionMove(positionSteps() - calibrationBackoffSteps_);
}

bool MotorController::enforceSoftwareLimits() {
  if (!limitsValid_ || calibrationActive()) {
    return false;
  }

  const long position = positionSteps();
  const bool movingTowardMin =
      appliedVelocityMmS_ < 0.0f ||
      (positionMoveActive_ && targetPositionSteps_ < position);
  const bool movingTowardMax =
      appliedVelocityMmS_ > 0.0f ||
      (positionMoveActive_ && targetPositionSteps_ > position);

  if (position <= minLimitSteps_ && movingTowardMin) {
    stopImmediately();
    stepGenerator_.setPositionSteps(minLimitSteps_);
    motionEvent_ = MotorMotionEvent::SoftwareLimitHit;
    return true;
  }

  if (position >= maxLimitSteps_ && movingTowardMax) {
    stopImmediately();
    stepGenerator_.setPositionSteps(maxLimitSteps_);
    motionEvent_ = MotorMotionEvent::SoftwareLimitHit;
    return true;
  }

  return false;
}

long MotorController::clampToSoftwareLimits(long steps) {
  if (limitsValid_) {
    if (steps < minLimitSteps_) {
      motionEvent_ = MotorMotionEvent::SoftwareLimitHit;
      return minLimitSteps_;
    }
    if (steps > maxLimitSteps_) {
      motionEvent_ = MotorMotionEvent::SoftwareLimitHit;
      return maxLimitSteps_;
    }
    return steps;
  }

  return steps < 0 ? 0 : steps;
}

void MotorController::serviceVelocityRamp() {
  applyRampedVelocity(targetVelocityMmS_);
}

void MotorController::servicePositionMove() {
  if (!positionMoveActive_) {
    return;
  }

  const long position = positionSteps();
  const long remainingSteps = targetPositionSteps_ - position;
  const bool reachedTarget =
      remainingSteps == 0 ||
      (positionMoveDirection_ > 0 && remainingSteps < 0) ||
      (positionMoveDirection_ < 0 && remainingSteps > 0);
  if (reachedTarget) {
    stopImmediately();
    return;
  }

  const float remainingMm =
      static_cast<float>(labs(remainingSteps)) / Config::kStepsPerMm;
  const float stoppingVelocityMmS =
      sqrtf(2.0f * Config::kMaxStageAccelMmS2 * remainingMm);
  const float maxMoveSpeedMmS =
      calibrationActive() ? fabsf(Config::kAxisCalibrationVelocityMmS)
                          : Config::kMaxStageSpeedMmS;
  const float desiredMagnitudeMmS =
      fminf(maxMoveSpeedMmS, stoppingVelocityMmS);
  const float desiredVelocityMmS =
      positionMoveDirection_ > 0 ? desiredMagnitudeMmS
                                 : -desiredMagnitudeMmS;
  applyRampedVelocity(desiredVelocityMmS);
}

void MotorController::applyRampedVelocity(float desiredVelocityMmS) {
  const uint32_t nowUs = micros();
  if (lastVelocityRampUs_ == 0) {
    lastVelocityRampUs_ = nowUs;
  }

  const uint32_t elapsedUs = nowUs - lastVelocityRampUs_;
  lastVelocityRampUs_ = nowUs;
  const float elapsedS =
      fminf(static_cast<float>(elapsedUs) / 1000000.0f, 0.1f);
  const float maxVelocityChange =
      Config::kMaxStageAccelMmS2 * elapsedS;

  if (appliedVelocityMmS_ < desiredVelocityMmS) {
    appliedVelocityMmS_ =
        fminf(appliedVelocityMmS_ + maxVelocityChange, desiredVelocityMmS);
  } else if (appliedVelocityMmS_ > desiredVelocityMmS) {
    appliedVelocityMmS_ =
        fmaxf(appliedVelocityMmS_ - maxVelocityChange, desiredVelocityMmS);
  }

  stepGenerator_.setSpeedStepsPerSecond(
      appliedVelocityMmS_ * Config::kStepsPerMm);
  armStallGuardIfReady();
}

void MotorController::stopImmediately() {
  stepGenerator_.stopImmediately();
  velocityMode_ = false;
  positionMoveActive_ = false;
  positionMoveDirection_ = 0;
  targetVelocityMmS_ = 0.0f;
  appliedVelocityMmS_ = 0.0f;
  lastVelocityRampUs_ = 0;
}

bool MotorController::motionActive() const {
  return velocityMode_ || positionMoveActive_;
}

void MotorController::lockDriver() {
  if (driverMutex_ != nullptr) {
    xSemaphoreTake(driverMutex_, portMAX_DELAY);
  }
}

void MotorController::unlockDriver() {
  if (driverMutex_ != nullptr) {
    xSemaphoreGive(driverMutex_);
  }
}
