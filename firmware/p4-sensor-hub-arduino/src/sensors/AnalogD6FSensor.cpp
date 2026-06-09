#include "sensors/AnalogD6FSensor.h"

namespace {
constexpr float kVoltageTable[] = {0.50f, 0.70f, 1.11f, 1.58f, 2.00f};
constexpr float kVelocityTable[] = {0.00f, 0.75f, 1.50f, 2.25f, 3.00f};
constexpr size_t kTableSize = sizeof(kVoltageTable) / sizeof(kVoltageTable[0]);
}  // namespace

AnalogD6FSensor::AnalogD6FSensor(const char* name, uint8_t pin, uint16_t rateHz)
    : SensorBase(name, rateHz), pin_(pin) {}

bool AnalogD6FSensor::begin() {
  pinMode(pin_, INPUT);
#if defined(ARDUINO_ARCH_ESP32)
  analogSetPinAttenuation(pin_, ADC_11db);
#endif
  return true;
}

bool AnalogD6FSensor::read(JsonDocument& doc, uint64_t timestampUs) {
  const int raw = analogRead(pin_);
#if defined(ARDUINO_ARCH_ESP32)
  const uint32_t mv = analogReadMilliVolts(pin_);
#else
  const uint32_t mv = static_cast<uint32_t>((static_cast<float>(raw) / 4095.0f) * 3300.0f);
#endif
  const float voltage = static_cast<float>(mv) / 1000.0f;

  addBaseFields(doc, "analog", timestampUs);
  doc["raw_adc"] = raw;
  doc["voltage_v"] = voltage;
  doc["velocity_m_s"] = voltageToVelocity(voltage);
  return true;
}

float AnalogD6FSensor::voltageToVelocity(float voltage) const {
  if (voltage <= kVoltageTable[0]) {
    return kVelocityTable[0];
  }
  if (voltage >= kVoltageTable[kTableSize - 1]) {
    return kVelocityTable[kTableSize - 1];
  }

  for (size_t i = 1; i < kTableSize; ++i) {
    if (voltage <= kVoltageTable[i]) {
      const float x0 = kVoltageTable[i - 1];
      const float x1 = kVoltageTable[i];
      const float y0 = kVelocityTable[i - 1];
      const float y1 = kVelocityTable[i];
      const float ratio = (voltage - x0) / (x1 - x0);
      return y0 + ratio * (y1 - y0);
    }
  }

  return kVelocityTable[kTableSize - 1];
}
