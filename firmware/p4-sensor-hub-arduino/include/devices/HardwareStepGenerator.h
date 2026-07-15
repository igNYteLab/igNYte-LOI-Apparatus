// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>
#include <driver/mcpwm_prelude.h>
#include <driver/pulse_cnt.h>

class HardwareStepGenerator {
 public:
  bool begin();
  bool setSpeedStepsPerSecond(float speedStepsPerSecond);
  void stopImmediately();
  long positionSteps() const;
  void setPositionSteps(long position);
  float speedStepsPerSecond() const;
  bool ready() const;

 private:
  static bool handleTimerStopped(
      mcpwm_timer_handle_t timer,
      const mcpwm_timer_event_data_t* eventData,
      void* userContext);
  bool configurePwm();
  bool configurePulseCounter();
  bool setDirection(bool positive);
  bool updateFrequency(float frequencyHz);

  mcpwm_timer_handle_t timer_ = nullptr;
  mcpwm_oper_handle_t operator_ = nullptr;
  mcpwm_cmpr_handle_t comparator_ = nullptr;
  mcpwm_gen_handle_t generator_ = nullptr;
  pcnt_unit_handle_t pulseCounter_ = nullptr;
  pcnt_channel_handle_t pulseChannel_ = nullptr;
  volatile bool timerStopped_ = true;
  volatile bool timerStopRequested_ = false;
  bool ready_ = false;
  bool directionInitialized_ = false;
  bool positiveDirection_ = true;
  long positionOffsetSteps_ = 0;
  float speedStepsPerSecond_ = 0.0f;
};
