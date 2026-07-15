// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>
#include <TMCStepper.h>
#include <freertos/semphr.h>

#include "devices/HardwareStepGenerator.h"

struct TmcDriverDiagnostics {
  uint8_t connection_result = 0;
  uint8_t ifcnt = 0;
  uint32_t ioin = 0;
  uint8_t version = 0;
  uint32_t drv_status = 0;
  uint16_t rms_current_ma = 0;
  uint16_t microsteps = 0;
};

struct TmcStallDiagnostics {
  uint16_t sg_result = 0;
  uint8_t sg_threshold = 0;
  uint32_t tstep = 0;
  uint32_t tcoolthrs = 0;
  uint32_t tpwmthrs = 0;
  uint32_t drv_status = 0;
  bool diag_pin = false;
  bool diag_interrupt_pending = false;
  bool stall_guard_armed = false;
  bool stall_test_active = false;
  bool spreadcycle_enabled = false;
  bool enabled = false;
  bool velocity_mode = false;
  float speed_mm_s = 0.0f;
  float stall_test_travel_mm = 0.0f;
};

enum class MotorMotionEvent {
  None,
  StallDetected,
  StallTestTravelLimit,
  StallTestEndstop,
  AxisCalibrationMinSet,
  AxisCalibrationComplete,
  AxisCalibrationTravelLimit,
  SoftwareLimitHit,
  CalibrationIncomplete,
};

class MotorController {
 public:
  explicit MotorController(HardwareSerial& serial);

  void begin();
  void service();
  void stop();
  void moveToMm(float mm);
  void setVelocityMmS(float velocityMmS);
  void homeHere();
  long positionSteps();
  float positionMm();
  bool endstopActive() const;
  bool enabled() const;
  bool stepGeneratorReady() const;
  bool velocityMode() const;
  bool calibrationActive() const;
  bool limitsValid() const;
  float minLimitMm() const;
  float maxLimitMm() const;
  void setEnabled(bool enabled);
  void configureDriver();
  bool configureStallGuard(uint8_t threshold, uint32_t coolThreshold);
  bool startStallTest(float velocityMmS, float maxTravelMm);
  bool startAxisCalibration(float maxTravelMm);
  MotorMotionEvent takeMotionEvent();
  TmcDriverDiagnostics readDriverDiagnostics();
  TmcStallDiagnostics readStallDiagnostics();

 private:
  static void IRAM_ATTR handleDiagInterrupt();
  void armStallGuard();
  void requestStallGuardArm();
  void armStallGuardIfReady();
  void disarmStallGuard();
  void cancelStallMotion();
  void moveToSteps(long steps);
  void startPositionMove(long targetSteps);
  void startRampedVelocity(float velocityMmS);
  void setStallGuardThreshold(uint8_t threshold);
  void applyNormalDriverProfile();
  void applyStallGuardDriverProfile();
  void cancelAxisCalibration();
  bool serviceAxisCalibration();
  bool seekMaxDiagPending();
  void startCalibrationMinBackoff();
  void startCalibrationMaxBackoff();
  bool enforceSoftwareLimits();
  long clampToSoftwareLimits(long steps);
  void serviceVelocityRamp();
  void servicePositionMove();
  void applyRampedVelocity(float desiredVelocityMmS);
  void stopImmediately();
  bool motionActive() const;
  void lockDriver();
  void unlockDriver();

  static volatile bool diagInterruptArmed_;
  static volatile bool diagInterruptPending_;

  enum class StallMotionMode {
    None,
    Test,
  };

  enum class AxisCalibrationMode {
    None,
    SeekMin,
    BackoffMin,
    SeekMax,
    BackoffMax,
    MoveCenter,
  };

  enum class DriverMotionProfile {
    Normal,
    StallGuard,
  };

  HardwareSerial& serial_;
  TMC2209Stepper driver_;
  HardwareStepGenerator stepGenerator_;
  SemaphoreHandle_t driverMutex_ = nullptr;
  bool velocityMode_ = false;
  bool positionMoveActive_ = false;
  int8_t positionMoveDirection_ = 0;
  long targetPositionSteps_ = 0;
  float targetVelocityMmS_ = 0.0f;
  float appliedVelocityMmS_ = 0.0f;
  uint32_t lastVelocityRampUs_ = 0;
  bool enabled_ = false;
  bool stallGuardArmPending_ = false;
  DriverMotionProfile driverMotionProfile_ = DriverMotionProfile::Normal;
  StallMotionMode stallMotionMode_ = StallMotionMode::None;
  AxisCalibrationMode calibrationMode_ = AxisCalibrationMode::None;
  long stallTestStartSteps_ = 0;
  long stallTestMaxTravelSteps_ = 0;
  long calibrationStartSteps_ = 0;
  long calibrationMaxTravelSteps_ = 0;
  long calibrationBackoffSteps_ = 0;
  uint32_t calibrationSeekMaxDiagIgnoreUntilMs_ = 0;
  bool limitsValid_ = false;
  long minLimitSteps_ = 0;
  long maxLimitSteps_ = 0;
  MotorMotionEvent motionEvent_ = MotorMotionEvent::None;
};
