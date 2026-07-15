// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>

#include "sensors/SensorBase.h"

class Sen0496Sensor : public SensorBase {
 public:
  Sen0496Sensor(const char* name, TwoWire& wire, uint16_t rateHz, uint8_t address);

  bool begin() override;
  bool read(JsonDocument& doc, uint64_t timestampUs) override;

 private:
  bool readRegister(uint8_t reg, uint8_t* data, uint8_t len);

  TwoWire& wire_;
  uint8_t address_;
};
