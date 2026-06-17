# Change Log

Use this file for confirmed problems/fixes and meaningful design changes. Keep suspected or unverified risks in `docs/possible-issues.md`.

When adding an entry, use this format:

```text
## YYYY-MM-DD - Short Title

What changed:

Why:

Verification:
```

## 2026-06-16 - Motor Bring-Up Safety And GPIO48 Direction Fix

What changed:

- Updated the TMC2209 sense resistor value in `MotorController.cpp` to `0.05 ohm`, matching the observed resistor marking / Adafruit TMC2209 schematic.
- Reduced initial configured motor current to `300 mA RMS` for safer bring-up with the small NEMA 14 motor.
- Updated `Config::kStepperFullStepsPerRev` from `200` to `400` for the 0.9 degree stepper motor.
- Changed motor startup behavior so the driver remains disabled after boot/configuration.
- Added motor state helpers for enabled state, velocity mode, endstop state, position in steps, and position in mm.
- Added queued JSON commands:
  - `motor.status`
  - `motor.enable`
  - `motor.disable`
- Added periodic yielding in `motorTask` so the high-priority motor service loop does not starve setup or lower-priority tasks.
- Added ESP32-P4 VO4 / VDD_IO_5 LDO build flags so GPIO39-GPIO48 are driven at 3.3 V. This fixed GPIO48 / DIR only reaching about 1.2 V.

Why:

Motor bring-up needed safer behavior before real motion. The previous firmware enabled the motor automatically at boot, assumed the wrong full-steps-per-rev value for the selected motor, and used GPIO48 without explicitly enabling the ESP32-P4 high-GPIO voltage domain. The high-priority motor task also prevented the final boot status and command task from running reliably.

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```

Hardware bring-up observations:

- `motor.status` responds over serial.
- Motor enable/disable command path works.
- Direction now changes correctly after enabling the GPIO39-GPIO48 VO4 LDO domain.
- Endstop status and endstop behavior were confirmed during bring-up.

## 2026-06-16 - Failed Sensors Skipped After Startup

What changed:

- Added a `sensorOnline` array to track which sensors successfully initialize.
- `sensorTask` now skips sensors that failed `begin()`.

Why:

During motor bring-up, failed I2C sensors such as SHT45 or BME688 were still being polled after startup. That caused repeated I2C errors and noisy serial output even though those devices had already reported `begin_failed`.

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```

## 2026-06-16 - Hardware Errata Started

What changed:

- Added `hardware/errata.md`.
- Documented that the current hardware lacks a dedicated endstop connector.
- Documented that the next hardware revision should add more convenient GND access points and test points.

Why:

Motor bring-up exposed practical hardware revision needs. The endstop needs a reliable connector instead of improvised wiring, and additional ground access points make temporary sensors, probes, and debug wiring safer and more reliable.

Verification:

Documentation-only change.

## 2026-06-12 - FireBeetle ESP32-P4 ADC Pin Mapping Fixed

What changed:

- Added `board_build.variant = dfrobot_firebeetle2_esp32p4` to the PlatformIO environment.
- Updated `AnalogD6FSensor::begin()` to perform an initial `analogRead(pin_)` before calling `analogSetPinAttenuation(pin_, ADC_11db)`.

Why:

The generic PlatformIO `esp32-p4` Arduino variant maps `A3` differently than the DFRobot FireBeetle 2 ESP32-P4 variant. The project uses GPIO23 for the D6F analog sensor, which is `A3` on the FireBeetle 2 variant. Without the correct variant, the Arduino ADC core reported:

```text
__analogChannelConfig(): Pin is not configured as analog channel
```

After switching to the DFRobot variant, the ADC core still emitted the same warning because attenuation was set before the first ADC read initialized the pin as an analog channel.

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```

## 2026-06-11 - Motor Commands Routed Through FreeRTOS Queue

What changed:

- Added a motor command queue with depth 8.
- `commandTask` now validates motor JSON commands and queues them.
- `motorTask` now owns `MotorController`, drains queued commands, and applies them before `motor.service()`.
- Motor commands now require their fields instead of defaulting to current motor position.

Why:

`commandTask` and `motorTask` previously touched motor state directly. The queue gives motor state clear ownership and reduces race-condition risk with `AccelStepper`.

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```

## 2026-06-11 - Boot Status Reports Warning Severity

What changed:

- Added optional `severity` to status telemetry.
- Startup failures now report `"severity":"warning"`.
- Final boot status reports `ready_with_warnings` if any warning occurred during setup.

Why:

Boot failures were reported individually, but the final `boot` status always said `ready`. The new status makes bring-up problems easier to spot without changing hardware behavior.

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```

## 2026-06-10 - PlatformIO Build Failed From Edited TMCStepper Header

What changed:

Removed an accidental `move` token from the generated dependency file `.pio/libdeps/esp32-p4/TMCStepper/src/TMCStepper.h`.

Why:

`pio run` failed while compiling `TMCStepper`. The compiler reported:

```text
stray '#' in program
move#pragma once
```

The first line needed to be:

```cpp
#pragma once
```

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```
