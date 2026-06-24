#include <Arduino.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Wire.h>

#include "AppConfig.h"
#include "Telemetry.h"
#include "Timebase.h"
#include "devices/IoExpander.h"
#include "devices/MotorController.h"
#include "devices/ProparAsciiClient.h"
#include "sensors/Bme688Sensor.h"
#include "sensors/Max31856Sensor.h"
#include "sensors/Sen0496Sensor.h"
#include "sensors/Sht45Sensor.h"

HardwareSerial TmcSerial(1);
HardwareSerial Flow1Serial(2);
// TODO: UART0 is often used for download/logging; switch Flow2 to UART3 if the P4 Arduino core supports it.
HardwareSerial Flow2Serial(0);

Telemetry telemetry;
IoExpander ioExpander;
MotorController motor(TmcSerial);
ProparAsciiClient flow1(Flow1Serial, "flow1");
ProparAsciiClient flow2(Flow2Serial, "flow2");

Max31856Sensor tc1("tc1", Pins::kChipSelects[0], SensorRates::kTc);
Max31856Sensor tc2("tc2", Pins::kChipSelects[1], SensorRates::kTc);
Max31856Sensor tc3("tc3", Pins::kChipSelects[2], SensorRates::kTc);
Max31856Sensor tc4("tc4", Pins::kChipSelects[3], SensorRates::kTc);
Sht45Sensor sht45("sht45", Wire, SensorRates::kSht45);
Bme688Sensor bme688("bme688", Wire, SensorRates::kBme688, Addresses::kBme688);
Sen0496Sensor o2("o2", Wire, SensorRates::kSen0496, Addresses::kSen0496);
SensorBase* sensors[] = {
    &tc1,
    &tc2,
    &tc3,
    &tc4,
    &sht45,
    &bme688,
    &o2,
};

constexpr size_t kSensorCount = sizeof(sensors) / sizeof(sensors[0]);
bool sensorOnline[kSensorCount] = {};

enum class MotorCommandType {
  MoveSteps,
  TargetMm,
  VelocityMmS,
  Stop,
  HomeHere,
  Enable,
  Disable,
  ReportStatus,
  DriverConfigure,
  StallConfigure,
  StallTest,
  StallHome,
};

struct MotorCommand {
  MotorCommandType type;
  long steps = 0;
  float value = 0.0f;
  uint32_t raw = 0;
  float limit = 0.0f;
};

QueueHandle_t motorCommandQueue = nullptr;
SemaphoreHandle_t i2cBusMutex = nullptr;
SemaphoreHandle_t spiBusMutex = nullptr;

constexpr size_t kTcSensorIndices[] = {0, 1, 2, 3};
constexpr size_t kFastI2cSensorIndices[] = {4, 6};
constexpr size_t kBmeSensorIndex = 5;

// function for publishing status messages to telemetry with a consistent format
void publishStatus(
    const char* component,
    const char* status,
    const char* detail = nullptr,
    const char* severity = nullptr) {
  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = component;
  doc["status"] = status;
  if (detail != nullptr) {
    doc["detail"] = detail;
  }
  if (severity != nullptr) {
    doc["severity"] = severity;
  }
  telemetry.write(doc);
}

// helper function to find a sensor by name; returns nullptr if not found
SensorBase* findSensor(const char* name) {
  for (SensorBase* sensor : sensors) {
    if (strcmp(sensor->name(), name) == 0) {
      return sensor;
    }
  }
  return nullptr;
}

void publishSensorStatus() {
  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = "sensor";
  doc["status"] = "state";
  JsonArray sensorList = doc["sensors"].to<JsonArray>();

  for (size_t i = 0; i < kSensorCount; ++i) {
    JsonObject item = sensorList.add<JsonObject>();
    item["name"] = sensors[i]->name();
    item["online"] = sensorOnline[i];
    item["rate_hz"] = sensors[i]->rateHz();
  }

  telemetry.write(doc);
}

