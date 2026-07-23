// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

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
  char errorDetail[48] = {};
  float value = 0.0f;
  float limit = 0.0f;
  int32_t intValue = 0;
  uint32_t raw = 0;
  uint8_t channel = 1;
  char name[32] = {};
  bool hasIntValue = false;
};

ParsedCommand parseCommand(const JsonDocument& doc);
