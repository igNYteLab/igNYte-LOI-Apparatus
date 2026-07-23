<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
GitHub: https://github.com/andre-llaneta
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# ESP32-P4 Sensor Hub Firmware

This is the active PlatformIO/Arduino firmware for the IgNYte-FPA ESP32-P4 sensor hub. It runs on a DFRobot FireBeetle 2 ESP32-P4 mounted on the `motherV1` interface board.

The firmware is responsible for:

- reading I2C, SPI, and future analog sensors
- controlling the TMC2209 vertical camera stage
- communicating with Bronkhorst flow controllers over RS232
- accepting newline-delimited JSON commands from the host
- publishing timestamped newline-delimited JSON telemetry/status lines

The production IgNYte web app owns the operator UI, camera workflows, recording/export behavior, and Web Serial connection. The firmware owns hardware state, calibrated motor limits, driver configuration, and sensor/flow polling.

## Prerequisites

- PlatformIO, either through the VS Code PlatformIO extension or the
  command-line tool.
- Python 3 if installing PlatformIO from the command line:

```powershell
python -m pip install platformio
```

- USB connection to the ESP32-P4 board.
- Motor-driver/motor power connected before firmware boot when validating
  motor configuration or motion.
- Optional: Chrome or Edge for testing the flashed board through the IgNYte web
  app or browser Web Serial tools.

PlatformIO downloads the ESP32-P4 platform and Arduino libraries listed in
`platformio.ini` during the first build. No manual Arduino library downloads
are required.

## Build And Test

Build the default ESP32-P4 firmware:

```powershell
pio run -d firmware/p4-sensor-hub-arduino
```

Run native command-parser unit tests:

```powershell
pio test -d firmware/p4-sensor-hub-arduino -e native
```

Build the motor-only debug firmware:

```powershell
pio run -d firmware/p4-sensor-hub-arduino -e esp32-p4-motor-debug
```

The motor-only debug build defines `IGNYTE_MOTOR_ONLY_DEBUG=1`. It keeps the command, telemetry, and motor tasks active while skipping sensor and flow-controller initialization/tasks.

Upload the default firmware:

```powershell
pio run -d firmware/p4-sensor-hub-arduino -t upload
```

If PlatformIO cannot find the board automatically, list serial devices:

```powershell
pio device list
```

Then pass the upload port explicitly:

```powershell
pio run -d firmware/p4-sensor-hub-arduino -t upload --upload-port COMx
```

Open the serial monitor:

```powershell
pio device monitor -d firmware/p4-sensor-hub-arduino -b 115200
```

Native tests may require a working desktop compiler toolchain if PlatformIO
does not find one automatically.

## Main Modules

- `include/AppConfig.h`: pin map, addresses, sensor rates, motor constants, and build flags.
- `include/CommandParser.h`, `src/CommandParser.cpp`: hardware-independent JSON command parsing and validation.
- `include/Telemetry.h`, `src/Telemetry.cpp`: JSON document serialization into fixed-size queued lines, then USB serial output from the telemetry task.
- `include/Timebase.h`: monotonic MCU microsecond timestamp helper.
- `include/sensors/*`, `src/sensors/*`: sensor wrappers built around a common `SensorBase` schedule.
- `include/devices/MotorController.h`, `src/devices/MotorController.cpp`: stage calibration, software limits, velocity/target planning, StallGuard handling, and driver profile changes.
- `include/devices/HardwareStepGenerator.h`, `src/devices/HardwareStepGenerator.cpp`: ESP32-P4 MCPWM STEP generation, DIR output, and PCNT step counting.
- `include/devices/IoExpander.h`, `src/devices/IoExpander.cpp`: MCP23017 helper for motor MS1/MS2 pins.
- `include/devices/ProparAsciiClient.h`, `src/devices/ProparAsciiClient.cpp`: minimal Bronkhorst ASCII ProPar client.
- `src/main.cpp`: task creation, command dispatch, boot sequence, and sensor/flow/motor orchestration.

## Task Model

The Arduino ESP32-P4 core runs on ESP-IDF/FreeRTOS. The firmware creates explicit tasks:

| Task | Priority | Role |
| --- | ---: | --- |
| `telemetryTask` | 1 | Drains queued fixed-size JSONL strings to USB serial. |
| `motorTask` | 5 | Updates motion planning, calibration, limits, velocity watchdog, and StallGuard handling every 1 ms. |
| `commandTask` | 3 | Reads newline-delimited JSON commands from USB serial and dispatches parsed commands. |
| `fastI2cSensorTask` | 2 | Polls short I2C reads for SHT45 and SEN0496. |
| `bmeSensorTask` | 2 | Runs BME688 measurements with async start/finish so heater wait time does not hold the I2C bus. |
| `thermocoupleTask` | 2 | Polls MAX31856 thermocouple channels over SPI. |
| `flowTask` | 2 | Polls both Bronkhorst controller channels. |
| `loop()` | n/a | Idle delay only. |

`motorTask` owns `MotorController`. The command task never mutates motor state directly. It queues motor requests to `motorTask`, while `motor.velocity_mm_s` uses a one-slot latest-wins mailbox plus a watchdog so streamed camera commands do not build stale motion.

I2C access is protected by an I2C mutex because SHT45, SEN0496, BME688, MCP23017, and `i2c.scan` share `Wire`. SPI thermocouple access is protected by a separate SPI mutex.

