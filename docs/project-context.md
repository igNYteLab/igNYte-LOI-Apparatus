# IgNYte-FPA Project Context

This document captures the major firmware design decisions, assumptions, and known follow-up work for the IgNYte-FPA sensor hub. It is intended for future contributors and future Codex/Claude sessions

## System Purpose

The custom board sits between a laptop and the experimental apparatus hardware. Its main MCU is an ESP32-P4 FireBeetle 2. The firmware is responsible for:

- reading multiple I2C sensors
- reading multiple SPI sensors
- reading analog sensors
- controlling a TMC2209-driven vertical camera stage
- communicating with two Bronkhorst flow controllers over RS232
- streaming timestamped data to the laptop
- accepting laptop commands for flow and motor control

The laptop is expected to run camera/OpenCV processing. The laptop will track the flame and send motor/flow commands to the ESP32-P4. The ESP32-P4 should keep motor response independent from slower sensor reads and logging.

## Firmware Architecture Decision

There are two firmware skeletons in the repo:

- `firmware/p4-sensor-hub`: ESP-IDF skeleton
- `firmware/p4-sensor-hub-arduino`: PlatformIO/Arduino skeleton

The current active bring-up path is PlatformIO/Arduino because it is quicker to iterate and matches the developer's current comfort level. The code is intentionally organized into small wrappers so a later ESP-IDF port is easier:

- app logic is in `main.cpp`
- central hardware constants are in `AppConfig.h`
- each sensor has a small wrapper class
- motor control has a `MotorController` wrapper
- Bronkhorst ProPar has a `ProparAsciiClient` wrapper
- telemetry output is centralized in `Telemetry`

The intent is that Arduino-specific libraries are contained mostly inside wrapper implementation files. If porting to ESP-IDF later, replace those driver internals rather than rewriting the whole application structure.

## FreeRTOS Use

The PlatformIO firmware uses the ESP32 Arduino core, which runs on top of ESP-IDF/FreeRTOS. The firmware explicitly creates FreeRTOS tasks:

```cpp
xTaskCreate(motorTask, "motor", 4096, nullptr, 5, nullptr);
xTaskCreate(commandTask, "commands", 6144, nullptr, 3, nullptr);
xTaskCreate(sensorTask, "sensors", 8192, nullptr, 2, nullptr);
xTaskCreate(flowTask, "flow", 6144, nullptr, 2, nullptr);
```

Current task roles:

- `motorTask`, priority 5: calls `motor.service()` frequently so STEP/DIR motion is not blocked by sensor or flow operations.
- `commandTask`, priority 3: reads newline-delimited JSON commands from USB serial.
- `sensorTask`, priority 2: polls sensors when their individual rates say they are due.
- `flowTask`, priority 2: polls both Bronkhorst controllers periodically.
- `loop()`: idle delay only.

Important follow-up: motor state is currently touched by both `commandTask` and `motorTask`. This is acceptable for early bring-up, but a command queue should eventually be added so only `motorTask` mutates the stepper object.

## Pin Map

The source of truth is `firmware/p4-sensor-hub-arduino/include/AppConfig.h`.

### I2C

| Signal | GPIO |
| --- | ---: |
| SDA | 7 |
| SCL | 8 |

Known I2C devices for first bring-up:

- SHT45
- BME688

The board may later support more I2C devices, including via an I/O expander board.

### SPI

| Signal | GPIO |
| --- | ---: |
| SCK | 28 |
| MOSI | 29 |
| MISO | 30 |

Thermocouple chip-select pins:

| Channel | GPIO |
| --- | ---: |
| TC1 CS | 21 |
| TC2 CS | 20 |
| TC3 CS | 36 |
| TC4 CS | 35 |
| TC5 CS | 34 |
| TC6 CS | 31 |

First bring-up uses 4 MAX31856 thermocouple boards. The board has capacity for 6 SPI chip-selects.

### Analog

| Signal | GPIO |
| --- | ---: |
| D6F analog output | 23 / A3 |

The first analog sensor is an Omron D6F-V03A1 flow velocity sensor.

### TMC2209 / Vertical Stage

