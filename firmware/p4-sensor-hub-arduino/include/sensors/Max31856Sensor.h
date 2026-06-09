#pragma once

#include <Adafruit_MAX31856.h>
#include "sensors/SensorBase.h"

class Max31856Sensor : public SensorBase {
 public:
  Max31856Sensor(const char* name, uint8_t csPin, uint16_t rateHz);

  bool begin() override;
  bool read(JsonDocument& doc, uint64_t nowUs) override;

 private:
  uint8_t csPin_;
  Adafruit_MAX31856 thermocouple_;
};
