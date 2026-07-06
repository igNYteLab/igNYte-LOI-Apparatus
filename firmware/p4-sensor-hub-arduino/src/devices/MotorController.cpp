#include "devices/MotorController.h"
#include "AppConfig.h"

namespace {
constexpr float kRsenseOhms = 0.05f;  // from Adafruit schematic for TMC2209
constexpr uint8_t kDriverAddress = 0b00;
constexpr uint16_t kMotorCurrentMa = 600;
constexpr uint32_t kMaxTcoolthrs = 0xFFFFF;
}  // namespace

volatile bool MotorController::diagInterruptArmed_ = false;
volatile bool MotorController::diagInterruptPending_ = false;

MotorController::MotorController(HardwareSerial& serial)
    : serial_(serial),
      driver_(&serial_, kRsenseOhms, kDriverAddress),
      stepper_(AccelStepper::DRIVER, Pins::kMotorStep, Pins::kMotorDir) {}

void MotorController::begin() {
  pinMode(Pins::kMotorEnable, OUTPUT);
  pinMode(Pins::kMotorDiag, INPUT);
  pinMode(Pins::kMotorIndex, INPUT);
  pinMode(Pins::kMotorEndstop, Config::kEndstopActiveLow ? INPUT_PULLUP : INPUT_PULLDOWN);

  driverMutex_ = xSemaphoreCreateMutex();
  attachInterrupt(digitalPinToInterrupt(Pins::kMotorDiag), handleDiagInterrupt, RISING);

  setEnabled(false);
  serial_.begin(Config::kTmcBaud, SERIAL_8N1, Pins::kTmcUartRx, Pins::kTmcUartTx);

  configureDriver();
  stepper_.setPinsInverted(Config::kMotorDirectionInverted, false, false);
  stepper_.setMaxSpeed(Config::kMaxStageSpeedMmS * Config::kStepsPerMm);
  stepper_.setAcceleration(Config::kMaxStageAccelMmS2 * Config::kStepsPerMm);
  setEnabled(false);
}

void MotorController::configureDriver() {
  stopImmediately();
  cancelStallMotion();
  cancelAxisCalibration();

  lockDriver();
  driver_.begin();
  driver_.pdn_disable(true);
  driver_.mstep_reg_select(true);
  driver_.I_scale_analog(false);
  driver_.rms_current(kMotorCurrentMa);
  driver_.microsteps(Config::kMicrosteps);
  driver_.toff(5);
  driver_.en_spreadCycle(false);
  driver_.pwm_autoscale(true);
  driver_.TPWMTHRS(0);
  driver_.TCOOLTHRS(Config::kStallGuardCoolThreshold);
  driver_.SGTHRS(Config::kStallGuardThreshold);
  unlockDriver();
}

