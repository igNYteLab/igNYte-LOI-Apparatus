# Firmware Serial Protocol

This page describes the current USB serial JSON protocol used by the IgNYte-FPA ESP32-P4 firmware. It is intended for host software, including a web app or desktop bridge that sends commands and parses telemetry.

## Transport

- Transport: USB serial.
- Baud rate: `115200`.
- Encoding: UTF-8 / ASCII JSON text.
- Framing: newline-delimited JSON, one JSON object per line.
- Accepted line endings: `\n` or `\r\n`.
- The firmware does not currently use command IDs.

The host should send exactly one JSON object per line:

```json
{"cmd":"motor.status"}
```

The firmware outputs one JSON object per line for telemetry/status:

```json
{"type":"status","t_us":1007909,"component":"boot","status":"starting"}
```

During reset or boot, the serial stream may also include non-JSON ROM/debug text from the ESP32-P4. Host parsers should read line-by-line, attempt to parse JSON lines, and ignore or log non-JSON lines separately.

## Timestamp

Most firmware-generated JSON output includes:

```json
"t_us": 123456789
```

`t_us` is a monotonic microsecond timestamp from MCU boot. It is not wall-clock time. The host should also record its own receive timestamp if camera or experiment-time correlation is needed.

## Input Commands

All commands use a top-level `cmd` string.

### Motor Commands

#### `motor.status`

Requests the current motor state.

```json
{"cmd":"motor.status"}
```

Expected response:

```json
{
  "type": "status",
  "t_us": 123456789,
  "component": "motor",
  "status": "state",
  "enabled": false,
  "endstop_active": false,
  "velocity_mode": false,
  "position_steps": 0,
  "position_mm": 0
}
```

#### `motor.enable`

Enables the motor driver.

```json
{"cmd":"motor.enable"}
```

Expected responses:

```json
{"type":"status","t_us":123456789,"component":"motor","status":"command_queued"}
{"type":"status","t_us":123456999,"component":"motor","status":"enabled","enabled":true,"endstop_active":false,"velocity_mode":false,"position_steps":0,"position_mm":0}
```

#### `motor.disable`

Disables the motor driver. Disabling also requests a stop.

```json
{"cmd":"motor.disable"}
```

#### `motor.move_steps`

Moves to an absolute target position in motor steps.

```json
{"cmd":"motor.move_steps","steps":3200}
```

Fields:

- `steps`: integer absolute target position.

Negative step targets are clamped to `0`.

#### `motor.target_mm`

Moves to an absolute target position in millimeters.

```json
{"cmd":"motor.target_mm","mm":1.0}
```

Fields:

- `mm`: numeric absolute target position.

This is not a relative move. Sending the same target twice will not move the stage the second time if the firmware already believes it is at that target. Negative targets are clamped to `0`.

#### `motor.velocity_mm_s`

Runs the motor at a signed velocity in millimeters per second.

```json
{"cmd":"motor.velocity_mm_s","mm_s":0.5}
```

Fields:

- `mm_s`: signed numeric velocity.

Positive and negative signs select opposite directions. If the endstop is active while moving negative, the firmware stops motion, exits velocity mode, and sets the current position to `0`.

#### `motor.stop`

Requests a controlled stop.

```json
{"cmd":"motor.stop"}
```

This is a decelerating software stop, not an emergency power cut.

#### `motor.home_here`

Sets the current logical motor position to `0` without moving the motor.

```json
{"cmd":"motor.home_here"}
```

Use this only when the physical stage is known to be at the desired home position.

#### `motor.driver_status`

Reads the TMC2209 UART connection and driver configuration.

```json
{"cmd":"motor.driver_status"}
```

#### `motor.driver_configure`

Stops motion and reapplies the default TMC2209 configuration. This restores `SGTHRS=35` and `TCOOLTHRS=1500`, disables any active StallGuard test or homing sequence, and leaves the motor driver enable state unchanged.

```json
{"cmd":"motor.driver_configure"}
```

#### `motor.stall_config`

Configures the TMC2209 StallGuard4 threshold and lower velocity-window register. The motor must be stopped and no StallGuard test may be active.

