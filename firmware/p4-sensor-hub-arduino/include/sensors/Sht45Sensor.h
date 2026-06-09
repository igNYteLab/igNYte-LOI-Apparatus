#pragma once

#include <Adafruit_SHT4x.h>
#include "sensors/SensorBase.h"

class Sht45Sensor : public SensorBase {
 public:
  Sht45Sensor(const char* name, TwoWire& wire, uint16_t rateHz);

  bool begin() override;
  bool read(JsonDocument& doc, uint64_t nowUs) override;

 private:
  TwoWire& wire_;
  Adafruit_SHT4x sht_;
};
