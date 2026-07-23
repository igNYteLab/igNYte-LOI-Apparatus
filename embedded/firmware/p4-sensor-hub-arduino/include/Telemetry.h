// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class Telemetry {
 public:
  static constexpr size_t kLineCapacity = 512;

  bool begin(size_t queueDepth);
  bool enqueue(JsonDocument& doc);
  void runTask();
  uint32_t droppedCount() const { return dropped_; }
  uint32_t oversizedCount() const { return oversized_; }

 private:
  struct Line {
    char text[kLineCapacity];
  };

  QueueHandle_t queue_ = nullptr;
  uint32_t dropped_ = 0;
  uint32_t oversized_ = 0;
};
