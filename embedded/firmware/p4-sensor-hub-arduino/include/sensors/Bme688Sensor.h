// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Adafruit_BME680.h>
#include "sensors/SensorBase.h"

class Bme688Sensor : public SensorBase {
 public:
  Bme688Sensor(const char* name, TwoWire& wire, uint16_t rateHz, uint8_t address = 0x77);

  bool begin() override;
  bool read(JsonDocument& doc, uint64_t nowUs) override;
  bool startAsyncReading();
  bool asyncReadingReady() const;
  bool asyncReadingActive() const;
  bool finishAsyncReading(JsonDocument& doc, uint64_t nowUs);

 private:
  void addReadingFields(JsonDocument& doc, uint64_t nowUs);

  TwoWire& wire_;
  uint8_t address_;
  Adafruit_BME680 bme_;
  bool asyncReadingActive_ = false;
  uint32_t asyncReadyAtMs_ = 0;
};
