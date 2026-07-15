// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#include <Arduino.h>

class ProparAsciiClient {
 public:
  ProparAsciiClient(HardwareSerial& serial, const char* name);

  void begin(uint32_t baud, int8_t rxPin, int8_t txPin);
  bool writeRawSetpoint(uint16_t raw, uint8_t node = 0x80);
  bool readRawMeasure(uint16_t& raw, uint8_t node = 0x80);

 private:
  bool writeFrame(const uint8_t* frame, size_t length);
  bool readFrame(uint8_t* frame, size_t capacity, size_t& length, uint32_t timeoutMs);
  bool readStatus(uint32_t timeoutMs);
  static bool parseHexByte(char high, char low, uint8_t& value);

  HardwareSerial& serial_;
  const char* name_;
};