void publishI2cScan() {
  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = "i2c";
  doc["status"] = "scan";
  JsonArray addresses = doc["addresses"].to<JsonArray>();

  uint8_t count = 0;
  if (i2cBusMutex != nullptr) {
    xSemaphoreTake(i2cBusMutex, portMAX_DELAY);
  }
  for (uint8_t address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      addresses.add(address);
      ++count;
    }
  }
  if (i2cBusMutex != nullptr) {
    xSemaphoreGive(i2cBusMutex);
  }

  doc["count"] = count;
  telemetry.write(doc);
}

// helper function to queue a motor command; returns true if successful, false if the queue is full or missing
bool queueMotorCommand(const MotorCommand& command) {
  if (motorCommandQueue == nullptr) {
    publishStatus("motor", "queue_missing");
    return false;
  }

  if (xQueueSend(motorCommandQueue, &command, 0) != pdTRUE) {
    publishStatus("motor", "queue_full");
    return false;
  }

  publishStatus("motor", "command_queued");
  return true;
}

void publishMotorState(const char* status) {
  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = "motor";
  doc["status"] = status;
  doc["enabled"] = motor.enabled();
  doc["endstop_active"] = motor.endstopActive();
  doc["velocity_mode"] = motor.velocityMode();
  doc["position_steps"] = motor.positionSteps();
  doc["position_mm"] = motor.positionMm();
  telemetry.write(doc);
}

void publishDriverStatus() {
  const TmcDriverDiagnostics diagnostics = motor.readDriverDiagnostics();
  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = "motor";
  doc["status"] = "driver_status";
  doc["connection_result"] = diagnostics.connection_result;
  doc["connection_ok"] = diagnostics.connection_result == 0;
  doc["ifcnt"] = diagnostics.ifcnt;
  doc["ioin"] = diagnostics.ioin;
  doc["version"] = diagnostics.version;
  doc["drv_status"] = diagnostics.drv_status;
  doc["rms_current_ma"] = diagnostics.rms_current_ma;
  doc["microsteps"] = diagnostics.microsteps;
  telemetry.write(doc);
}

void publishStallStatus() {
  const TmcStallDiagnostics diagnostics = motor.readStallDiagnostics();
  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = "motor";
  doc["status"] = "stall_status";
  doc["sg_result"] = diagnostics.sg_result;
  doc["sg_threshold"] = diagnostics.sg_threshold;
  doc["effective_sg_threshold"] = static_cast<uint16_t>(diagnostics.sg_threshold) * 2U;
  doc["tstep"] = diagnostics.tstep;
  doc["tcoolthrs"] = diagnostics.tcoolthrs;
  doc["tpwmthrs"] = diagnostics.tpwmthrs;
  doc["drv_status"] = diagnostics.drv_status;
  doc["diag_gpio"] = Pins::kMotorDiag;
  doc["diag_pin"] = diagnostics.diag_pin;
  doc["diag_interrupt_pending"] = diagnostics.diag_interrupt_pending;
  doc["stall_guard_armed"] = diagnostics.stall_guard_armed;
  doc["stall_test_active"] = diagnostics.stall_test_active;
  doc["stall_home_active"] = diagnostics.stall_home_active;
  doc["stall_home_backing_off"] = diagnostics.stall_home_backing_off;
  doc["spreadcycle_enabled"] = diagnostics.spreadcycle_enabled;
  doc["stall_window_active"] =
      !diagnostics.spreadcycle_enabled && diagnostics.tcoolthrs >= diagnostics.tstep &&
      diagnostics.tstep > diagnostics.tpwmthrs;
  doc["enabled"] = diagnostics.enabled;
  doc["velocity_mode"] = diagnostics.velocity_mode;
  doc["speed_mm_s"] = diagnostics.speed_mm_s;
  doc["stall_test_travel_mm"] = diagnostics.stall_test_travel_mm;
  doc["stall_home_travel_mm"] = diagnostics.stall_home_travel_mm;
  telemetry.write(doc);
}

