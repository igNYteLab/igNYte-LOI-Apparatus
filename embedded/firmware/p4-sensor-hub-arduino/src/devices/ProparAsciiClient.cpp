// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include "devices/ProparAsciiClient.h"

namespace {
char hexNibble(uint8_t value) {
  value &= 0x0F;
  return value < 10 ? static_cast<char>('0' + value) : static_cast<char>('A' + value - 10);
}
}  // namespace

ProparAsciiClient::ProparAsciiClient(HardwareSerial& serial, const char* name)
    : serial_(serial), name_(name) {}

void ProparAsciiClient::begin(uint32_t baud, int8_t rxPin, int8_t txPin) {
  serial_.begin(baud, SERIAL_8N1, rxPin, txPin);
}

bool ProparAsciiClient::writeRawSetpoint(uint16_t raw, uint8_t node) {
  const uint8_t frame[] = {
      0x06,
      node,
      0x01,
      0x01,
      0x21,
      static_cast<uint8_t>((raw >> 8) & 0xFF),
      static_cast<uint8_t>(raw & 0xFF),
  };

  return writeFrame(frame, sizeof(frame)) && readStatus(250);
}

bool ProparAsciiClient::readRawMeasure(uint16_t& raw, uint8_t node) {
  const uint8_t request[] = {0x06, node, 0x04, 0x01, 0x21, 0x01, 0x20};
  uint8_t response[16] = {};
  size_t responseLength = 0;

  if (!writeFrame(request, sizeof(request)) || !readFrame(response, sizeof(response), responseLength, 250)) {
    return false;
  }

  if (responseLength < 7 || response[2] != 0x02) {
    return false;
  }

  raw = (static_cast<uint16_t>(response[5]) << 8) | response[6];
  return true;
}

bool ProparAsciiClient::writeFrame(const uint8_t* frame, size_t length) {
  serial_.write(':');
  for (size_t i = 0; i < length; ++i) {
    serial_.write(hexNibble(frame[i] >> 4));
    serial_.write(hexNibble(frame[i]));
  }
  serial_.write('\r');
  serial_.write('\n');
  serial_.flush();
  return true;
}

bool ProparAsciiClient::readFrame(uint8_t* frame, size_t capacity, size_t& length, uint32_t timeoutMs) {
  const uint32_t startMs = millis();
  bool started = false;
  char high = 0;
  bool haveHigh = false;
  length = 0;

  while ((millis() - startMs) < timeoutMs) {
    while (serial_.available() > 0) {
      const char c = static_cast<char>(serial_.read());
      if (!started) {
        started = c == ':';
        continue;
      }

      if (c == '\r' || c == '\n') {
        return length > 0;
      }

      if (!haveHigh) {
        high = c;
        haveHigh = true;
        continue;
      }

      if (length >= capacity) {
        return false;
      }

      uint8_t value = 0;
      if (!parseHexByte(high, c, value)) {
        return false;
      }

      frame[length++] = value;
      haveHigh = false;
    }
    delay(1);
  }

  return false;
}

bool ProparAsciiClient::readStatus(uint32_t timeoutMs) {
  uint8_t response[8] = {};
  size_t responseLength = 0;
  if (!readFrame(response, sizeof(response), responseLength, timeoutMs)) {
    return false;
  }

  return responseLength >= 5 && response[2] == 0x00 && response[3] == 0x00;
}

bool ProparAsciiClient::parseHexByte(char high, char low, uint8_t& value) {
  auto parseNibble = [](char c, uint8_t& nibble) -> bool {
    if (c >= '0' && c <= '9') {
      nibble = static_cast<uint8_t>(c - '0');
      return true;
    }
    if (c >= 'A' && c <= 'F') {
      nibble = static_cast<uint8_t>(c - 'A' + 10);
      return true;
    }
    if (c >= 'a' && c <= 'f') {
      nibble = static_cast<uint8_t>(c - 'a' + 10);
      return true;
    }
    return false;
  };

  uint8_t hi = 0;
  uint8_t lo = 0;
  if (!parseNibble(high, hi) || !parseNibble(low, lo)) {
    return false;
  }

  value = static_cast<uint8_t>((hi << 4) | lo);
  return true;
}