Telemetry is also decoupled from producer tasks. Tasks enqueue serialized JSONL text into a fixed-size telemetry queue; only `telemetryTask` writes to USB serial. This keeps blocked or slow host serial reads out of the motor task hot path.

## Pin Summary

`include/AppConfig.h` is the source of truth. This section is a quick orientation summary.

### I2C

| Signal | GPIO |
| --- | ---: |
| SDA | 7 |
| SCL | 8 |

Current I2C devices:

- SHT45 at `0x44`
- BME688 at `0x77`
- SEN0496 oxygen sensor at `0x70`
- MCP23017 I/O expander at `0x20`

### SPI / Thermocouples

| Signal | GPIO |
| --- | ---: |
| SCK | 28 |
| MOSI | 29 |
| MISO | 30 |

| Firmware sensor | Physical thermocouple order | CS GPIO |
| --- | ---: | ---: |
| `tc1` | 1 | 21 |
| `tc2` | 2 | 36 |
| `tc3` | 3 | 35 |
| `tc4` | 4 | 20 |
| Reserved SPI CS | 5 | 34 |
| Reserved SPI CS | 6 | 31 |

The confirmed physical thermocouple order is GPIO `21, 36, 35, 20`, mapped to `tc1`, `tc2`, `tc3`, and `tc4`.

### Motor / TMC2209

| Signal | GPIO |
| --- | ---: |
| DIR | 48 |
| STEP | 49 |
| DIAG | 50 |
| INDEX | 52 |
| ENDSTOP | 51 |
| TMC2209 UART RX | 32 |
| TMC2209 UART TX | 23 |
| Driver enable | 33 |

GPIO23 is currently used as TMC2209 UART TX, so the D6F analog wrapper remains in the repo but is not instantiated in the active ESP32-P4 build.

### Bronkhorst RS232

| Channel | TX GPIO | RX GPIO |
| --- | ---: | ---: |
| Flow 1 | 4 | 5 |
| Flow 2 | 37 / D1 | 38 / D0 |

Flow-controller hardware validation is still future work. Flow 2 GPIO37/GPIO38 boot/download/logging risk is tracked in `../../hardware/errata.md`.

## Sensor Sampling Model

Sensor telemetry is event-based. The firmware does not emit a combined row containing every sensor value. Each sensor emits its own sample when due:

```json
{"type":"sample","sensor":"tc1","t_us":123456789,"temp_c":613.4,"ok":true}
{"type":"sample","sensor":"sht45","t_us":123500000,"temp_c":24.1,"rh_pct":41.0,"ok":true}
```

This avoids stale values from slower sensors and avoids filling absent fields with `null`. The host/web app should align samples by timestamp during logging or post-processing.

Default rates:

| Sensor | Default rate |
| --- | ---: |
| MAX31856 thermocouples | 1 Hz each |
| SHT45 | 10 Hz |
| BME688 | 2 Hz |
| SEN0496 oxygen | 1 Hz |
| Bronkhorst readback | 5 Hz |

Rates can be changed at runtime with `sensor.rate`. Full command and sample formats are documented in `../../docs/firmware-serial-protocol.md`.

## Motor Architecture

The vertical camera stage is driven by a TMC2209 stepper driver.

Current split:

- `TMCStepper` configures the TMC2209 over UART.
- `HardwareStepGenerator` converts steps/second into MCPWM output and uses PCNT to count commanded step edges.
- `MotorController` converts between millimeters and steps, applies acceleration, handles calibration, enforces calibrated limits, and owns apparatus-specific motor commands.

Current mechanical/configuration assumptions:

| Parameter | Value |
| --- | ---: |
| Motor full steps/rev | 200 |
| Lead screw | 2 mm/rev |
| Microsteps | 4 |
| Steps/mm | 400 |
| Max speed | 25 mm/s |
| Max acceleration | 40 mm/s^2 |
| Axis calibration speed | 10 mm/s |
| Axis calibration max travel | 210 mm |
| Motor current | 950 mA RMS configured |
| Motor direction inverted | true |

The motor driver and motor supply should be powered before firmware boot when validating motor behavior. If the TMC2209 is unpowered during initial configuration, it can miss UART setup writes. `motor.calibrate_axis` re-runs driver configuration before calibration motion, but operators should still verify `motor.driver_status` before trusting motion scale.

Normal target and velocity motion use SpreadCycle for higher-speed stability. StallGuard test and axis calibration use StealthChop because StallGuard4 depends on that operating window. After successful axis calibration, normal absolute target commands and nonzero velocity commands are allowed only while calibrated limits are valid.

## Bronkhorst Flow Assumptions

The current firmware implements a minimal ASCII ProPar client because it is simpler to bring up than the enhanced binary protocol.

Current assumptions:

- one controller per RS232 channel
- point-to-point wiring
- node address `0x80`
- serial format `38400,n,8,1`
- raw setpoint/measure scale `0..32000`

Percent commands convert to raw setpoint units:

| Raw value | Meaning |
| ---: | --- |
| 0 | 0% |
| 16000 | 50% |
| 32000 | 100% |

Flow-controller hardware was not available during main bring-up, so real controller validation remains future work in `../../docs/futurework.md`.

## Native Unit Tests

The native PlatformIO environment builds only the command parser and runs Unity tests:

```ini
[env:native]
platform = native
test_framework = unity
test_build_src = yes
build_src_filter =
  -<*>
  +<CommandParser.cpp>
```

This keeps parser tests independent from Arduino/ESP32 hardware dependencies. Add more native tests by extracting logic into hardware-independent files with narrow data structures.