```json
{"cmd":"motor.stall_config","sgthrs":128,"tcoolthrs":1048575}
```

Fields:

- `sgthrs`: integer `0..255`. `0` disables stall detection; larger values increase sensitivity. The effective comparison threshold is twice this register value.
- `tcoolthrs`: integer `0..1048575` (`0xFFFFF`). StallGuard is active only when `TCOOLTHRS >= TSTEP > TPWMTHRS` and the TMC2209 is in StealthChop.

Successful configuration emits `stall_configured` followed by a `stall_status` message. Invalid ranges emit `invalid_field`; attempts while moving emit `stall_config_rejected`.

#### `motor.stall_status`

Reads StallGuard registers and software state. This UART read runs outside the motor pulse-generation task so repeated calibration reads do not block motor servicing.

```json
{"cmd":"motor.stall_status"}
```

Important response fields:

- `sg_result`, `sg_threshold`, `effective_sg_threshold`
- `tstep`, `tcoolthrs`, `tpwmthrs`
- `diag_gpio` (`50`) and current `diag_pin` level
- `diag_interrupt_pending`, `stall_guard_armed`, `stall_test_active`
- `stall_home_active`, `stall_home_backing_off`
- `spreadcycle_enabled`, `stall_window_active`
- `speed_mm_s`, `stall_test_travel_mm`
- `stall_home_travel_mm`

`stall_window_active` is a firmware convenience value indicating that the register readback currently satisfies the TMC2209 StallGuard4 mode/window condition. DIAG is handled as a pulse by a rising-edge GPIO interrupt; the current `diag_pin` level may already be low when status is requested.

#### `motor.stall_test`

Starts a bounded constant-velocity move and arms the GPIO 50 DIAG rising-edge interrupt.

```json
{"cmd":"motor.stall_test","mm_s":-1.0,"max_travel_mm":5.0}
```

Fields:

- `mm_s`: nonzero signed velocity, limited to `-8..8 mm/s`.
- `max_travel_mm`: positive travel limit, no greater than `10 mm`.

The motor must already be enabled and idle, and DIAG must be low before the test starts. The command is rejected otherwise. Ordinary movement commands never arm StallGuard.

The test finishes with one of these status values:

- `stall_detected`: a DIAG pulse was captured and step generation stopped immediately.
- `stall_not_detected`: the travel limit was reached without a DIAG pulse.
- `stall_test_endstop`: the physical endstop stopped negative travel first.

All completion paths disarm the interrupt. The driver remains enabled to hold the vertical stage.

#### `motor.stall_home`

Runs a complete bounded sensorless homing sequence using the configured StallGuard values:

```json
{"cmd":"motor.stall_home","max_travel_mm":70.0}
```

Fields:

- `max_travel_mm`: required positive seek limit, no greater than `100 mm`. Set this only as large as needed to reach the home side from the current position.

The motor must already be enabled and idle, and DIAG must be low. The sequence then:

1. Moves toward home at `-1 mm/s` with StallGuard armed.
2. Stops immediately on a DIAG pulse or physical endstop.
3. Disarms StallGuard and moves `+2 mm`, equal to one configured lead-screw revolution.
4. Sets the backed-off position to logical `0 mm`.

Expected responses are:

```json
{"type":"status","component":"motor","status":"stall_home_started"}
{"type":"status","component":"motor","status":"stall_home_complete","home_source":"stallguard","position_mm":0}
```

If the physical endstop is reached first, completion uses `"home_source":"endstop"`. If neither source is reached before the travel bound, the firmware stops and emits `stall_home_not_detected`; it does not set the position to zero.

### Flow Commands

#### `flow.set`

Sets a Bronkhorst flow controller setpoint as a percent of full scale.

```json
{"cmd":"flow.set","channel":1,"pct":50}
```

Fields:

- `channel`: `1` or `2`. Defaults to `1` if omitted.
- `pct`: percent setpoint. Firmware clamps this to `0..100`.

The firmware converts percent to Bronkhorst raw setpoint units:

```text
0%   -> 0
50%  -> 16000
100% -> 32000
```

