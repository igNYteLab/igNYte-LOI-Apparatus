#pragma once

#include <Arduino.h>

namespace Pins {
constexpr uint8_t kI2cSda = 7;
constexpr uint8_t kI2cScl = 8;

constexpr uint8_t kSpiSck = 28;
constexpr uint8_t kSpiMosi = 29;
constexpr uint8_t kSpiMiso = 30;
constexpr uint8_t kThermocoupleCs[] = {21, 20, 36, 35, 34, 31};

constexpr uint8_t kD6fAnalog = 23;  // A3

constexpr uint8_t kMotorDir = 48;
constexpr uint8_t kMotorStep = 49;
constexpr uint8_t kMotorDiag = 50;
constexpr uint8_t kMotorIndex = 52;
constexpr uint8_t kMotorEndstop = 51;
constexpr uint8_t kTmcUart = 32;
constexpr uint8_t kMotorEnable = 33;

constexpr uint8_t kFlow1Tx = 4;
constexpr uint8_t kFlow1Rx = 5;
constexpr uint8_t kFlow2Tx = 37;  // D1
constexpr uint8_t kFlow2Rx = 38;  // D0
}  // namespace Pins

namespace Config {
constexpr uint32_t kUsbBaud = 115200;
constexpr uint32_t kFlowBaud = 38400;
constexpr uint32_t kTmcBaud = 115200;

constexpr uint8_t kBronkhorstNodePointToPoint = 0x80;

constexpr float kStepperFullStepsPerRev = 200.0f;
constexpr float kLeadScrewMmPerRev = 2.0f;
constexpr uint16_t kMicrosteps = 16;
constexpr float kStepsPerMm =
    (kStepperFullStepsPerRev * static_cast<float>(kMicrosteps)) / kLeadScrewMmPerRev;

constexpr float kMaxStageSpeedMmS = 8.0f;
constexpr float kMaxStageAccelMmS2 = 20.0f;
constexpr bool kMotorEnableActiveLow = true;
constexpr bool kEndstopActiveLow = true;
}  // namespace Config
