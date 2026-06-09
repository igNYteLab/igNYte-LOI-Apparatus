#include "Telemetry.h"

void Telemetry::begin() {
  mutex_ = xSemaphoreCreateMutex();
}

void Telemetry::write(JsonDocument& doc) {
  if (mutex_ != nullptr) {
    xSemaphoreTake(mutex_, portMAX_DELAY);
  }

  serializeJson(doc, Serial);
  Serial.println();

  if (mutex_ != nullptr) {
    xSemaphoreGive(mutex_);
  }
}
