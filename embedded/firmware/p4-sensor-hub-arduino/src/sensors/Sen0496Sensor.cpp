// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include "sensors/Sen0496Sensor.h"

namespace {
constexpr uint8_t kOxygenDataRegister = 0x10;
}

Sen0496Sensor::Sen0496Sensor(const char* name, TwoWire& wire, uint16_t rateHz, uint8_t address)
    : SensorBase(name, rateHz), wire_(wire), address_(address) {}

bool Sen0496Sensor::begin() {
  wire_.beginTransmission(address_);
  return wire_.endTransmission() == 0;
}

bool Sen0496Sensor::read(JsonDocument& doc, uint64_t timestampUs) {
  uint8_t data[3] = {};
  if (!readRegister(kOxygenDataRegister, data, sizeof(data))) {
    return false;
  }

  const float oxygenVolPct =
      static_cast<float>(data[0]) + static_cast<float>(data[1]) / 10.0f +
      static_cast<float>(data[2]) / 100.0f;

  addBaseFields(doc, "oxygen", timestampUs);
  doc["o2_vol_pct"] = oxygenVolPct;
  return true;
}

bool Sen0496Sensor::readRegister(uint8_t reg, uint8_t* data, uint8_t len) {
  wire_.beginTransmission(address_);
  wire_.write(reg);
  if (wire_.endTransmission() != 0) {
    return false;
  }

  const uint8_t received = wire_.requestFrom(address_, len);
  if (received != len) {
    while (wire_.available() > 0) {
      wire_.read();
    }
    return false;
  }

  for (uint8_t i = 0; i < len; ++i) {
    data[i] = static_cast<uint8_t>(wire_.read());
  }
  return true;
}
