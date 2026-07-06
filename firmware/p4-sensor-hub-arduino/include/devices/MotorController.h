#pragma once

#include <AccelStepper.h>
#include <Arduino.h>
#include <TMCStepper.h>
#include <freertos/semphr.h>

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
  bool stall_home_active = false;
  bool stall_home_backing_off = false;
  bool spreadcycle_enabled = false;
  bool enabled = false;
  bool velocity_mode = false;
  float speed_mm_s = 0.0f;
  float stall_test_travel_mm = 0.0f;
  float stall_home_travel_mm = 0.0f;
};

enum class MotorMotionEvent {
  None,
  StallDetected,
  StallTestTravelLimit,
  StallTestEndstop,
  StallHomeComplete,
  StallHomeCompleteEndstop,
  StallHomeTravelLimit,
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
  void moveToSteps(long steps);
  void moveToMm(float mm);
  void setVelocityMmS(float velocityMmS);
  void homeHere();
  long positionSteps();
  float positionMm();
  bool endstopActive() const;
  bool enabled() const;
  bool velocityMode() const;
  bool calibrationActive() const;
  bool limitsValid() const;
  float minLimitMm() const;
  float maxLimitMm() const;
  void setEnabled(bool enabled);
  void configureDriver();
  bool configureStallGuard(uint8_t threshold, uint32_t coolThreshold);
  bool startStallTest(float velocityMmS, float maxTravelMm);
  bool startStallHome(float maxTravelMm);
  bool startAxisCalibration(float maxTravelMm);
  MotorMotionEvent takeMotionEvent();
  TmcDriverDiagnostics readDriverDiagnostics();
  TmcStallDiagnostics readStallDiagnostics();

 private:
  static void IRAM_ATTR handleDiagInterrupt();
  void armStallGuard();
  void disarmStallGuard();
  void cancelStallMotion();
  void startHomeBackoff(bool endstopTriggered);
  bool stallHomeActive() const;
  void setStallGuardThreshold(uint8_t threshold);
  void cancelAxisCalibration();
  bool serviceAxisCalibration();
  bool seekMaxDiagPending();
  void startCalibrationMinBackoff();
  void startCalibrationMaxBackoff();
  bool enforceSoftwareLimits();
  long clampToSoftwareLimits(long steps);
  void stopImmediately();
  void lockDriver();
  void unlockDriver();

  static volatile bool diagInterruptArmed_;
  static volatile bool diagInterruptPending_;

  enum class StallMotionMode {
    None,
    Test,
    HomeSeek,
    HomeBackoff,
  };

  enum class AxisCalibrationMode {
    None,
    SeekMin,
    BackoffMin,
    SeekMax,
    BackoffMax,
    MoveCenter,
  };

  HardwareSerial& serial_;
  TMC2209Stepper driver_;
  AccelStepper stepper_;
  SemaphoreHandle_t driverMutex_ = nullptr;
  bool velocityMode_ = false;
  bool enabled_ = false;
  StallMotionMode stallMotionMode_ = StallMotionMode::None;
  AxisCalibrationMode calibrationMode_ = AxisCalibrationMode::None;
  long stallTestStartSteps_ = 0;
  long stallTestMaxTravelSteps_ = 0;
  long stallHomeBackoffSteps_ = 0;
  bool stallHomeEndstopTriggered_ = false;
  long calibrationStartSteps_ = 0;
  long calibrationMaxTravelSteps_ = 0;
  long calibrationBackoffSteps_ = 0;
  uint32_t calibrationSeekMaxDiagIgnoreUntilMs_ = 0;
  bool limitsValid_ = false;
  long minLimitSteps_ = 0;
  long maxLimitSteps_ = 0;
  MotorMotionEvent motionEvent_ = MotorMotionEvent::None;
};