Expected response:

```json
{"type":"status","t_us":123456789,"component":"flow1","status":"setpoint_ok"}
```

or:

```json
{"type":"status","t_us":123456789,"component":"flow1","status":"setpoint_failed"}
```

### Sensor Commands

#### `i2c.scan`

Scans the configured I2C bus on SDA GPIO 7 and SCL GPIO 8.

```json
{"cmd":"i2c.scan"}
```

Expected response:

```json
{"type":"status","t_us":123456789,"component":"i2c","status":"scan","addresses":[32,68,112,119],"count":4}
```

Expected full-board addresses:

- `0x20` / decimal `32`: MCP23017 I/O expander.
- `0x44` / decimal `68`: SHT45.
- `0x70` / decimal `112`: DFRobot SEN0496 oxygen sensor, if the DIP switch uses the configured address.
- `0x77` / decimal `119`: BME688, if the board uses the configured address.

If BME688 appears as decimal `118` / `0x76`, update `Addresses::kBme688` in `AppConfig.h`.
If SEN0496 appears as decimal `113` / `114` / `115`, update `Addresses::kSen0496` to `0x71` / `0x72` / `0x73`.

#### `sensor.status`

Reports which sensors initialized successfully and their current scheduled polling rates.

```json
{"cmd":"sensor.status"}
```

Expected response:

```json
{
  "type": "status",
  "t_us": 123456789,
  "component": "sensor",
  "status": "state",
  "sensors": [
    {"name":"tc1","online":true,"rate_hz":1},
    {"name":"tc2","online":true,"rate_hz":1},
    {"name":"tc3","online":true,"rate_hz":1},
    {"name":"tc4","online":true,"rate_hz":1},
    {"name":"sht45","online":true,"rate_hz":10},
    {"name":"bme688","online":true,"rate_hz":2},
    {"name":"o2","online":true,"rate_hz":1}
  ]
}
```

#### `sensor.rate`

Changes the polling rate for a sensor.

```json
{"cmd":"sensor.rate","sensor":"tc1","hz":1}
```

Fields:

- `sensor`: sensor name.
- `hz`: integer polling rate in Hz.

Known sensor names:

- `tc1`
- `tc2`
- `tc3`
- `tc4`
- `sht45`
- `bme688`
- `o2`

The `d6f_v03a1` implementation remains in the repository but is not instantiated in this build because GPIO 23 is used as the TMC2209 UART TX pin.

Setting `hz` to `0` disables scheduled reads for that sensor.

Expected responses:

```json
{"type":"status","t_us":123456789,"component":"tc1","status":"rate_updated"}
```

or:

```json
{"type":"status","t_us":123456789,"component":"sensor","status":"not_found","detail":"bad_name"}
```

## Output Message Types

All normal firmware JSON output has a `type` field.

Current types:

- `status`: events, warnings, command responses, boot state, motor state.
- `sample`: sensor and flow-controller samples.

### Status Messages

Common status shape:

```json
{
  "type": "status",
  "t_us": 123456789,
  "component": "motor",
  "status": "command_queued"
}
```

Common fields:

- `type`: always `status`.
- `t_us`: MCU timestamp in microseconds.
- `component`: subsystem name.
- `status`: status string.
- `detail`: optional detail string.
- `severity`: optional severity string, currently used for startup warnings.

Boot examples:

```json
{"type":"status","t_us":1007909,"component":"boot","status":"starting"}
{"type":"status","t_us":1010052,"component":"io_expander","status":"begin_failed","severity":"warning"}
{"type":"status","t_us":1010898,"component":"motor","status":"microstep_pins_unverified","detail":"mcp23017_missing","severity":"warning"}
{"type":"status","t_us":1041174,"component":"boot","status":"ready_with_warnings"}
```

Command parse error:

```json
{"type":"status","t_us":123456789,"component":"command","status":"json_error","detail":"InvalidInput"}
```

Unknown command:

```json
{"type":"status","t_us":123456789,"component":"command","status":"unknown","detail":"test"}
```

Missing field:

```json
{"type":"status","t_us":123456789,"component":"motor","status":"missing_field","detail":"mm"}
```