| Signal | GPIO |
| --- | ---: |
| DIR | 48 |
| STEP | 49 |
| DIAG | 50 |
| INDEX | 52 |
| ENDSTOP | 51 |
| TMC2209 UART | 32 |
| Driver enable | 33 |

`GPIO32` is assumed to be the TMC2209 single-wire UART pin. `GPIO33` is the motor driver enable pin.

### Bronkhorst RS232

The two Bronkhorst controllers are point-to-point, one controller per RS232 channel.

| Channel | TX GPIO | RX GPIO |
| --- | ---: | ---: |
| Flow 1 | 4 | 5 |
| Flow 2 | 37 / D1 | 38 / D0 |

## Dependencies

The current PlatformIO project uses real libraries:

- `ArduinoJson`: JSON command parsing and telemetry output
- `TMCStepper`: TMC2209 UART configuration/status
- `AccelStepper`: STEP/DIR motion timing
- `Adafruit MAX31856 library`: thermocouple reads
- `Adafruit SHT4x Library`: SHT45 reads
- `Adafruit BME680 Library`: BME688 reads

These dependencies are declared in `firmware/p4-sensor-hub-arduino/platformio.ini`.

## Telemetry Design

The MCU streams newline-delimited JSON over USB serial. One JSON object is printed per line. The laptop should read the serial stream and save it as `.jsonl` and/or transform it into CSV later.

The MCU does not directly save files to the laptop. It only streams data. The host software is responsible for recording.

Every outgoing message includes an MCU timestamp:

```json
{"type":"sample","t_us":123456789,"sensor":"tc1","temp_c":613.4}
```

The timestamp is generated from `esp_timer_get_time()` through `Timebase.h`. It is a monotonic microsecond timestamp since boot. It is suitable for relative synchronization between MCU events. For camera correlation, the laptop should also timestamp receipt. A tighter sync protocol can be added later if needed.

## Sensor Sampling Model

Sensors do not emit a combined row. Each sensor emits its own sample only when that sensor is due.

Example:

```json
{"type":"sample","sensor":"d6f_v03a1","t_us":100000,"voltage_v":1.12,"velocity_m_s":1.52}
{"type":"sample","sensor":"d6f_v03a1","t_us":120000,"voltage_v":1.13,"velocity_m_s":1.54}
{"type":"sample","sensor":"sht45","t_us":500000,"temp_c":24.1,"rh_pct":41.0}
```

This means faster sensors do not carry stale readings from slower sensors, and slower sensor fields are not emitted as `null`. The raw log is event-based. The laptop analysis layer can later resample, interpolate, or carry-forward values if a table aligned to a common timebase is desired.

Each sensor wrapper inherits from `SensorBase`, which stores:

- sensor name
- rate in Hz
- next due timestamp

The current default rates are:

| Sensor | Default rate |
| --- | ---: |
| MAX31856 thermocouples | 10 Hz each |
| SHT45 | 2 Hz |
| BME688 | 2 Hz |
| D6F-V03A1 analog | 50 Hz |
| Bronkhorst readback | 5 Hz |

The sensor rate can be changed at runtime with:

```json
{"cmd":"sensor.rate","sensor":"tc1","hz":20}
```

## Known Sensors

### MAX31856 Thermocouples

The first SPI devices are MAX31856 thermocouple converters. The wrapper currently assumes type K thermocouples:

```cpp
thermocouple_.setThermocoupleType(MAX31856_TCTYPE_K);
```

Output fields include:

- thermocouple temperature in Celsius
- cold-junction temperature in Celsius
- fault byte
- validity flag

### SHT45

The SHT45 wrapper reads:

- temperature in Celsius
- relative humidity in percent

It currently uses high precision and no heater.

### BME688

The BME688 wrapper reads:

- temperature in Celsius
- pressure in hPa
- relative humidity in percent
- gas resistance in kohm

The default I2C address in the wrapper is `0x77`. Some boards may use `0x76`; this should be verified with an I2C scan.

### Omron D6F-V03A1

The D6F-V03A1 is connected as an analog voltage sensor on GPIO23/A3.

The firmware logs:

