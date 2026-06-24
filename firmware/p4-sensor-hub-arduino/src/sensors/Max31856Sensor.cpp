#include "sensors/Max31856Sensor.h"

Max31856Sensor::Max31856Sensor(const char* name, uint8_t csPin, uint16_t rateHz)
    : SensorBase(name, rateHz), csPin_(csPin), thermocouple_(csPin) {}

bool Max31856Sensor::begin() {
  pinMode(csPin_, OUTPUT);
  digitalWrite(csPin_, HIGH);

  if (!thermocouple_.begin()) {
    return false;
  }

  thermocouple_.setThermocoupleType(MAX31856_TCTYPE_K);
  thermocouple_.setConversionMode(MAX31856_CONTINUOUS);
  return true;
}

bool Max31856Sensor::read(JsonDocument& doc, uint64_t timestampUs) {
  const float thermocoupleTempC = thermocouple_.readThermocoupleTemperature();
  const float coldJunctionTempC = thermocouple_.readCJTemperature();
  const uint8_t fault = thermocouple_.readFault();

  addBaseFields(doc, "thermocouple", timestampUs);
  doc["temp_c"] = thermocoupleTempC;
  doc["cold_junction_c"] = coldJunctionTempC;
  doc["fault"] = fault;
  doc["valid"] = fault == 0;
  return fault == 0;
}
