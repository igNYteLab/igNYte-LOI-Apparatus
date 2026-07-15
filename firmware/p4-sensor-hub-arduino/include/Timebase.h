// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>
#include "esp_timer.h"

inline uint64_t nowUs() {
  return static_cast<uint64_t>(esp_timer_get_time());
}