void publishMotorMotionEvent(MotorMotionEvent event) {
  const char* status = nullptr;
  const char* homeSource = nullptr;
  switch (event) {
    case MotorMotionEvent::StallDetected:
      status = "stall_detected";
      break;
    case MotorMotionEvent::StallTestTravelLimit:
      status = "stall_not_detected";
      break;
    case MotorMotionEvent::StallTestEndstop:
      status = "stall_test_endstop";
      break;
    case MotorMotionEvent::StallHomeComplete:
      status = "stall_home_complete";
      homeSource = "stallguard";
      break;
    case MotorMotionEvent::StallHomeCompleteEndstop:
      status = "stall_home_complete";
      homeSource = "endstop";
      break;
    case MotorMotionEvent::StallHomeTravelLimit:
      status = "stall_home_not_detected";
      break;
    case MotorMotionEvent::None:
      return;
  }

  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = "motor";
  doc["status"] = status;
  doc["position_steps"] = motor.positionSteps();
  doc["position_mm"] = motor.positionMm();
  doc["endstop_active"] = motor.endstopActive();
  if (homeSource != nullptr) {
    doc["home_source"] = homeSource;
  }
  telemetry.write(doc);
}

// helper function to apply a motor command immediately; used by the motor task
void applyMotorCommand(const MotorCommand& command) {
  switch (command.type) {
    case MotorCommandType::MoveSteps:
      motor.moveToSteps(command.steps);
      break;
    case MotorCommandType::TargetMm:
      motor.moveToMm(command.value);
      break;
    case MotorCommandType::VelocityMmS:
      motor.setVelocityMmS(command.value);
      break;
    case MotorCommandType::Stop:
      motor.stop();
      break;
    case MotorCommandType::HomeHere:
      motor.homeHere();
      break;
    case MotorCommandType::Enable:
      motor.setEnabled(true);
      publishMotorState("enabled");
      break;
    case MotorCommandType::Disable:
      motor.setEnabled(false);
      publishMotorState("disabled");
      break;
    case MotorCommandType::ReportStatus:
      publishMotorState("state");
      break;
    case MotorCommandType::DriverConfigure:
      motor.configureDriver();
      publishDriverStatus();
      break;
    case MotorCommandType::StallConfigure:
      if (motor.configureStallGuard(static_cast<uint8_t>(command.steps), command.raw)) {
        publishStatus("motor", "stall_configured");
        publishStallStatus();
      } else {
        publishStatus("motor", "stall_config_rejected", "motor_must_be_stopped");
      }
      break;
    case MotorCommandType::StallTest:
      if (motor.startStallTest(command.value, command.limit)) {
        publishStatus("motor", "stall_test_started");
      } else {
        publishStatus("motor", "stall_test_rejected", "check_enabled_idle_diag_and_limits");
      }
      break;
    case MotorCommandType::StallHome:
      if (motor.startStallHome(command.limit)) {
        publishStatus("motor", "stall_home_started");
      } else {
        publishStatus("motor", "stall_home_rejected", "check_enabled_idle_diag_and_limits");
      }
      break;
  }
}

