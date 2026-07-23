// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include "sensors/SensorBase.h"

SensorBase::SensorBase(const char* name, uint16_t rateHz) : name_(name), rateHz_(rateHz) {}

const char* SensorBase::name() const {
  return name_;
}

uint16_t SensorBase::rateHz() const {
  return rateHz_;
}

void SensorBase::setRateHz(uint16_t rateHz) {
  rateHz_ = rateHz;
}

bool SensorBase::due(uint64_t nowUsValue) const {
  return rateHz_ > 0 && nowUsValue >= nextDueUs_;
}

void SensorBase::markRead(uint64_t nowUsValue) {
  if (rateHz_ == 0) {
    nextDueUs_ = UINT64_MAX;
    return;
  }

  nextDueUs_ = nowUsValue + (1000000ULL / rateHz_);
}

void SensorBase::addBaseFields(JsonDocument& doc, const char* kind, uint64_t timestampUs) const {
  doc["type"] = "sample";
  doc["kind"] = kind;
  doc["sensor"] = name_;
  doc["t_us"] = timestampUs;
}
