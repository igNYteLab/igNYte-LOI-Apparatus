#pragma once

#include <AccelStepper.h>
#include <Arduino.h>
#include <TMCStepper.h>

class MotorController {
 public:
  explicit MotorController(HardwareSerial& serial);

  void begin();
  void service();
  void stop();
  void moveToSteps(long steps);
  void moveToMm(float mm);
  void setVelocityMmS(float velocityMmS);
  void homeHere();
  long positionSteps();
  float positionMm();

 private:
  bool endstopActive() const;
  void setEnable(bool enabled);

  HardwareSerial& serial_;
  TMC2209Stepper driver_;
  AccelStepper stepper_;
  bool velocityMode_ = false;
};