- raw ADC count
- voltage in volts
- estimated velocity in m/s

The velocity estimate uses piecewise interpolation from the sensor table:

| Voltage | Velocity |
| ---: | ---: |
| 0.50 V | 0.00 m/s |
| 0.70 V | 0.75 m/s |
| 1.11 V | 1.50 m/s |
| 1.58 V | 2.25 m/s |
| 2.00 V | 3.00 m/s |

Because the Omron data references a specific 48 mm wind tunnel condition, raw voltage should always be logged alongside calculated velocity.

## Motor Control Design

The vertical camera stage is driven by a stepper motor through a TMC2209.

Current design:

- `TMCStepper` configures the TMC2209 over UART.
- `AccelStepper` generates STEP/DIR pulses in software.
- `MotorController` wraps both libraries and exposes apparatus-specific commands.

This separation matters:

- `TMCStepper` talks to the driver chip and sets things like current and microstepping.
- `AccelStepper` calculates step timing and toggles `STEP`/`DIR`.
- `MotorController` knows project-specific rules like no negative position and millimeter-to-step conversion.

Current mechanical assumptions:

| Parameter | Value |
| --- | ---: |
| Motor full steps/rev | 200 |
| Lead screw | 2 mm/rev |
| Microsteps | 16 |
| Steps/mm | 1600 |
| Max speed | 8 mm/s |
| Max acceleration | 20 mm/s^2 |

The expected stage is a vertical FUYU-style NEMA14 screw stage with a 2 mm lead. The endstop is currently assumed to be a bottom/home switch, so home is position `0 mm` and upward travel is positive.

Current motor commands:

```json
{"cmd":"motor.move_steps","steps":1600}
{"cmd":"motor.target_mm","mm":1.0}
{"cmd":"motor.velocity_mm_s","mm_s":2.0}
{"cmd":"motor.stop"}
{"cmd":"motor.home_here"}
```

Important safety assumptions:

- negative target positions are clamped to 0
- enable is active-low
- endstop is active-low
- moving below home should be prevented

Important follow-up:

- add a configured maximum travel in mm
- add a formal homing routine
- add command queueing for thread safety
- verify direction polarity on hardware
- verify current limit before connecting the real motor
- consider timer/RMT-based step generation if `AccelStepper` is not smooth enough at desired speeds

## Bronkhorst Flow Controller Design

The Bronkhorst controllers use RS232 through UART-to-RS232 converters.

The Bronkhorst manual describes ProPar communication with two options:

- ASCII protocol
- enhanced binary protocol

The current firmware implements a minimal ASCII ProPar client because it is easier to bring up and matches the simple master/slave use case.

Current assumptions:

- one controller per RS232 channel
- point-to-point connection
- node address `0x80` initially, because the manual says point-to-point instruments should respond to that address
- serial format `38400, n, 8, 1`
- ASCII ProPar framing

The user mentioned `187500` and `400000` baud as possible values from documentation or device configuration. The manual pages inspected during setup showed `38400,n,8,1` as a default/common RS232 value. Baud should be made configurable and verified against the exact controllers.

Current implemented functions:

- write raw setpoint
- read raw measure

Raw Bronkhorst setpoint/measure values use a `0..32000` scale:

| Raw value | Meaning |
| ---: | --- |
| 0 | 0% |
| 16000 | 50% |
| 32000 | 100% |

Current flow command:

```json
{"cmd":"flow.set","channel":1,"pct":50}
```

This converts `50%` to raw value `16000`.

Future work should add physical-unit support, such as SCCM:

```json
{"cmd":"flow.set","channel":1,"sccm":250}
```

The Python `bronkhorst-propar` package is useful for laptop-side validation and as a reference, but it cannot run inside ESP32 firmware. If the flow controllers remain wired to the P4, the firmware needs a native C++ subset of ProPar, which is what `ProparAsciiClient` starts.

## Command Protocol

Commands are newline-delimited JSON sent from laptop to MCU over USB serial.

Current examples:

