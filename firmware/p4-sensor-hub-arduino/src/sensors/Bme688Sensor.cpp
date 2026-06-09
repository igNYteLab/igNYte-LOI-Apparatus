#include "sensors/Bme688Sensor.h"

Bme688Sensor::Bme688Sensor(const char* name, TwoWire& wire, uint16_t rateHz, uint8_t address)
    : SensorBase(name, rateHz), wire_(wire), address_(address) {}

bool Bme688Sensor::begin() {
  if (!bme_.begin(address_, &wire_)) {
    return false;
  }

  bme_.setTemperatureOversampling(BME680_OS_8X);
  bme_.setHumidityOversampling(BME680_OS_2X);
  bme_.setPressureOversampling(BME680_OS_4X);
  bme_.setIIRFilterSize(BME680_FILTER_SIZE_3);
  bme_.setGasHeater(320, 150);
  return true;
}

bool Bme688Sensor::read(JsonDocument& doc, uint64_t timestampUs) {
  if (!bme_.performReading()) {
    return false;
  }

  addBaseFields(doc, "environment", timestampUs);
  doc["temp_c"] = bme_.temperature;
  doc["pressure_hpa"] = bme_.pressure / 100.0f;
  doc["rh_pct"] = bme_.humidity;
  doc["gas_kohm"] = bme_.gas_resistance / 1000.0f;
  return true;
}
