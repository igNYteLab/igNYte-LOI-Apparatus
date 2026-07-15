// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class Telemetry {
 public:
  void begin();
  void write(JsonDocument& doc);

 private:
  SemaphoreHandle_t mutex_ = nullptr;
};