Motor state:

```json
{
  "type": "status",
  "t_us": 123456789,
  "component": "motor",
  "status": "state",
  "enabled": true,
  "endstop_active": false,
  "velocity_mode": false,
  "position_steps": 3200,
  "position_mm": 1.0
}
```

### Sample Messages

Samples are event-based. The firmware does not emit a combined row with every sensor value. Each sensor emits its own sample when it is due.

Common sample fields:

- `type`: always `sample`.
- `kind`: sample category.
- `sensor`: sensor name.
- `t_us`: MCU timestamp in microseconds.
- `ok`: boolean read status.

#### Thermocouple Samples

Sensors: `tc1`, `tc2`, `tc3`, `tc4`.

```json
{
  "type": "sample",
  "kind": "thermocouple",
  "sensor": "tc1",
  "t_us": 123456789,
  "temp_c": 613.4,
  "cold_junction_c": 24.8,
  "fault": 0,
  "valid": true,
  "ok": true
}
```

Fields:

- `temp_c`: thermocouple temperature in Celsius.
- `cold_junction_c`: cold-junction temperature in Celsius.
- `fault`: MAX31856 fault byte.
- `valid`: true when `fault == 0`.
- `ok`: same read success state used by the sensor scheduler.

#### SHT45 Samples

Sensor: `sht45`.

```json
{
  "type": "sample",
  "kind": "environment",
  "sensor": "sht45",
  "t_us": 123456789,
  "temp_c": 24.1,
  "rh_pct": 41.0,
  "ok": true
}
```

Fields:

- `temp_c`: temperature in Celsius.
- `rh_pct`: relative humidity in percent.

#### BME688 Samples

Sensor: `bme688`.

```json
{
  "type": "sample",
  "kind": "environment",
  "sensor": "bme688",
  "t_us": 123456789,
  "temp_c": 24.3,
  "pressure_hpa": 1012.6,
  "rh_pct": 40.2,
  "gas_kohm": 18.4,
  "ok": true
}
```

Fields:

- `temp_c`: temperature in Celsius.
- `pressure_hpa`: pressure in hPa.
- `rh_pct`: relative humidity in percent.
- `gas_kohm`: gas resistance in kohms.

#### SEN0496 Oxygen Samples

Sensor: `o2`.

```json
{
  "type": "sample",
  "kind": "oxygen",
  "sensor": "o2",
  "t_us": 123456789,
  "o2_vol_pct": 20.95,
  "ok": true
}
```

Fields:

- `o2_vol_pct`: oxygen concentration in percent volume.

#### D6F Analog Flow Velocity Samples

This sample type is currently unavailable in the ESP32-P4 build because the D6F analog pin conflicts with TMC2209 UART TX on GPIO 23. The message shape is retained here for future hardware revisions.

Sensor: `d6f_v03a1`.

```json
{
  "type": "sample",
  "kind": "analog",
  "sensor": "d6f_v03a1",
  "t_us": 123456789,
  "raw_adc": 622,
  "voltage_v": 0.607,
  "velocity_m_s": 0.40125,
  "ok": true
}
```

Fields:

- `raw_adc`: raw ADC count.
- `voltage_v`: measured voltage in volts.
- `velocity_m_s`: estimated air velocity in meters per second.

The velocity estimate is interpolated from the configured D6F voltage table. Host software should preserve `raw_adc` and `voltage_v` because `velocity_m_s` depends on calibration assumptions.

#### Flow Controller Samples

Sensors: `flow1`, `flow2`.

```json
{
  "type": "sample",
  "kind": "flow_controller",
  "sensor": "flow1",
  "t_us": 123456789,
  "raw": 16000,
  "pct": 50.0,
  "ok": true
}
```

Fields:

- `raw`: Bronkhorst raw measure value, `0..32000`.
- `pct`: measured percent of full scale.

## Startup And Failed Devices

At startup, each device emits a `begin_ok` or `begin_failed` status.

Example:

```json
{"type":"status","t_us":1039022,"component":"sht45","status":"begin_failed","severity":"warning"}
```

