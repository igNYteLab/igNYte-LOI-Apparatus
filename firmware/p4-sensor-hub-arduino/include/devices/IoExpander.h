// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Adafruit_MCP23X17.h>
#include <Arduino.h>
#include <Wire.h>

class IoExpander {
 public:
  bool begin(TwoWire& wire);
  bool setMotorMicrosteps(uint16_t microsteps);
  bool available() const;

 private:
  void setMotorMsPins(bool ms1High, bool ms2High);

  Adafruit_MCP23X17 mcp_;
  bool available_ = false;
};
