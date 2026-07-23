// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include "sensors/Sht45Sensor.h"

Sht45Sensor::Sht45Sensor(const char* name, TwoWire& wire, uint16_t rateHz)
    : SensorBase(name, rateHz), wire_(wire) {}

bool Sht45Sensor::begin() {
  if (!sht_.begin(&wire_)) {
    return false;
  }

  sht_.setPrecision(SHT4X_HIGH_PRECISION);
  sht_.setHeater(SHT4X_NO_HEATER);
  return true;
}

bool Sht45Sensor::read(JsonDocument& doc, uint64_t timestampUs) {
  sensors_event_t humidity;
  sensors_event_t temp;
  if (!sht_.getEvent(&humidity, &temp)) {
    return false;
  }

  addBaseFields(doc, "environment", timestampUs);
  doc["temp_c"] = temp.temperature;
  doc["rh_pct"] = humidity.relative_humidity;
  return true;
}