Sensors that fail startup are skipped by the sensor polling task after their startup warning. This prevents repeated read errors from missing devices.

The final boot status is:

```json
{"type":"status","t_us":123456789,"component":"boot","status":"ready"}
```

or:

```json
{"type":"status","t_us":123456789,"component":"boot","status":"ready_with_warnings"}
```

The host should wait for `ready` or `ready_with_warnings` before sending normal commands.

## Current Bring-Up Notes

- The current firmware has no command IDs. A `command_queued` response only means the command was accepted into the motor queue, not that motion has completed.
- For motor moves, host software should request `motor.status` after sending motion commands if it needs the current firmware position.
- `motor.target_mm` and `motor.move_steps` are absolute commands.
- The motor driver is intentionally disabled after boot. The host must send `motor.enable` before motion.
- Negative absolute motor targets are clamped to `0`.
- `motor.stop` is a controlled stop, not an emergency power cutoff.
- TMC2209 bidirectional UART readback is required for driver and StallGuard diagnostics.
- TMC2209 StallGuard4 is configured for StealthChop and starts with the tuned defaults `SGTHRS=35` and `TCOOLTHRS=1500`. DIAG is still ignored during ordinary movement unless a bounded test or homing sequence explicitly arms it.
- GPIO 50 is the TMC2209 DIAG input. It is captured with a rising-edge interrupt only while a bounded stall test is active.

## StallGuard4 Bring-Up Procedure

1. Put the stage near the center of travel. Keep the physical endstop connected and do not use fingers as the mechanical test load.
2. Flash the firmware, then enable the motor and verify TMC2209 UART:

   ```json
   {"cmd":"motor.enable"}
   {"cmd":"motor.driver_status"}
   ```

   Require `connection_ok: true` and sensible current and microstep readback.

3. Confirm DIAG is low and the default StallGuard configuration was applied:

   ```json
   {"cmd":"motor.stall_status"}
   ```

   Expect `diag_gpio: 50`, `diag_pin: false`, `stall_guard_armed: false`, `sg_threshold: 35`, and `tcoolthrs: 1500`.

4. Choose a fixed calibration velocity. With the configured 2 mm lead screw, `1 mm/s` equals one motor revolution every two seconds and is a reasonable initial value.
5. Move at the calibration velocity and request `motor.stall_status` repeatedly while applying a controlled, gradually increasing mechanical load. Record the lowest `SG_RESULT` before a stall, then stop the motor.
6. Use half that minimum as the initial `SGTHRS`. Measure `TSTEP` at the lower end of the desired speed range and choose `TCOOLTHRS` so `TCOOLTHRS >= TSTEP > TPWMTHRS` in the intended operating window.
7. Configure the candidate values while stopped:

   ```json
   {"cmd":"motor.stall_config","sgthrs":128,"tcoolthrs":1048575}
   ```

8. First verify the DIAG signal path with `SGTHRS=255` and a short bounded test. It should trigger immediately or after very little motion. If it reaches the travel limit, stop testing and inspect StealthChop mode, register readback, and GPIO 50 wiring.
9. Restore the calculated threshold and run bounded tests from the center of travel. Wait at least two seconds between attempts and move away from the mechanical stop after each detection.
10. Decrease `SGTHRS` for premature triggers. Increase it if the motor physically stalls without a DIAG event.
11. Repeat at 75%, 100%, and 150% of the intended velocity, at expected load extremes, and after the motor reaches operating temperature.
12. Promote values to firmware defaults only after reliable hardware results. Keep the physical endstop as the independent safety backup.

## Host Parser Recommendations

- Read serial data line-by-line.
- Trim whitespace and ignore empty lines.
- Attempt JSON parse only on lines that begin with `{`.
- Preserve non-JSON lines in a debug log; ESP ROM/reset text can appear during boot.
- Treat missing fields as possible for future compatibility.
- Dispatch primarily by `type`, then by `component`, `status`, `kind`, and `sensor`.
- Add host receive timestamps for every parsed line.
- Do not assume a fixed sample order or combined sensor row.
- Do not block UI updates waiting for a specific sensor; samples are asynchronous.
