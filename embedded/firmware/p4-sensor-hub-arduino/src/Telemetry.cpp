// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include "Telemetry.h"

bool Telemetry::begin(size_t queueDepth) {
  queue_ = xQueueCreate(queueDepth, sizeof(Line));
  return queue_ != nullptr;
}

bool Telemetry::enqueue(JsonDocument& doc) {
  if (queue_ == nullptr) {
    return false;
  }

  Line line{};
  const size_t required = measureJson(doc);
  if (required == 0 || required >= sizeof(line.text)) {
    ++oversized_;
    return false;
  }

  serializeJson(doc, line.text, sizeof(line.text));
  if (xQueueSend(queue_, &line, 0) != pdTRUE) {
    ++dropped_;
    return false;
  }

  return true;
}

void Telemetry::runTask() {
  Line line;
  for (;;) {
    if (xQueueReceive(queue_, &line, portMAX_DELAY) == pdTRUE) {
      Serial.println(line.text);
    }
  }
}
