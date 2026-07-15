// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include "devices/HardwareStepGenerator.h"

#include <math.h>

#include "AppConfig.h"

namespace {
constexpr int kPcntLowLimit = -30000;
constexpr int kPcntHighLimit = 30000;

bool succeeded(esp_err_t result) {
  return result == ESP_OK;
}
}  // namespace

bool HardwareStepGenerator::begin() {
  pinMode(Pins::kMotorDir, OUTPUT);
  digitalWrite(Pins::kMotorDir, Config::kMotorDirectionInverted ? HIGH : LOW);

  if (!configurePwm() || !configurePulseCounter()) {
    stopImmediately();
    return false;
  }

  ready_ = true;
  return true;
}

bool HardwareStepGenerator::setSpeedStepsPerSecond(float speedStepsPerSecond) {
  if (!ready_) {
    return false;
  }

  const float frequencyHz = fabsf(speedStepsPerSecond);
  const float minimumFrequencyHz =
      static_cast<float>(Config::kStepTimerResolutionHz) /
      static_cast<float>(Config::kStepTimerMaxPeriodTicks);
  if (frequencyHz < minimumFrequencyHz) {
    stopImmediately();
    return true;
  }

  const bool positive = speedStepsPerSecond > 0.0f;
  if (directionInitialized_ && positive != positiveDirection_ && !timerStopped_) {
    stopImmediately();
    return false;
  }

  if (timerStopRequested_ && !timerStopped_) {
    return false;
  }

  if (!setDirection(positive) || !updateFrequency(frequencyHz)) {
    stopImmediately();
    return false;
  }

  if (timerStopped_) {
    timerStopped_ = false;
    timerStopRequested_ = false;
    if (!succeeded(mcpwm_generator_set_force_level(generator_, -1, true)) ||
        !succeeded(mcpwm_timer_start_stop(timer_, MCPWM_TIMER_START_NO_STOP))) {
      timerStopped_ = true;
      mcpwm_generator_set_force_level(generator_, 0, true);
      return false;
    }
  }

  speedStepsPerSecond_ =
      positive ? static_cast<float>(Config::kStepTimerResolutionHz) /
                     roundf(static_cast<float>(Config::kStepTimerResolutionHz) /
                            frequencyHz)
               : -static_cast<float>(Config::kStepTimerResolutionHz) /
                     roundf(static_cast<float>(Config::kStepTimerResolutionHz) /
                            frequencyHz);
  return true;
}

void HardwareStepGenerator::stopImmediately() {
  speedStepsPerSecond_ = 0.0f;
  if (generator_ != nullptr) {
    mcpwm_generator_set_force_level(generator_, 0, true);
  }
  if (timer_ != nullptr && !timerStopped_ && !timerStopRequested_) {
    timerStopRequested_ =
        succeeded(mcpwm_timer_start_stop(timer_, MCPWM_TIMER_STOP_EMPTY));
  }
}

long HardwareStepGenerator::positionSteps() const {
  if (pulseCounter_ == nullptr) {
    return positionOffsetSteps_;
  }

  int count = 0;
  if (!succeeded(pcnt_unit_get_count(pulseCounter_, &count))) {
    return positionOffsetSteps_;
  }
  return positionOffsetSteps_ + static_cast<long>(count);
}

void HardwareStepGenerator::setPositionSteps(long position) {
  stopImmediately();
  if (pulseCounter_ != nullptr) {
    pcnt_unit_clear_count(pulseCounter_);
  }
  positionOffsetSteps_ = position;
}

float HardwareStepGenerator::speedStepsPerSecond() const {
  return speedStepsPerSecond_;
}

bool HardwareStepGenerator::ready() const {
  return ready_;
}

bool HardwareStepGenerator::handleTimerStopped(
    mcpwm_timer_handle_t,
    const mcpwm_timer_event_data_t*,
    void* userContext) {
  auto* generator = static_cast<HardwareStepGenerator*>(userContext);
  generator->timerStopped_ = true;
  generator->timerStopRequested_ = false;
  return false;
}

