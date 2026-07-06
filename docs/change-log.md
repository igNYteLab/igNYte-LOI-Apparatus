# Change Log

Use this file for confirmed problems/fixes and meaningful design changes. Keep suspected or unverified risks in `docs/possible-issues.md`.

When adding an entry, use this format:

```text
## YYYY-MM-DD - Short Title

What changed:

Why:

Verification:
```

## 2026-07-06 - Remove Obsolete Motor JSON Commands

What changed:

- Removed public JSON command handling for `motor.move_steps`, `motor.driver_configure`, and `motor.stall_home`.
- Removed the now-unreachable standalone StallGuard homing state machine, `StallHome*` motion events, homing-only config constants, and `stall_home_*` diagnostic fields.
- Updated command references and project context so operators use `motor.target_mm` for absolute motion, boot-time driver configuration for TMC setup, and `motor.calibrate_axis` for the bounded two-ended calibration workflow.

Why:

These commands were bring-up/debug paths that are no longer part of the intended operator API. Keeping them documented and accepted increases the chance of bypassing the current calibrated-limits workflow.

Verification:

Normal `esp32-p4` PlatformIO build completed successfully after cleanup.

## 2026-07-06 - Refactor Command Parser And Add Unit Tests

What changed:

- Moved JSON command parsing and validation from `main.cpp` into hardware-independent `CommandParser.h` / `CommandParser.cpp`.
- Added a PlatformIO `native` environment that builds only the parser and runs Unity tests.
- Added parser unit tests for valid motor commands, missing fields, invalid ranges, removed command rejection, flow percent clamping, calibration defaults, and `sensor.rate` behavior.
- Updated GitHub Actions to run `pio test -d firmware/p4-sensor-hub-arduino -e native` after the firmware build.

Why:

Command parsing is logic that can be tested without ESP32 hardware. Moving it out of `main.cpp` reduces task/orchestration complexity and creates a practical unit-test target.

Verification:

Normal `esp32-p4` PlatformIO build completed successfully. Native parser unit tests passed locally after adding `C:\msys64\ucrt64\bin` to the active shell `PATH`.

## 2026-07-06 - Calibration Required For Normal Motor Motion

What changed:

- Normal target and velocity motor commands now require valid calibrated software limits before motion is accepted.
- `motor.target_mm` and nonzero `motor.velocity_mm_s` are rejected before axis calibration completes.
- Rejections report `calibration_incomplete`; velocity rejection also clears the velocity mailbox/watchdog state so a rejected command cannot arm stale motion control.
- StallGuard test and axis calibration remain available before calibration because they are the intended bounded bring-up paths.

Why:

Manual target/velocity motion before calibration has no trusted software travel limits. Requiring valid limits prevents ordinary motion commands from bypassing the calibrated operating range.

Verification:

Normal `esp32-p4` PlatformIO build completed successfully. Motor-only debug build is intended to be verified locally before use.

## 2026-07-06 - Documentation Drift Sync

What changed:

- Updated motor protocol docs to match current firmware constants: `8` microsteps, `800 steps/mm`, `SGTHRS=158`, `25 mm/s` max stage speed, `20 mm/s` calibration speed, `200 mm` stall-test travel, and `300 mm` axis-calibration travel.
- Updated `docs/project-context.md` with the current motor scaling, generalized the TMC2209 boot-power warning, and added the GitHub Actions CI description.
- Updated `docs/possible-issues.md`, `docs/workflow.md`, `docs/README.md`, and the OpenCV prototype README to remove stale microstep/task/controller descriptions.

Why:

Firmware, CI, and OpenCV control behavior moved faster than the Markdown references. The docs needed to match the current source before the next push.

Verification:

Compared docs against `firmware/p4-sensor-hub-arduino/include/AppConfig.h`, `firmware/p4-sensor-hub-arduino/src/main.cpp`, `.github/workflows/firmware-opencv.yml`, and the OpenCV prototype source.

## 2026-07-02 - Axis Calibration DIAG Re-Arm Guard

What changed:

- Added a `2000 ms` DIAG ignore window at the start of axis calibration's positive/max seek. This prevents a stale or re-latched StallGuard DIAG event from immediately ending the max seek right after the min-side detection and backoff.

Why:

Re-arming DIAG immediately after the min backoff could preserve or re-latch a transient DIAG event, causing the max seek to stop as soon as it started.

Verification:

Hardware test confirmed axis calibration completed correctly after adding the max-seek DIAG ignore window.

## 2026-07-02 - Motor Driver Boot Power Requirement

What changed:

- Documented that the motor driver must be powered when firmware boots/configures the TMC2209.
- Added `mstep_reg_select(true)` to make UART-selected microsteps explicit before writing the configured microstep value.

Why:

If the driver is not powered during initial configuration, it misses the UART microstep command and can remain at its default/readback value of `8` microsteps even though firmware is calculating motion for `4`. That made firmware use `400 steps/mm` while the driver behaved like `800 steps/mm`, so a `100 mm` target moved about `50 mm`.

Verification:

