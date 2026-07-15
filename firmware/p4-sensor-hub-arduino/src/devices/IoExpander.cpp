// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include "devices/IoExpander.h"
#include "AppConfig.h"

bool IoExpander::begin(TwoWire& wire) {
  available_ = mcp_.begin_I2C(Addresses::kMcp23017, &wire);
  if (!available_) {
    return false;
  }

  mcp_.pinMode(ExpanderPins::kMotorMs1, OUTPUT);
  mcp_.pinMode(ExpanderPins::kMotorMs2, OUTPUT);
  return true;
}

bool IoExpander::setMotorMicrosteps(uint16_t microsteps) {
  if (!available_) {
    return false;
  }

  switch (microsteps) {
    case 8:
      setMotorMsPins(false, false);
      return true;
    case 16:
      setMotorMsPins(true, true);
      return true;
    case 32:
      setMotorMsPins(true, false);
      return true;
    case 64:
      setMotorMsPins(false, true);
      return true;
    default:
      return false;
  }
}

bool IoExpander::available() const {
  return available_;
}

void IoExpander::setMotorMsPins(bool ms1High, bool ms2High) {
  mcp_.digitalWrite(ExpanderPins::kMotorMs1, ms1High ? HIGH : LOW);
  mcp_.digitalWrite(ExpanderPins::kMotorMs2, ms2High ? HIGH : LOW);
}
