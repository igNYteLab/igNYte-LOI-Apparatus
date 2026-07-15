// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#include <ArduinoJson.h>
#include <unity.h>

#include "AppConfig.h"
#include "CommandParser.h"

void setUp() {}
void tearDown() {}

namespace {
ParsedCommand parseJson(const char* json) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, json);
  TEST_ASSERT_FALSE_MESSAGE(error, error.c_str());
  return parseCommand(doc);
}

void assertType(ParsedCommandType expected, ParsedCommandType actual) {
  TEST_ASSERT_EQUAL(static_cast<int>(expected), static_cast<int>(actual));
}

void assertError(
    const ParsedCommand& command,
    const char* component,
    const char* status,
    const char* detail) {
  assertType(ParsedCommandType::Invalid, command.type);
  TEST_ASSERT_EQUAL_STRING(component, command.errorComponent);
  TEST_ASSERT_EQUAL_STRING(status, command.errorStatus);
  TEST_ASSERT_EQUAL_STRING(detail, command.errorDetail);
}
}  // namespace

void test_motor_target_mm_parses_value() {
  const ParsedCommand command = parseJson("{\"cmd\":\"motor.target_mm\",\"mm\":12.5}");

  assertType(ParsedCommandType::MotorTargetMm, command.type);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 12.5f, command.value);
}

void test_motor_velocity_requires_mm_s() {
  const ParsedCommand command = parseJson("{\"cmd\":\"motor.velocity_mm_s\"}");

  assertError(command, "motor", "missing_field", "mm_s");
}

void test_removed_move_steps_is_unknown() {
  const ParsedCommand command = parseJson("{\"cmd\":\"motor.move_steps\",\"steps\":3200}");

  assertError(command, "command", "unknown", "motor.move_steps");
}

void test_stall_config_parses_threshold_and_cool_threshold() {
  const ParsedCommand command =
      parseJson("{\"cmd\":\"motor.stall_config\",\"sgthrs\":158,\"tcoolthrs\":1500}");

  assertType(ParsedCommandType::MotorStallConfig, command.type);
  TEST_ASSERT_EQUAL(158, command.intValue);
  TEST_ASSERT_EQUAL_UINT32(1500, command.raw);
}

void test_stall_config_rejects_threshold_out_of_range() {
  const ParsedCommand command =
      parseJson("{\"cmd\":\"motor.stall_config\",\"sgthrs\":300,\"tcoolthrs\":1500}");

  assertError(command, "motor", "invalid_field", "stall_config_range");
}

void test_stall_test_rejects_velocity_over_max() {
  const ParsedCommand command =
      parseJson("{\"cmd\":\"motor.stall_test\",\"mm_s\":26.0,\"max_travel_mm\":5.0}");

  assertError(command, "motor", "invalid_field", "stall_test_range");
}

void test_axis_calibration_uses_default_limit() {
  const ParsedCommand command = parseJson("{\"cmd\":\"motor.calibrate_axis\"}");

  assertType(ParsedCommandType::MotorCalibrateAxis, command.type);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, Config::kAxisCalibrationMaxTravelMm, command.limit);
}

void test_flow_set_clamps_percent() {
  const ParsedCommand command = parseJson("{\"cmd\":\"flow.set\",\"channel\":2,\"pct\":125.0}");

  assertType(ParsedCommandType::FlowSet, command.type);
  TEST_ASSERT_EQUAL_UINT8(2, command.channel);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 100.0f, command.value);
}

void test_sensor_rate_allows_missing_hz() {
  const ParsedCommand command = parseJson("{\"cmd\":\"sensor.rate\",\"sensor\":\"tc1\"}");

  assertType(ParsedCommandType::SensorRate, command.type);
  TEST_ASSERT_EQUAL_STRING("tc1", command.name);
  TEST_ASSERT_FALSE(command.hasIntValue);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_motor_target_mm_parses_value);
  RUN_TEST(test_motor_velocity_requires_mm_s);
  RUN_TEST(test_removed_move_steps_is_unknown);
  RUN_TEST(test_stall_config_parses_threshold_and_cool_threshold);
  RUN_TEST(test_stall_config_rejects_threshold_out_of_range);
  RUN_TEST(test_stall_test_rejects_velocity_over_max);
  RUN_TEST(test_axis_calibration_uses_default_limit);
  RUN_TEST(test_flow_set_clamps_percent);
  RUN_TEST(test_sensor_rate_allows_missing_hz);
  return UNITY_END();
}