// function to handle incoming commands; expects a JSON document with a "cmd" field and other parameters as needed
void handleCommand(JsonDocument& doc) {
  const char* cmd = doc["cmd"] | "";

  if (strcmp(cmd, "motor.move_steps") == 0) {
    if (!doc["steps"].is<long>()) {
      publishStatus("motor", "missing_field", "steps");
      return;
    }
    queueMotorCommand({MotorCommandType::MoveSteps, doc["steps"].as<long>(), 0.0f});
  } else if (strcmp(cmd, "motor.target_mm") == 0) {
    if (!doc["mm"].is<float>()) {
      publishStatus("motor", "missing_field", "mm");
      return;
    }
    queueMotorCommand({MotorCommandType::TargetMm, 0, doc["mm"].as<float>()});
  } else if (strcmp(cmd, "motor.velocity_mm_s") == 0) {
    if (!doc["mm_s"].is<float>()) {
      publishStatus("motor", "missing_field", "mm_s");
      return;
    }
    queueMotorCommand({MotorCommandType::VelocityMmS, 0, doc["mm_s"].as<float>()});
  } else if (strcmp(cmd, "motor.stop") == 0) {
    queueMotorCommand({MotorCommandType::Stop, 0, 0.0f});
  } else if (strcmp(cmd, "motor.home_here") == 0) {
    queueMotorCommand({MotorCommandType::HomeHere, 0, 0.0f});
  } else if (strcmp(cmd, "motor.enable") == 0) {
    queueMotorCommand({MotorCommandType::Enable, 0, 0.0f});
  } else if (strcmp(cmd, "motor.disable") == 0) {
    queueMotorCommand({MotorCommandType::Disable, 0, 0.0f});
  } else if (strcmp(cmd, "motor.status") == 0) {
    queueMotorCommand({MotorCommandType::ReportStatus, 0, 0.0f});
  } else if (strcmp(cmd, "motor.driver_status") == 0) {
    publishDriverStatus();
  } else if (strcmp(cmd, "motor.driver_configure") == 0) {
    queueMotorCommand({MotorCommandType::DriverConfigure, 0, 0.0f});
  } else if (strcmp(cmd, "motor.stall_status") == 0) {
    // Keep blocking UART diagnostics out of the motor pulse-generation task.
    publishStallStatus();
  } else if (strcmp(cmd, "motor.stall_config") == 0) {
    if (!doc["sgthrs"].is<int>()) {
      publishStatus("motor", "missing_field", "sgthrs");
      return;
    }
    if (!doc["tcoolthrs"].is<long>()) {
      publishStatus("motor", "missing_field", "tcoolthrs");
      return;
    }

    const int threshold = doc["sgthrs"].as<int>();
    const long coolThreshold = doc["tcoolthrs"].as<long>();
    if (threshold < 0 || threshold > 255 || coolThreshold < 0 || coolThreshold > 0xFFFFF) {
      publishStatus("motor", "invalid_field", "stall_config_range");
      return;
    }

    queueMotorCommand(
        {MotorCommandType::StallConfigure, threshold, 0.0f, static_cast<uint32_t>(coolThreshold)});
  } else if (strcmp(cmd, "motor.stall_test") == 0) {
    if (!doc["mm_s"].is<float>()) {
      publishStatus("motor", "missing_field", "mm_s");
      return;
    }
    if (!doc["max_travel_mm"].is<float>()) {
      publishStatus("motor", "missing_field", "max_travel_mm");
      return;
    }

    const float velocityMmS = doc["mm_s"].as<float>();
    const float maxTravelMm = doc["max_travel_mm"].as<float>();
    if (velocityMmS == 0.0f || fabsf(velocityMmS) > Config::kMaxStageSpeedMmS ||
        maxTravelMm <= 0.0f || maxTravelMm > Config::kMaxStallTestTravelMm) {
      publishStatus("motor", "invalid_field", "stall_test_range");
      return;
    }

    queueMotorCommand({MotorCommandType::StallTest, 0, velocityMmS, 0, maxTravelMm});
  } else if (strcmp(cmd, "motor.stall_home") == 0) {
    if (!doc["max_travel_mm"].is<float>()) {
      publishStatus("motor", "missing_field", "max_travel_mm");
      return;
    }

    const float maxTravelMm = doc["max_travel_mm"].as<float>();
    if (maxTravelMm <= 0.0f || maxTravelMm > Config::kMaxStallHomeTravelMm) {
      publishStatus("motor", "invalid_field", "stall_home_range");
      return;
    }

    queueMotorCommand({MotorCommandType::StallHome, 0, 0.0f, 0, maxTravelMm});
  } else if (strcmp(cmd, "sensor.status") == 0) {
    publishSensorStatus();
  } else if (strcmp(cmd, "i2c.scan") == 0) {
    publishI2cScan();
  } else if (strcmp(cmd, "flow.set") == 0) {
    const uint8_t channel = doc["channel"] | 1;
    const float pct = constrain(doc["pct"] | 0.0f, 0.0f, 100.0f);
    const uint16_t raw = static_cast<uint16_t>((pct / 100.0f) * 32000.0f);
    const bool ok = channel == 2 ? flow2.writeRawSetpoint(raw) : flow1.writeRawSetpoint(raw);
    publishStatus(channel == 2 ? "flow2" : "flow1", ok ? "setpoint_ok" : "setpoint_failed");
  } else if (strcmp(cmd, "sensor.rate") == 0) {
    const char* sensorName = doc["sensor"] | "";
    SensorBase* sensor = findSensor(sensorName);
    if (sensor != nullptr) {
      sensor->setRateHz(doc["hz"] | sensor->rateHz());
      publishStatus(sensorName, "rate_updated");
    } else {
      publishStatus("sensor", "not_found", sensorName);
    }
  } else {
    publishStatus("command", "unknown", cmd);
  }
}