bool HardwareStepGenerator::configurePwm() {
  const mcpwm_timer_config_t timerConfig = {
      .group_id = 0,
      .clk_src = MCPWM_TIMER_CLK_SRC_DEFAULT,
      .resolution_hz = Config::kStepTimerResolutionHz,
      .count_mode = MCPWM_TIMER_COUNT_MODE_UP,
      .period_ticks = Config::kStepTimerMaxPeriodTicks,
      .intr_priority = 0,
      .flags =
          {
              .update_period_on_empty = true,
          },
  };
  if (!succeeded(mcpwm_new_timer(&timerConfig, &timer_))) {
    return false;
  }

  const mcpwm_timer_event_callbacks_t timerCallbacks = {
      .on_stop = handleTimerStopped,
  };
  if (!succeeded(
          mcpwm_timer_register_event_callbacks(timer_, &timerCallbacks, this))) {
    return false;
  }

  const mcpwm_operator_config_t operatorConfig = {
      .group_id = 0,
  };
  if (!succeeded(mcpwm_new_operator(&operatorConfig, &operator_)) ||
      !succeeded(mcpwm_operator_connect_timer(operator_, timer_))) {
    return false;
  }

  const mcpwm_comparator_config_t comparatorConfig = {
      .flags =
          {
              .update_cmp_on_tez = true,
          },
  };
  if (!succeeded(
          mcpwm_new_comparator(operator_, &comparatorConfig, &comparator_))) {
    return false;
  }

  const mcpwm_generator_config_t generatorConfig = {
      .gen_gpio_num = Pins::kMotorStep,
      .flags =
          {
              .io_loop_back = true,
          },
  };
  if (!succeeded(mcpwm_new_generator(operator_, &generatorConfig, &generator_)) ||
      !succeeded(mcpwm_generator_set_action_on_timer_event(
          generator_,
          MCPWM_GEN_TIMER_EVENT_ACTION(
              MCPWM_TIMER_DIRECTION_UP,
              MCPWM_TIMER_EVENT_EMPTY,
              MCPWM_GEN_ACTION_LOW))) ||
      !succeeded(mcpwm_generator_set_action_on_compare_event(
          generator_,
          MCPWM_GEN_COMPARE_EVENT_ACTION(
              MCPWM_TIMER_DIRECTION_UP,
              comparator_,
              MCPWM_GEN_ACTION_HIGH))) ||
      !succeeded(mcpwm_comparator_set_compare_value(
          comparator_, Config::kStepTimerMaxPeriodTicks / 2)) ||
      !succeeded(mcpwm_generator_set_force_level(generator_, 0, true)) ||
      !succeeded(mcpwm_timer_enable(timer_))) {
    return false;
  }

  return true;
}

bool HardwareStepGenerator::configurePulseCounter() {
  const pcnt_unit_config_t unitConfig = {
      .low_limit = kPcntLowLimit,
      .high_limit = kPcntHighLimit,
      .flags =
          {
              .accum_count = true,
          },
  };
  if (!succeeded(pcnt_new_unit(&unitConfig, &pulseCounter_))) {
    return false;
  }

  const pcnt_chan_config_t channelConfig = {
      .edge_gpio_num = Pins::kMotorStep,
      .level_gpio_num = Pins::kMotorDir,
  };
  if (!succeeded(
          pcnt_new_channel(pulseCounter_, &channelConfig, &pulseChannel_)) ||
      !succeeded(pcnt_channel_set_edge_action(
          pulseChannel_,
          PCNT_CHANNEL_EDGE_ACTION_INCREASE,
          PCNT_CHANNEL_EDGE_ACTION_HOLD))) {
    return false;
  }

  const pcnt_channel_level_action_t highAction =
      Config::kMotorDirectionInverted ? PCNT_CHANNEL_LEVEL_ACTION_INVERSE
                                      : PCNT_CHANNEL_LEVEL_ACTION_KEEP;
  const pcnt_channel_level_action_t lowAction =
      Config::kMotorDirectionInverted ? PCNT_CHANNEL_LEVEL_ACTION_KEEP
                                      : PCNT_CHANNEL_LEVEL_ACTION_INVERSE;
  if (!succeeded(
          pcnt_channel_set_level_action(pulseChannel_, highAction, lowAction)) ||
      !succeeded(pcnt_unit_add_watch_point(pulseCounter_, kPcntLowLimit)) ||
      !succeeded(pcnt_unit_add_watch_point(pulseCounter_, kPcntHighLimit)) ||
      !succeeded(pcnt_unit_enable(pulseCounter_)) ||
      !succeeded(pcnt_unit_clear_count(pulseCounter_)) ||
      !succeeded(pcnt_unit_start(pulseCounter_))) {
    return false;
  }

  return true;
}

bool HardwareStepGenerator::setDirection(bool positive) {
  if (directionInitialized_ && positive == positiveDirection_) {
    return true;
  }

  const bool pinHigh = positive != Config::kMotorDirectionInverted;
  digitalWrite(Pins::kMotorDir, pinHigh ? HIGH : LOW);
  delayMicroseconds(Config::kMotorDirectionSetupUs);
  positiveDirection_ = positive;
  directionInitialized_ = true;
  return true;
}

bool HardwareStepGenerator::updateFrequency(float frequencyHz) {
  const uint32_t periodTicks = constrain(
      static_cast<uint32_t>(
          lroundf(static_cast<float>(Config::kStepTimerResolutionHz) / frequencyHz)),
      2UL,
      Config::kStepTimerMaxPeriodTicks);
  const uint32_t compareTicks = max(1UL, periodTicks / 2);
  return succeeded(mcpwm_timer_set_period(timer_, periodTicks)) &&
         succeeded(
             mcpwm_comparator_set_compare_value(comparator_, compareTicks));
}