`motor.driver_status` exposed the microstep mismatch by reporting `8` when the driver missed boot-time configuration.

## 2026-07-02 - High-Speed Motor Step Rate Tuning

What changed:

- Reduced TMC2209 microstepping from `16` to `4` to lower the required step-pulse rate and improve behavior at higher stage speeds.
- Tested ramped velocity control as an alternative to instant `runSpeed()` velocity changes, but did not keep it because it produced inconsistent speed behavior during hardware testing.

Why:

At `16` microsteps and a `2 mm/rev` lead screw, `20 mm/s` requires about `32000 steps/s`. Reducing to `4` microsteps lowers that to about `8000 steps/s`, which is more realistic for the current AccelStepper polling approach.

Verification:

Hardware speed testing showed that lower microstepping behaved better at higher requested speeds than the ramped velocity experiment.

## 2026-07-02 - Motor Velocity Watchdog Stop Behavior Fixed

What changed:

- Changed the motor stop path to clear AccelStepper's current target/speed state immediately instead of asking AccelStepper to plan a decelerated stop after velocity-mode motion.
- Confirmed this fixed the observed watchdog behavior where the stage moved, slowed sharply after timeout, sped up again briefly, then finally stopped.

Why:

Velocity mode uses `setSpeed()` with `runSpeed()`, while AccelStepper's normal `stop()` path is designed around acceleration-planned `run()` motion. Switching from velocity mode into `stop()` could leave the planner in a state that caused a decelerate/re-accelerate/stop sequence after the velocity watchdog expired.

Verification:

Hardware test confirmed that the watchdog stop no longer produces the slow-then-speed-up-then-stop behavior.

## 2026-07-02 - Motor Calibration And OpenCV Serial Docs Synced

What changed:

- Updated Markdown docs to match the current firmware motor behavior: velocity latest-wins mailbox, `2000 ms` velocity watchdog, axis calibration, calibrated software limits, and expanded motor status fields.
- Updated documented motor constants to current firmware values: `SGTHRS=65`, stall homing velocity `-4.0 mm/s`, axis calibration velocity `8.0 mm/s`, and inverted motor direction enabled.
- Updated camera/OpenCV docs to reflect that the prototype now connects over Web Serial, sends manual motor commands, supports Calibrate Axis, and can run rate-limited auto control.

Why:

The docs had drifted while motor calibration and OpenCV serial-control bring-up moved quickly. Keeping protocol docs aligned with firmware behavior prevents webapp and test-script work from using stale command assumptions.

Verification:

Compared docs against `firmware/p4-sensor-hub-arduino/include/AppConfig.h`, `firmware/p4-sensor-hub-arduino/src/main.cpp`, and the OpenCV prototype source.

## 2026-06-30 - Sensor Telemetry Verified In Web App

What changed:

- Confirmed that the BME688, SHT45, and MAX31856 thermocouple sensors are working as expected on the current hardware/firmware setup.
- Confirmed that their firmware JSON telemetry reaches the Ignyte web app and is displayed there as live readings.

Why:

This verifies the end-to-end sensor path from physical sensor hardware through ESP32-P4 firmware JSON output into the operator web app. It reduces risk around the current sensor interfaces before adding camera/OpenCV tracking and tighter experiment orchestration.

Verification:

Hardware/webapp bring-up confirmed live readings for BME688, SHT45, and thermocouple channels in the Ignyte web app.

## 2026-06-24 - Sensor Sampling Throughput Fix

What changed:

- Put MAX31856 thermocouple converters into continuous conversion mode instead of the Adafruit library's default one-shot mode.
- Updated the sensor scheduler to mark each sensor read from the actual completion time instead of one shared scan-start timestamp.
- Split sensor polling into fast I2C, BME688, and thermocouple tasks with I2C/SPI bus mutexes.
- Changed BME688 polling to an async start/finish cycle so the gas-heater wait does not hold the I2C bus.

Why:

With all sensors connected, the four thermocouple reads and BME688 heater wait were blocking long enough that the whole sensor list collapsed to the full-scan rate, about `0.7 Hz`. Continuous MAX31856 conversion removes the large per-thermocouple one-shot wait, per-sensor completion timestamps stop all sensors from being rescheduled from a stale timestamp, and split tasks prevent the BME688 heater wait from delaying SHT45/SEN0496 reads.

Verification:

PlatformIO build completed successfully.

## 2026-06-24 - Project Context Firmware Sync

What changed:

- Swept `docs/project-context.md` against the current firmware state and updated stale motor, sensor, analog, and build-status notes.
- Documented that Analog 1 must not be used as a sensor input on the current hardware because it has been bodged into the TMC2209 UART path.
- Updated hardware errata to state that the endstop needs real header pins / a dedicated header connector, not improvised wiring.
- Updated hardware errata to state that the TMC2209 UART RX path needs a proper board route through a 1 kOhm series resistor.

Why:

The project context is used as the handoff document for future bring-up work, so it needs to reflect current firmware and hardware constraints rather than earlier scaffold assumptions.

