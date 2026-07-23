// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

#pragma once

#ifdef ARDUINO
#include <Arduino.h>
#else
#include <cstdint>
#endif

#ifndef IGNYTE_MOTOR_ONLY_DEBUG
#define IGNYTE_MOTOR_ONLY_DEBUG 0
#endif

namespace Pins {
constexpr uint8_t kI2cSda = 7;
constexpr uint8_t kI2cScl = 8;

constexpr uint8_t kSpiSck = 28;
constexpr uint8_t kSpiMosi = 29;
constexpr uint8_t kSpiMiso = 30;
constexpr uint8_t kChipSelects[] = {21, 36, 35, 20, 34, 31};

constexpr uint8_t kMotorDir = 48;
constexpr uint8_t kMotorStep = 49;
constexpr uint8_t kMotorDiag = 50;
constexpr uint8_t kMotorIndex = 52;
constexpr uint8_t kMotorEndstop = 51;
constexpr uint8_t kTmcUartRx = 32;
constexpr uint8_t kTmcUartTx = 23;
constexpr uint8_t kMotorEnable = 33;

constexpr uint8_t kFlow1Tx = 4;
constexpr uint8_t kFlow1Rx = 5;
constexpr uint8_t kFlow2Tx = 37;  // D1
constexpr uint8_t kFlow2Rx = 38;  // D0
}  // namespace Pins

namespace ExpanderPins {
constexpr uint8_t kMotorMs2 = 0;  // MCP23017 GPA0 / A0
constexpr uint8_t kMotorMs1 = 1;  // MCP23017 GPA1 / A1
}  // namespace ExpanderPins

namespace Addresses {
constexpr uint8_t kBme688 = 0x77;
constexpr uint8_t kMcp23017 = 0x20;
constexpr uint8_t kSen0496 = 0x70;

//Not used; library defaults to this and doesn't support changing it. Here for ground truth/reference.
constexpr uint8_t kSht45 = 0x44;    
}  // namespace Addresses

namespace SensorRates {
constexpr uint16_t kTc = 1;       // 1 Hz
constexpr uint16_t kSht45 = 10;   // 10 Hz
constexpr uint16_t kBme688 = 2;   // 2 Hz
constexpr uint16_t kSen0496 = 1;  // 1 Hz
}  // namespace SensorRates

namespace Config {
constexpr uint32_t kUsbBaud = 115200;
constexpr uint32_t kFlowBaud = 38400;
constexpr uint32_t kTmcBaud = 115200;

constexpr uint8_t kBronkhorstNodePointToPoint = 0x80;

constexpr float kStepperFullStepsPerRev = 200.0f;
constexpr float kLeadScrewMmPerRev = 2.0f;
constexpr uint16_t kMicrosteps = 4;
constexpr float kStepsPerMm =
    (kStepperFullStepsPerRev * static_cast<float>(kMicrosteps)) / kLeadScrewMmPerRev;

constexpr float kMaxStageSpeedMmS = 25.0f;
constexpr float kMaxStageAccelMmS2 = 40.0f;
constexpr uint32_t kStepTimerResolutionHz = 4000000;
constexpr uint32_t kStepTimerMaxPeriodTicks = 65535;
constexpr uint32_t kMotorServicePeriodMs = 1;
constexpr uint32_t kMotorDirectionSetupUs = 2;
constexpr uint32_t kMotorVelocityCommandTimeoutMs = 2000;
constexpr float kAxisCalibrationVelocityMmS = 10.0f;
constexpr float kAxisCalibrationBackoffMm = kLeadScrewMmPerRev;
constexpr float kAxisCalibrationMaxTravelMm = 210.0f;
constexpr float kMaxStallTestTravelMm = 200.0f;
constexpr uint8_t kStallGuardThreshold = 160;
constexpr uint8_t kAxisCalibrationSeekMinSgthrs = 160;
constexpr uint8_t kAxisCalibrationSeekMaxSgthrs = 160;
constexpr float kStallGuardArmVelocityMmS = 10.0f;
constexpr uint32_t kAxisCalibrationSeekMaxDiagIgnoreMs = 2000;
constexpr uint32_t kStallGuardCoolThreshold = 1500;
constexpr bool kMotorDirectionInverted = true;
constexpr bool kMotorEnableActiveLow = true;
constexpr bool kEndstopActiveLow = true;
}  // namespace Config
