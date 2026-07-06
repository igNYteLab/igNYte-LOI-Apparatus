#include "CommandParser.h"
#include "AppConfig.h"

#include <cstring>

namespace {
ParsedCommand errorCommand(const char* component, const char* status, const char* detail) {
  ParsedCommand command;
  command.errorComponent = component;
  command.errorStatus = status;
  command.errorDetail = detail;
  return command;
}

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}
}  // namespace

ParsedCommand parseCommand(const JsonDocument& doc) {
  const char* cmd = doc["cmd"] | "";
  ParsedCommand command;

  if (std::strcmp(cmd, "motor.target_mm") == 0) {
    if (!doc["mm"].is<float>()) {
      return errorCommand("motor", "missing_field", "mm");
    }
    command.type = ParsedCommandType::MotorTargetMm;
    command.value = doc["mm"].as<float>();
  } else if (std::strcmp(cmd, "motor.velocity_mm_s") == 0) {
    if (!doc["mm_s"].is<float>()) {
      return errorCommand("motor", "missing_field", "mm_s");
    }
    command.type = ParsedCommandType::MotorVelocityMmS;
    command.value = doc["mm_s"].as<float>();
  } else if (std::strcmp(cmd, "motor.stop") == 0) {
    command.type = ParsedCommandType::MotorStop;
  } else if (std::strcmp(cmd, "motor.home_here") == 0) {
    command.type = ParsedCommandType::MotorHomeHere;
  } else if (std::strcmp(cmd, "motor.enable") == 0) {
    command.type = ParsedCommandType::MotorEnable;
  } else if (std::strcmp(cmd, "motor.disable") == 0) {
    command.type = ParsedCommandType::MotorDisable;
  } else if (std::strcmp(cmd, "motor.status") == 0) {
    command.type = ParsedCommandType::MotorStatus;
  } else if (std::strcmp(cmd, "motor.driver_status") == 0) {
    command.type = ParsedCommandType::MotorDriverStatus;
  } else if (std::strcmp(cmd, "motor.stall_status") == 0) {
    command.type = ParsedCommandType::MotorStallStatus;
  } else if (std::strcmp(cmd, "motor.stall_config") == 0) {
    if (!doc["sgthrs"].is<int>()) {
      return errorCommand("motor", "missing_field", "sgthrs");
    }
    if (!doc["tcoolthrs"].is<long>()) {
      return errorCommand("motor", "missing_field", "tcoolthrs");
    }

    const int threshold = doc["sgthrs"].as<int>();
    const long coolThreshold = doc["tcoolthrs"].as<long>();
    if (threshold < 0 || threshold > 255 || coolThreshold < 0 || coolThreshold > 0xFFFFF) {
      return errorCommand("motor", "invalid_field", "stall_config_range");
    }

    command.type = ParsedCommandType::MotorStallConfig;
    command.intValue = threshold;
    command.raw = static_cast<uint32_t>(coolThreshold);
  } else if (std::strcmp(cmd, "motor.stall_test") == 0) {
    if (!doc["mm_s"].is<float>()) {
      return errorCommand("motor", "missing_field", "mm_s");
    }
    if (!doc["max_travel_mm"].is<float>()) {
      return errorCommand("motor", "missing_field", "max_travel_mm");
    }

    const float velocityMmS = doc["mm_s"].as<float>();
    const float maxTravelMm = doc["max_travel_mm"].as<float>();
    if (velocityMmS == 0.0f || velocityMmS < -Config::kMaxStageSpeedMmS ||
        velocityMmS > Config::kMaxStageSpeedMmS || maxTravelMm <= 0.0f ||
        maxTravelMm > Config::kMaxStallTestTravelMm) {
      return errorCommand("motor", "invalid_field", "stall_test_range");
    }

    command.type = ParsedCommandType::MotorStallTest;
    command.value = velocityMmS;
    command.limit = maxTravelMm;
  } else if (std::strcmp(cmd, "motor.calibrate_axis") == 0) {
    const float maxTravelMm = doc["max_travel_mm"] | Config::kAxisCalibrationMaxTravelMm;
    if (maxTravelMm <= 0.0f || maxTravelMm > Config::kAxisCalibrationMaxTravelMm) {
      return errorCommand("motor", "invalid_field", "axis_calibration_range");
    }

    command.type = ParsedCommandType::MotorCalibrateAxis;
    command.limit = maxTravelMm;
  } else if (std::strcmp(cmd, "sensor.status") == 0) {
    command.type = ParsedCommandType::SensorStatus;
  } else if (std::strcmp(cmd, "i2c.scan") == 0) {
    command.type = ParsedCommandType::I2cScan;
  } else if (std::strcmp(cmd, "flow.set") == 0) {
    command.type = ParsedCommandType::FlowSet;
    command.channel = doc["channel"] | 1;
    command.value = clampFloat(doc["pct"] | 0.0f, 0.0f, 100.0f);
  } else if (std::strcmp(cmd, "sensor.rate") == 0) {
    command.type = ParsedCommandType::SensorRate;
    command.name = doc["sensor"] | "";
    if (doc["hz"].is<int>()) {
      command.hasIntValue = true;
      command.intValue = doc["hz"].as<int>();
    }
  } else {
    return errorCommand("command", "unknown", cmd);
  }

  return command;
}
