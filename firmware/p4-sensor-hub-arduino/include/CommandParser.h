#pragma once

#include <ArduinoJson.h>
#include <cstdint>

enum class ParsedCommandType {
  Invalid,
  MotorTargetMm,
  MotorVelocityMmS,
  MotorStop,
  MotorHomeHere,
  MotorEnable,
  MotorDisable,
  MotorStatus,
  MotorDriverStatus,
  MotorStallStatus,
  MotorStallConfig,
  MotorStallTest,
  MotorCalibrateAxis,
  SensorStatus,
  SensorRate,
  I2cScan,
  FlowSet,
};

struct ParsedCommand {
  ParsedCommandType type = ParsedCommandType::Invalid;
  const char* errorComponent = nullptr;
  const char* errorStatus = nullptr;
  const char* errorDetail = nullptr;
  float value = 0.0f;
  float limit = 0.0f;
  int32_t intValue = 0;
  uint32_t raw = 0;
  uint8_t channel = 1;
  const char* name = "";
  bool hasIntValue = false;
};

ParsedCommand parseCommand(const JsonDocument& doc);
