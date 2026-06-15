#include "devices/MotorController.h"
#include "AppConfig.h"

namespace {
constexpr float kRsenseOhms = 0.05f; // from Adafruit schematic for TMC2209
constexpr uint8_t kDriverAddress = 0b00;
}  // namespace

MotorController::MotorController(HardwareSerial& serial)
    : serial_(serial),
      driver_(&serial_, kRsenseOhms, kDriverAddress),
      stepper_(AccelStepper::DRIVER, Pins::kMotorStep, Pins::kMotorDir) {}

void MotorController::begin() {
  pinMode(Pins::kMotorEnable, OUTPUT);
  pinMode(Pins::kMotorDiag, INPUT);
  pinMode(Pins::kMotorIndex, INPUT);
  pinMode(Pins::kMotorEndstop, Config::kEndstopActiveLow ? INPUT_PULLUP : INPUT_PULLDOWN);

  setEnable(false);
  serial_.begin(Config::kTmcBaud, SERIAL_8N1, Pins::kTmcUart, Pins::kTmcUart);

  driver_.begin();
  driver_.pdn_disable(true);
  driver_.I_scale_analog(false);
  driver_.rms_current(600);
  driver_.microsteps(Config::kMicrosteps);
  driver_.toff(5);
  driver_.en_spreadCycle(false);
  driver_.pwm_autoscale(true);

  stepper_.setMaxSpeed(Config::kMaxStageSpeedMmS * Config::kStepsPerMm);
  stepper_.setAcceleration(Config::kMaxStageAccelMmS2 * Config::kStepsPerMm);
  setEnable(true);
}

void MotorController::service() {
  if (endstopActive() && stepper_.speed() < 0.0f) {
    stepper_.setCurrentPosition(0);
    stepper_.stop();
    velocityMode_ = false;
    return;
  }

  if (velocityMode_) {
    stepper_.runSpeed();
  } else {
    stepper_.run();
  }
}

void MotorController::stop() {
  velocityMode_ = false;
  stepper_.stop();
}

void MotorController::moveToSteps(long steps) {
  velocityMode_ = false;
  if (steps < 0) {
    steps = 0;
  }
  stepper_.moveTo(steps);
}

void MotorController::moveToMm(float mm) {
  moveToSteps(static_cast<long>(mm * Config::kStepsPerMm));
}

void MotorController::setVelocityMmS(float velocityMmS) {
  velocityMode_ = true;
  stepper_.setSpeed(velocityMmS * Config::kStepsPerMm);
}

void MotorController::homeHere() {
  stepper_.setCurrentPosition(0);
}

long MotorController::positionSteps() {
  return stepper_.currentPosition();
}

float MotorController::positionMm() {
  return static_cast<float>(positionSteps()) / Config::kStepsPerMm;
}

bool MotorController::endstopActive() const {
  const int value = digitalRead(Pins::kMotorEndstop);
  return Config::kEndstopActiveLow ? value == LOW : value == HIGH;
}

void MotorController::setEnable(bool enabled) {
  const bool pinLevel = Config::kMotorEnableActiveLow ? !enabled : enabled;
  digitalWrite(Pins::kMotorEnable, pinLevel ? HIGH : LOW);
}
