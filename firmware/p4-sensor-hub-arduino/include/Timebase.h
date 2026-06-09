#pragma once

#include <Arduino.h>
#include "esp_timer.h"

inline uint64_t nowUs() {
  return static_cast<uint64_t>(esp_timer_get_time());
}
