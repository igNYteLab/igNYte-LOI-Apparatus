#pragma once

#include <Adafruit_BME680.h>
#include "sensors/SensorBase.h"

class Bme688Sensor : public SensorBase {
 public:
  Bme688Sensor(const char* name, TwoWire& wire, uint16_t rateHz, uint8_t address = 0x77);

  bool begin() override;
  bool read(JsonDocument& doc, uint64_t nowUs) override;

 private:
  TwoWire& wire_;
  uint8_t address_;
  Adafruit_BME680 bme_;
};