Verification:

Cross-checked against `AppConfig.h`, `main.cpp`, and the current wrapper files.

## 2026-06-24 - Main Refactor Follow-Up Flag

What changed:

- Flagged `main.cpp` for a post-hardware-bring-up refactor once the command set and device list stabilize.

Why:

`main.cpp` now contains serial command parsing, command validation, telemetry publishers, motor command dispatch, sensor list setup, and task orchestration. That was useful during bring-up, but the file should be split after hardware validation so command handling and telemetry publishing are easier to maintain.

Verification:

No firmware behavior changed.

## 2026-06-24 - SEN0496 Oxygen Sensor Bring-Up

What changed:

- Added a local `Sen0496Sensor` wrapper for the DFRobot SEN0496 I2C oxygen sensor without adding a PlatformIO library dependency.
- Added the `o2` sensor instance at default I2C address `0x70` and default rate `1 Hz`.
- Updated JSON command docs and the serial protocol reference to include the `o2` sensor, expected I2C address, and oxygen sample shape.

Why:

The full board needs to detect and later sample the new I2C oxygen sensor while keeping the shared I2C setup under firmware control.

Verification:

Pending hardware validation with `i2c.scan`; SEN0496 address should appear as `0x70` unless its DIP switch is configured for `0x71`-`0x73`.

## 2026-06-24 - JSON Command Reference

What changed:

- Added `docs/jsoncommands.md` as a standalone quick reference for every newline-delimited JSON command, including required inputs, normal responses, rejected responses, and automatic sample/status outputs.

Why:

The firmware now has enough motor, StallGuard, flow, I2C, and sensor bring-up commands that the protocol needed a concise operator-facing command sheet.

Verification:

Cross-checked the command list against `handleCommand()` in `main.cpp`.

## 2026-06-23 - Full Board Sensor Bring-Up Commands

What changed:

- Re-enabled the sensor polling task for full-board I2C/SPI bring-up.
- Added `i2c.scan` to report detected I2C device addresses on the configured SDA/SCL pins.
- Added `sensor.status` to report each instantiated sensor's startup state and polling rate.

Why:

The full board needs a direct way to distinguish bus/address problems from individual sensor driver failures during bring-up.

Verification:

Pending hardware validation on the assembled full board.

## 2026-06-23 - New Motor StallGuard Threshold

What changed:

- Retuned the default TMC2209 StallGuard4 threshold from `SGTHRS=35` to `SGTHRS=55` for the new motor. Runtime overrides remain available through `motor.stall_config`.

Why:

The new motor needed a higher StallGuard threshold to detect the intended stall point reliably during sensorless homing.

Verification:

Hardware testing on the new motor verified `SGTHRS=55` as the working threshold.

## 2026-06-22 - TMC2209 StallGuard4 Calibration And DIAG Interrupt

What changed:

- Configured the TMC2209 for StealthChop with tuned defaults `SGTHRS=35` and `TCOOLTHRS=1500`; runtime overrides remain available through `motor.stall_config`.
- Added a rising-edge interrupt for the TMC2209 DIAG signal on GPIO 50. The ISR only latches the event; the motor task performs the stop and reporting.
- Added runtime `motor.stall_config`, `motor.stall_status`, and bounded `motor.stall_test` commands.
- Added bounded `motor.stall_home` automation that seeks negative, accepts StallGuard or the physical endstop as the reference, backs off one 2 mm screw revolution, and sets the backed-off position to zero.
- Added readback for `SG_RESULT`, `SGTHRS`, `TSTEP`, `TCOOLTHRS`, `TPWMTHRS`, chopper mode, interrupt state, and test travel.
- Added explicit completion events for stall detection, travel-limit completion, and physical-endstop completion.
- Added a mutex-protected diagnostics path outside the motor pulse-generation task so SG_RESULT sampling does not block step servicing.
- Added `Config::kMotorDirectionInverted` and enabled it so logical negative motion travels in the opposite physical direction without changing motor wiring or TMC UART shaft state.
- Removed unused StallGuard accessors and the inactive D6F runtime object while GPIO 23 is assigned to TMC2209 UART TX.
- Restored the sensor polling task after motor-only bring-up and moved `motor.driver_status` off the motor pulse-generation task.
- The active branch uses `200` full steps/rev and `600 mA RMS`, superseding the earlier temporary `400` steps/rev and `300 mA RMS` bring-up values. The motor current still requires validation against the exact motor rating.
- Documented the calibration and hardware bring-up procedure.

Why:

TMC2209 StallGuard4 produces a pulse on DIAG rather than a persistent software-readable event. Reliable calibration also depends on motor current, velocity, temperature, `SGTHRS`, and the `TCOOLTHRS >= TSTEP > TPWMTHRS` operating window. The firmware needed interrupt capture, bounded motion, and register readback before sensorless detection could be tested safely.

Verification:

PlatformIO build for `esp32-p4` completed successfully.

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
- Documented that the current hardware lacks a dedicated endstop connector and needs header pins for a reliable endstop connection.
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
