// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class SensorBase {
 public:
  SensorBase(const char* name, uint16_t rateHz);
  virtual ~SensorBase() = default;

  const char* name() const;
  uint16_t rateHz() const;
  void setRateHz(uint16_t rateHz);
  bool due(uint64_t nowUs) const;
  void markRead(uint64_t nowUs);

  virtual bool begin() = 0;
  virtual bool read(JsonDocument& doc, uint64_t nowUs) = 0;

 protected:
  void addBaseFields(JsonDocument& doc, const char* kind, uint64_t timestampUs) const;

 private:
  const char* name_;
  uint16_t rateHz_;
  uint64_t nextDueUs_ = 0;
};
