#include <Arduino.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Wire.h>

#include "AppConfig.h"
#include "Telemetry.h"
#include "Timebase.h"
#include "devices/MotorController.h"
#include "devices/ProparAsciiClient.h"
#include "sensors/AnalogD6FSensor.h"
#include "sensors/Bme688Sensor.h"
#include "sensors/Max31856Sensor.h"
#include "sensors/Sht45Sensor.h"

HardwareSerial TmcSerial(1);
HardwareSerial Flow1Serial(2);
HardwareSerial Flow2Serial(0);

Telemetry telemetry;
MotorController motor(TmcSerial);
ProparAsciiClient flow1(Flow1Serial, "flow1");
ProparAsciiClient flow2(Flow2Serial, "flow2");

Max31856Sensor tc1("tc1", Pins::kThermocoupleCs[0], 10);
Max31856Sensor tc2("tc2", Pins::kThermocoupleCs[1], 10);
Max31856Sensor tc3("tc3", Pins::kThermocoupleCs[2], 10);
Max31856Sensor tc4("tc4", Pins::kThermocoupleCs[3], 10);
Sht45Sensor sht45("sht45", Wire, 2);
Bme688Sensor bme688("bme688", Wire, 2);
AnalogD6FSensor d6f("d6f_v03a1", Pins::kD6fAnalog, 50);

SensorBase* sensors[] = {
    &tc1,
    &tc2,
    &tc3,
    &tc4,
    &sht45,
    &bme688,
    &d6f,
};

constexpr size_t kSensorCount = sizeof(sensors) / sizeof(sensors[0]);

void publishStatus(const char* component, const char* status, const char* detail = nullptr) {
  JsonDocument doc;
  doc["type"] = "status";
  doc["t_us"] = nowUs();
  doc["component"] = component;
  doc["status"] = status;
  if (detail != nullptr) {
    doc["detail"] = detail;
  }
  telemetry.write(doc);
}

SensorBase* findSensor(const char* name) {
  for (SensorBase* sensor : sensors) {
    if (strcmp(sensor->name(), name) == 0) {
      return sensor;
    }
  }
  return nullptr;
}

void handleCommand(JsonDocument& doc) {
  const char* cmd = doc["cmd"] | "";

  if (strcmp(cmd, "motor.move_steps") == 0) {
    motor.moveToSteps(doc["steps"] | motor.positionSteps());
  } else if (strcmp(cmd, "motor.target_mm") == 0) {
    motor.moveToMm(doc["mm"] | motor.positionMm());
  } else if (strcmp(cmd, "motor.velocity_mm_s") == 0) {
    motor.setVelocityMmS(doc["mm_s"] | 0.0f);
  } else if (strcmp(cmd, "motor.stop") == 0) {
    motor.stop();
  } else if (strcmp(cmd, "motor.home_here") == 0) {
    motor.homeHere();
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

void sensorTask(void*) {
  for (;;) {
    const uint64_t timestampUs = nowUs();
    for (SensorBase* sensor : sensors) {
      if (!sensor->due(timestampUs)) {
        continue;
      }

      JsonDocument doc;
      const bool ok = sensor->read(doc, timestampUs);
      doc["ok"] = ok;
      telemetry.write(doc);
      sensor->markRead(timestampUs);
    }
    vTaskDelay(pdMS_TO_TICKS(1));
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
  for (;;) {
    motor.service();
    delayMicroseconds(200);
  }
}

void setup() {
  Serial.begin(Config::kUsbBaud);
  delay(1000);

  telemetry.begin();
  publishStatus("boot", "starting");

  Wire.begin(Pins::kI2cSda, Pins::kI2cScl);
  SPI.begin(Pins::kSpiSck, Pins::kSpiMiso, Pins::kSpiMosi);

  motor.begin();
  flow1.begin(Config::kFlowBaud, Pins::kFlow1Rx, Pins::kFlow1Tx);
  flow2.begin(Config::kFlowBaud, Pins::kFlow2Rx, Pins::kFlow2Tx);

  for (SensorBase* sensor : sensors) {
    const bool ok = sensor->begin();
    publishStatus(sensor->name(), ok ? "begin_ok" : "begin_failed");
    sensor->markRead(nowUs());
  }

  xTaskCreate(motorTask, "motor", 4096, nullptr, 5, nullptr);
  xTaskCreate(commandTask, "commands", 6144, nullptr, 3, nullptr);
  xTaskCreate(sensorTask, "sensors", 8192, nullptr, 2, nullptr);
  xTaskCreate(flowTask, "flow", 6144, nullptr, 2, nullptr);

  publishStatus("boot", "ready");
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
