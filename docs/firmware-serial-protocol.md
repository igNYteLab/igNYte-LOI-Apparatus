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

#### `sensor.rate`

Changes the polling rate for a sensor.

```json
{"cmd":"sensor.rate","sensor":"d6f_v03a1","hz":1}
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
- `d6f_v03a1`

Setting `hz` to `0` disables scheduled reads for that sensor.

Expected responses:

```json
{"type":"status","t_us":123456789,"component":"d6f_v03a1","status":"rate_updated"}
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

#### D6F Analog Flow Velocity Samples

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
- TMC2209 UART is currently treated mostly as write-only unless a separate RX bodge/revision is added.
- During motor-only bring-up, the firmware may temporarily have `sensorTask` disabled in `main.cpp`. In that mode, sensor `sample` messages will not be emitted even though startup status messages still appear.

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