void MotorController::service() {
  if (!enabled_) {
    return;
  }

  if (serviceAxisCalibration()) {
    return;
  }

  if (enforceSoftwareLimits()) {
    return;
  }

  if (endstopActive() && stepper_.speed() < 0.0f) {
    const StallMotionMode mode = stallMotionMode_;
    stepper_.setCurrentPosition(0);
    stopImmediately();
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

  if (velocityMode_) {
    stepper_.runSpeed();
  } else {
    stepper_.run();
  }

  if (enforceSoftwareLimits()) {
    return;
  }

  if (stallMotionMode_ == StallMotionMode::Test &&
      labs(stepper_.currentPosition() - stallTestStartSteps_) >= stallTestMaxTravelSteps_) {
    stopImmediately();
    cancelStallMotion();
    motionEvent_ = MotorMotionEvent::StallTestTravelLimit;
    return;
  }
}

void MotorController::stop() {
  cancelStallMotion();
  cancelAxisCalibration();
  velocityMode_ = false;
  stopImmediately();
}

void MotorController::moveToSteps(long steps) {
  if (!limitsValid_) {
    motionEvent_ = MotorMotionEvent::CalibrationIncomplete;
    return;
  }
  cancelStallMotion();
  cancelAxisCalibration();
  velocityMode_ = false;
  stepper_.moveTo(clampToSoftwareLimits(steps));
}

void MotorController::moveToMm(float mm) {
  moveToSteps(static_cast<long>(mm * Config::kStepsPerMm));
}

void MotorController::setVelocityMmS(float velocityMmS) {
  if (!limitsValid_) {
    motionEvent_ = MotorMotionEvent::CalibrationIncomplete;
    return;
  }
  cancelStallMotion();
  cancelAxisCalibration();
  if (limitsValid_) {
    const long position = stepper_.currentPosition();
    if ((velocityMmS < 0.0f && position <= minLimitSteps_) ||
        (velocityMmS > 0.0f && position >= maxLimitSteps_)) {
      stopImmediately();
      motionEvent_ = MotorMotionEvent::SoftwareLimitHit;
      return;
    }
  }
  velocityMode_ = true;
  stepper_.setSpeed(velocityMmS * Config::kStepsPerMm);
}

void MotorController::homeHere() {
  cancelStallMotion();
  cancelAxisCalibration();
  limitsValid_ = false;
  stepper_.setCurrentPosition(0);
}

long MotorController::positionSteps() {
  return stepper_.currentPosition();
}

float MotorController::positionMm() {
  return static_cast<float>(positionSteps()) / Config::kStepsPerMm;
}

bool MotorController::enabled() const {
  return enabled_;
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
  if (!enabled) {
    stop();
  }

  enabled_ = enabled;
  const bool pinLevel = Config::kMotorEnableActiveLow ? !enabled : enabled;
  digitalWrite(Pins::kMotorEnable, pinLevel ? HIGH : LOW);
}

bool MotorController::configureStallGuard(uint8_t threshold, uint32_t coolThreshold) {
  if (coolThreshold > kMaxTcoolthrs || stallMotionMode_ != StallMotionMode::None ||
      calibrationActive() || velocityMode_ ||
      stepper_.distanceToGo() != 0) {
    return false;
  }

  lockDriver();
  driver_.SGTHRS(threshold);
  driver_.TCOOLTHRS(coolThreshold);
  unlockDriver();
  return true;
}

bool MotorController::startStallTest(float velocityMmS, float maxTravelMm) {
  if (!enabled_ || velocityMmS == 0.0f || maxTravelMm <= 0.0f ||
      maxTravelMm > Config::kMaxStallTestTravelMm || velocityMode_ ||
      calibrationActive() || stepper_.distanceToGo() != 0 ||
      fabsf(velocityMmS) > Config::kMaxStageSpeedMmS ||
      digitalRead(Pins::kMotorDiag) == HIGH) {
    return false;
  }

  const long maxTravelSteps = static_cast<long>(maxTravelMm * Config::kStepsPerMm);
  if (maxTravelSteps <= 0) {
    return false;
  }

  stopImmediately();
  motionEvent_ = MotorMotionEvent::None;
  stallTestStartSteps_ = stepper_.currentPosition();
  stallTestMaxTravelSteps_ = maxTravelSteps;
  stallMotionMode_ = StallMotionMode::Test;
  velocityMode_ = true;
  stepper_.setSpeed(velocityMmS * Config::kStepsPerMm);
  armStallGuard();
  return true;
}

bool MotorController::startAxisCalibration(float maxTravelMm) {
  if (!enabled_ || maxTravelMm <= 0.0f ||
      maxTravelMm > Config::kAxisCalibrationMaxTravelMm || velocityMode_ ||
      stallMotionMode_ != StallMotionMode::None || calibrationActive() ||
      stepper_.distanceToGo() != 0 || fabsf(Config::kAxisCalibrationVelocityMmS) >
                                       Config::kMaxStageSpeedMmS ||
      digitalRead(Pins::kMotorDiag) == HIGH) {
    return false;
  }

  const long maxTravelSteps = static_cast<long>(maxTravelMm * Config::kStepsPerMm);
  const long backoffSteps =
      static_cast<long>(Config::kAxisCalibrationBackoffMm * Config::kStepsPerMm);
  if (maxTravelSteps <= 0 || backoffSteps <= 0) {
    return false;
  }

  stopImmediately();
  limitsValid_ = false;
  motionEvent_ = MotorMotionEvent::None;
  calibrationStartSteps_ = stepper_.currentPosition();
  calibrationMaxTravelSteps_ = maxTravelSteps;
  calibrationBackoffSteps_ = backoffSteps;
  calibrationSeekMaxDiagIgnoreUntilMs_ = 0;
  calibrationMode_ = AxisCalibrationMode::SeekMin;
  velocityMode_ = true;
  setStallGuardThreshold(Config::kAxisCalibrationSeekMinSgthrs);
  stepper_.setSpeed(-fabsf(Config::kAxisCalibrationVelocityMmS) * Config::kStepsPerMm);
  armStallGuard();
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
  diagnostics.stall_test_active = stallMotionMode_ == StallMotionMode::Test;
  diagnostics.enabled = enabled_;
  diagnostics.velocity_mode = velocityMode_;
  diagnostics.speed_mm_s = stepper_.speed() / Config::kStepsPerMm;
  const float stallTravelMm =
      static_cast<float>(labs(stepper_.currentPosition() - stallTestStartSteps_)) /
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
}

void MotorController::disarmStallGuard() {
  noInterrupts();
  diagInterruptArmed_ = false;
  diagInterruptPending_ = false;
  interrupts();
}

void MotorController::cancelStallMotion() {
  stallMotionMode_ = StallMotionMode::None;
  disarmStallGuard();
}

void MotorController::setStallGuardThreshold(uint8_t threshold) {
  lockDriver();
  driver_.SGTHRS(threshold);
  unlockDriver();
}

void MotorController::cancelAxisCalibration() {
  calibrationMode_ = AxisCalibrationMode::None;
  calibrationSeekMaxDiagIgnoreUntilMs_ = 0;
  disarmStallGuard();
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

  if (velocityMode_) {
    stepper_.runSpeed();
  } else {
    stepper_.run();
  }

  if ((calibrationMode_ == AxisCalibrationMode::SeekMin ||
       calibrationMode_ == AxisCalibrationMode::SeekMax) &&
      labs(stepper_.currentPosition() - calibrationStartSteps_) >=
          calibrationMaxTravelSteps_) {
    stopImmediately();
    cancelAxisCalibration();
    motionEvent_ = MotorMotionEvent::AxisCalibrationTravelLimit;
    return true;
  }

  if (calibrationMode_ == AxisCalibrationMode::BackoffMin &&
      stepper_.distanceToGo() == 0) {
    stopImmediately();
    stepper_.setCurrentPosition(0);
    minLimitSteps_ = 0;
    calibrationStartSteps_ = 0;
    calibrationMode_ = AxisCalibrationMode::SeekMax;
    velocityMode_ = true;
    setStallGuardThreshold(Config::kAxisCalibrationSeekMaxSgthrs);
    stepper_.setSpeed(fabsf(Config::kAxisCalibrationVelocityMmS) * Config::kStepsPerMm);
    calibrationSeekMaxDiagIgnoreUntilMs_ =
        millis() + Config::kAxisCalibrationSeekMaxDiagIgnoreMs;
    motionEvent_ = MotorMotionEvent::AxisCalibrationMinSet;
    armStallGuard();
    return true;
  }

  if (calibrationMode_ == AxisCalibrationMode::BackoffMax &&
      stepper_.distanceToGo() == 0) {
    stopImmediately();
    maxLimitSteps_ = stepper_.currentPosition();
    limitsValid_ = maxLimitSteps_ > minLimitSteps_;
    if (!limitsValid_) {
      cancelAxisCalibration();
      motionEvent_ = MotorMotionEvent::AxisCalibrationTravelLimit;
      return true;
    }

    calibrationMode_ = AxisCalibrationMode::MoveCenter;
    velocityMode_ = false;
    stepper_.moveTo((minLimitSteps_ + maxLimitSteps_) / 2);
    return true;
  }

  if (calibrationMode_ == AxisCalibrationMode::MoveCenter &&
      stepper_.distanceToGo() == 0) {
    stopImmediately();
    calibrationMode_ = AxisCalibrationMode::None;
    motionEvent_ = MotorMotionEvent::AxisCalibrationComplete;
    return true;
  }

  return true;
}

bool MotorController::seekMaxDiagPending() {
  if (static_cast<int32_t>(millis() - calibrationSeekMaxDiagIgnoreUntilMs_) < 0) {
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
  velocityMode_ = false;
  calibrationMode_ = AxisCalibrationMode::BackoffMin;
  stepper_.move(calibrationBackoffSteps_);
}

void MotorController::startCalibrationMaxBackoff() {
  stopImmediately();
  disarmStallGuard();
  velocityMode_ = false;
  calibrationMode_ = AxisCalibrationMode::BackoffMax;
  stepper_.move(-calibrationBackoffSteps_);
}

bool MotorController::enforceSoftwareLimits() {
  if (!limitsValid_ || calibrationActive()) {
    return false;
  }

  const long position = stepper_.currentPosition();
  const bool movingTowardMin =
      stepper_.speed() < 0.0f || (!velocityMode_ && stepper_.distanceToGo() < 0);
  const bool movingTowardMax =
      stepper_.speed() > 0.0f || (!velocityMode_ && stepper_.distanceToGo() > 0);

  if (position <= minLimitSteps_ && movingTowardMin) {
    stopImmediately();
    stepper_.setCurrentPosition(minLimitSteps_);
    motionEvent_ = MotorMotionEvent::SoftwareLimitHit;
    return true;
  }

  if (position >= maxLimitSteps_ && movingTowardMax) {
    stopImmediately();
    stepper_.setCurrentPosition(maxLimitSteps_);
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

  if (steps < 0) {
    return 0;
  }
  return steps;
}

void MotorController::stopImmediately() {
  velocityMode_ = false;
  stepper_.setCurrentPosition(stepper_.currentPosition());
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
