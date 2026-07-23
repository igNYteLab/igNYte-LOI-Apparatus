// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include "sensors/SensorBase.h"

class AnalogD6FSensor : public SensorBase {
 public:
  AnalogD6FSensor(const char* name, uint8_t pin, uint16_t rateHz);

  bool begin() override;
  bool read(JsonDocument& doc, uint64_t nowUs) override;

 private:
  float voltageToVelocity(float voltage) const;

  uint8_t pin_;
};
