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