void commandTask(void*) {
  String line;
  line.reserve(256);

  for (;;) {
    while (Serial.available() > 0) {
      const char c = static_cast<char>(Serial.read());
      if (c == '\n') {
        JsonDocument doc;
        const DeserializationError err = deserializeJson(doc, line);
        if (err) {
          publishStatus("command", "json_error", err.c_str());
        } else {
          handleCommand(doc);
        }
        line = "";
      } else if (c != '\r') {
        line += c;
      }
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

bool pollSensor(size_t sensorIndex, SemaphoreHandle_t busMutex = nullptr) {
  if (sensorIndex >= kSensorCount || !sensorOnline[sensorIndex]) {
    return false;
  }

  SensorBase* sensor = sensors[sensorIndex];
  const uint64_t timestampUs = nowUs();
  if (!sensor->due(timestampUs)) {
    return false;
  }

  JsonDocument doc;
  if (busMutex != nullptr) {
    xSemaphoreTake(busMutex, portMAX_DELAY);
  }
  const bool ok = sensor->read(doc, timestampUs);
  if (busMutex != nullptr) {
    xSemaphoreGive(busMutex);
  }

  doc["ok"] = ok;
  telemetry.write(doc);
  sensor->markRead(nowUs());
  return true;
}

void pollSensorGroup(const size_t* sensorIndices, size_t sensorCount, SemaphoreHandle_t busMutex) {
  for (size_t i = 0; i < sensorCount; ++i) {
    pollSensor(sensorIndices[i], busMutex);
  }
}

void fastI2cSensorTask(void*) {
  for (;;) {
    pollSensorGroup(
        kFastI2cSensorIndices,
        sizeof(kFastI2cSensorIndices) / sizeof(kFastI2cSensorIndices[0]),
        i2cBusMutex);
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

void thermocoupleTask(void*) {
  for (;;) {
    pollSensorGroup(kTcSensorIndices, sizeof(kTcSensorIndices) / sizeof(kTcSensorIndices[0]), spiBusMutex);
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

void bmeSensorTask(void*) {
  for (;;) {
    if (sensorOnline[kBmeSensorIndex]) {
      const uint64_t timestampUs = nowUs();
      if (!bme688.asyncReadingActive() && bme688.due(timestampUs)) {
        if (i2cBusMutex != nullptr) {
          xSemaphoreTake(i2cBusMutex, portMAX_DELAY);
        }
        const bool started = bme688.startAsyncReading();
        if (i2cBusMutex != nullptr) {
          xSemaphoreGive(i2cBusMutex);
        }

        if (!started) {
          JsonDocument doc;
          doc["type"] = "sample";
          doc["kind"] = "environment";
          doc["sensor"] = bme688.name();
          doc["t_us"] = timestampUs;
          doc["ok"] = false;
          telemetry.write(doc);
          bme688.markRead(nowUs());
        }
      }

      if (bme688.asyncReadingReady()) {
        JsonDocument doc;
        const uint64_t readyTimestampUs = nowUs();
        if (i2cBusMutex != nullptr) {
          xSemaphoreTake(i2cBusMutex, portMAX_DELAY);
        }
        const bool ok = bme688.finishAsyncReading(doc, readyTimestampUs);
        if (i2cBusMutex != nullptr) {
          xSemaphoreGive(i2cBusMutex);
        }

        doc["ok"] = ok;
        telemetry.write(doc);
        bme688.markRead(nowUs());
      }
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void flowTask(void*) {
  for (;;) {
    uint16_t raw = 0;
    JsonDocument doc;
    doc["type"] = "sample";
    doc["kind"] = "flow_controller";
    doc["t_us"] = nowUs();

    if (flow1.readRawMeasure(raw)) {
      doc["sensor"] = "flow1";
      doc["raw"] = raw;
      doc["pct"] = (static_cast<float>(raw) / 32000.0f) * 100.0f;
      doc["ok"] = true;
      telemetry.write(doc);
    }

    doc.clear();
    doc["type"] = "sample";
    doc["kind"] = "flow_controller";
    doc["t_us"] = nowUs();
    if (flow2.readRawMeasure(raw)) {
      doc["sensor"] = "flow2";
      doc["raw"] = raw;
      doc["pct"] = (static_cast<float>(raw) / 32000.0f) * 100.0f;
      doc["ok"] = true;
      telemetry.write(doc);
    }

    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

void motorTask(void*) {
  MotorCommand command;
  uint8_t yieldCounter = 0;

  for (;;) {
    if (motorCommandQueue != nullptr) {
      while (xQueueReceive(motorCommandQueue, &command, 0) == pdTRUE) {
        applyMotorCommand(command);
      }
    }

    motor.service();
    publishMotorMotionEvent(motor.takeMotionEvent());
    delayMicroseconds(200);
    if (++yieldCounter >= 10) {
      yieldCounter = 0;
      vTaskDelay(pdMS_TO_TICKS(1));
    }
  }
}

void setup() {
  Serial.begin(Config::kUsbBaud);
  delay(1000);

  telemetry.begin();
  publishStatus("boot", "starting");
  bool bootWarnings = false;

  motorCommandQueue = xQueueCreate(8, sizeof(MotorCommand));
  i2cBusMutex = xSemaphoreCreateMutex();
  spiBusMutex = xSemaphoreCreateMutex();
  const bool motorQueueOk = motorCommandQueue != nullptr;
  publishStatus("motor", motorQueueOk ? "queue_ok" : "queue_failed", nullptr, motorQueueOk ? nullptr : "warning");
  bootWarnings = bootWarnings || !motorQueueOk;
  bootWarnings = bootWarnings || i2cBusMutex == nullptr || spiBusMutex == nullptr;

  Wire.begin(Pins::kI2cSda, Pins::kI2cScl);
  SPI.begin(Pins::kSpiSck, Pins::kSpiMiso, Pins::kSpiMosi);

  const bool ioExpanderOk = ioExpander.begin(Wire);
  publishStatus(
      "io_expander",
      ioExpanderOk ? "begin_ok" : "begin_failed",
      nullptr,
      ioExpanderOk ? nullptr : "warning");
  bootWarnings = bootWarnings || !ioExpanderOk;
  if (ioExpanderOk) {
    const bool microstepsOk = ioExpander.setMotorMicrosteps(Config::kMicrosteps);
    publishStatus(
        "io_expander",
        microstepsOk ? "motor_microsteps_ok" : "motor_microsteps_invalid",
        nullptr,
        microstepsOk ? nullptr : "warning");
    bootWarnings = bootWarnings || !microstepsOk;
  } else {
    publishStatus("motor", "microstep_pins_unverified", "mcp23017_missing", "warning");
  }

  motor.begin();
  flow1.begin(Config::kFlowBaud, Pins::kFlow1Rx, Pins::kFlow1Tx);
  flow2.begin(Config::kFlowBaud, Pins::kFlow2Rx, Pins::kFlow2Tx);

  for (size_t i = 0; i < kSensorCount; ++i) {
    SensorBase* sensor = sensors[i];
    const bool ok = sensor->begin();
    sensorOnline[i] = ok;
    publishStatus(sensor->name(), ok ? "begin_ok" : "begin_failed", nullptr, ok ? nullptr : "warning");
    bootWarnings = bootWarnings || !ok;
    sensor->markRead(nowUs());
  }

  xTaskCreate(motorTask, "motor", 4096, nullptr, 5, nullptr);
  xTaskCreate(commandTask, "commands", 6144, nullptr, 3, nullptr);
  xTaskCreate(fastI2cSensorTask, "fast_i2c", 6144, nullptr, 2, nullptr);
  xTaskCreate(bmeSensorTask, "bme688", 4096, nullptr, 2, nullptr);
  xTaskCreate(thermocoupleTask, "thermo", 6144, nullptr, 2, nullptr);
  xTaskCreate(flowTask, "flow", 6144, nullptr, 2, nullptr);

  publishStatus("boot", bootWarnings ? "ready_with_warnings" : "ready");
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