```json
{"cmd":"motor.move_steps","steps":1600}
{"cmd":"motor.target_mm","mm":1.0}
{"cmd":"motor.velocity_mm_s","mm_s":2.0}
{"cmd":"motor.stop"}
{"cmd":"motor.home_here"}
{"cmd":"flow.set","channel":1,"pct":50}
{"cmd":"sensor.rate","sensor":"tc1","hz":20}
```

Current command responses are status messages, also JSONL:

```json
{"type":"status","t_us":123456789,"component":"flow1","status":"setpoint_ok"}
```

Future command protocol improvements:

- add command IDs so the laptop can match responses to requests
- add explicit error codes
- add query commands for motor state and sensor config
- add physical-unit flow commands
- add safety limit commands only after validation

## Major Runtime Assumptions To Validate

The code builds successfully, but these hardware/runtime assumptions still need validation:

- `Serial` is USB CDC and does not conflict with `HardwareSerial(0)` used for Flow 2.
- `HardwareSerial(0)` can safely be used for GPIO37/GPIO38 on this ESP32-P4 board.
- TMC2209 single-wire UART works using `HardwareSerial.begin(..., rx=32, tx=32)`.
- TMC2209 driver address is `0b00`.
- TMC2209 sense resistor is `0.11 ohm`.
- 600 mA RMS current is appropriate for the selected NEMA14 motor.
- MAX31856 thermocouples are type K.
- BME688 address is `0x77`; verify whether it should be `0x76`.
- D6F output voltage is inside the ESP32-P4 ADC input range under all conditions.
- Bronkhorst controllers use the expected baud and respond to node `0x80`.
- Endstop polarity is active-low.
- Motor direction polarity matches the coordinate convention.

## Bring-Up Plan

Recommended order:

1. Build the firmware with PlatformIO.
2. Flash and confirm boot/status JSON over USB serial.
3. Verify USB serial is not conflicting with Flow 2 UART.
4. Run an I2C scan and confirm SHT45/BME688 addresses.
5. Bring up one MAX31856, then all four.
6. Check D6F raw ADC and voltage against a multimeter.
7. Test TMC2209 UART communication before motor movement.
8. Test motor enable and one-step/small-step movement at low current.
9. Verify direction polarity.
10. Verify endstop polarity and homing behavior.
11. Test one Bronkhorst channel with read-measure only.
12. Test Bronkhorst setpoint write at low/safe flow.
13. Add a laptop logger that records JSONL with laptop receive timestamps.
14. Add command IDs and stricter error reporting.
15. Add safety limits for max travel, max velocity, max acceleration, and flow range.

## Current Build Status

As of the last verification, `firmware/p4-sensor-hub-arduino` builds successfully with:

```text
C:\Users\llane\.platformio\penv\Scripts\pio.exe run
```

Observed build metrics:

```text
RAM:   8.3%
Flash: 32.0%
```

The build success proves the current source, dependency declarations, and PlatformIO setup are coherent. It does not prove hardware behavior.

## Files Added In The Current Scaffold

Key files:

- `include/AppConfig.h`: pin map and main constants
- `include/Timebase.h`: MCU timestamp helper
- `include/Telemetry.h`, `src/Telemetry.cpp`: JSONL output with a mutex
- `include/sensors/SensorBase.h`, `src/sensors/SensorBase.cpp`: common sensor scheduling interface
- `include/sensors/Max31856Sensor.h`, `src/sensors/Max31856Sensor.cpp`: thermocouple wrapper
- `include/sensors/Sht45Sensor.h`, `src/sensors/Sht45Sensor.cpp`: SHT45 wrapper
- `include/sensors/Bme688Sensor.h`, `src/sensors/Bme688Sensor.cpp`: BME688 wrapper
- `include/sensors/AnalogD6FSensor.h`, `src/sensors/AnalogD6FSensor.cpp`: Omron D6F analog wrapper
- `include/devices/MotorController.h`, `src/devices/MotorController.cpp`: TMC2209 and STEP/DIR stage wrapper
- `include/devices/ProparAsciiClient.h`, `src/devices/ProparAsciiClient.cpp`: minimal Bronkhorst ASCII ProPar client
- `src/main.cpp`: task creation, command parsing, sensor/flow/motor orchestration

