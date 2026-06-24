# JSON Commands

This file is the quick reference for JSON commands accepted by the ESP32-P4 sensor hub firmware. Send one JSON object per line over the USB serial monitor.

All firmware responses are also newline-delimited JSON. Most motor commands first emit:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

Queued motor commands may emit their final state shortly after the command is serviced by the motor task.

## Common Error Outputs

Invalid JSON:

```json
{"type":"status","t_us":123456,"component":"command","status":"json_error","detail":"InvalidInput"}
```

Unknown command:

```json
{"type":"status","t_us":123456,"component":"command","status":"unknown","detail":"bad.command"}
```

Missing field:

```json
{"type":"status","t_us":123456,"component":"motor","status":"missing_field","detail":"steps"}
```

Invalid range:

```json
{"type":"status","t_us":123456,"component":"motor","status":"invalid_field","detail":"stall_test_range"}
```

## Motor Commands

### `motor.status`

Reads the logical motor state.

Input:

```json
{"cmd":"motor.status"}
```

Output:

```json
{
  "type": "status",
  "t_us": 123456,
  "component": "motor",
  "status": "state",
  "enabled": true,
  "endstop_active": false,
  "velocity_mode": false,
  "position_steps": 0,
  "position_mm": 0
}
```

### `motor.enable`

Enables the stepper driver output.

Input:

```json
{"cmd":"motor.enable"}
```

Outputs:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
{"type":"status","t_us":123457,"component":"motor","status":"enabled","enabled":true,"endstop_active":false,"velocity_mode":false,"position_steps":0,"position_mm":0}
```

### `motor.disable`

Disables the stepper driver output. Disabling also requests a stop.

Input:

```json
{"cmd":"motor.disable"}
```

Outputs:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
{"type":"status","t_us":123457,"component":"motor","status":"disabled","enabled":false,"endstop_active":false,"velocity_mode":false,"position_steps":0,"position_mm":0}
```

### `motor.move_steps`

Moves to an absolute target position in motor steps.

Input fields:

- `steps`: integer absolute target. Negative values are clamped to `0`.

Input:

```json
{"cmd":"motor.move_steps","steps":3200}
```

Output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

### `motor.target_mm`

Moves to an absolute target position in millimeters.

Input fields:

- `mm`: numeric absolute target. Negative values become negative steps first and are then clamped to `0`.

Input:

```json
{"cmd":"motor.target_mm","mm":20.0}
```

Output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

### `motor.velocity_mm_s`

Runs the motor continuously at a signed velocity in millimeters per second.

Input fields:

- `mm_s`: signed numeric velocity. Positive and negative signs select opposite directions.

Input:

```json
{"cmd":"motor.velocity_mm_s","mm_s":-2.0}
```

Output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

### `motor.stop`

Requests a controlled stop.

Input:

```json
{"cmd":"motor.stop"}
```

Output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

### `motor.home_here`

Sets the current logical motor position to `0` without moving the stage.

Input:

```json
{"cmd":"motor.home_here"}
```

Output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

### `motor.driver_status`

Reads TMC2209 UART diagnostics.

Input:

```json
{"cmd":"motor.driver_status"}
```

Output:

```json
{
  "type": "status",
  "t_us": 123456,
  "component": "motor",
  "status": "driver_status",
  "connection_result": 0,
  "connection_ok": true,
  "ifcnt": 1,
  "ioin": 0,
  "version": 33,
  "drv_status": 0,
  "rms_current_ma": 600,
  "microsteps": 16
}
```

If `connection_ok` is false, TMC UART communication is not healthy and StallGuard configuration/readback should not be trusted.

### `motor.driver_configure`

Stops motion, cancels active StallGuard motion, and reapplies the default TMC2209 configuration from firmware constants.

Current defaults include:

- `SGTHRS=55`
- `TCOOLTHRS=1500`
- `600 mA RMS`
- `16` microsteps
- StealthChop enabled

Input:

```json
{"cmd":"motor.driver_configure"}
```

Outputs:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

Then a `motor.driver_status` response is emitted.

### `motor.stall_config`

Configures the TMC2209 StallGuard threshold and lower velocity-window threshold. The motor must be stopped and no StallGuard test or homing sequence may be active.

Input fields:

- `sgthrs`: integer `0..255`. Higher values are more sensitive and detect earlier.
- `tcoolthrs`: integer `0..1048575`.

Input:

```json
{"cmd":"motor.stall_config","sgthrs":55,"tcoolthrs":1500}
```

Successful outputs:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
{"type":"status","t_us":123457,"component":"motor","status":"stall_configured"}
```

Then a `motor.stall_status` response is emitted.

Rejected output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"stall_config_rejected","detail":"motor_must_be_stopped"}
```

### `motor.stall_status`

Reads StallGuard and motor state diagnostics. This command is most useful while the motor is moving; idle readings commonly show `tstep=0` and `sg_result=0`.

Input:

```json
{"cmd":"motor.stall_status"}
```

Output:

```json
{
  "type": "status",
  "t_us": 123456,
  "component": "motor",
  "status": "stall_status",
  "sg_result": 90,
  "sg_threshold": 55,
  "effective_sg_threshold": 110,
  "tstep": 600,
  "tcoolthrs": 1500,
  "tpwmthrs": 0,
  "drv_status": 0,
  "diag_gpio": 50,
  "diag_pin": false,
  "diag_interrupt_pending": false,
  "stall_guard_armed": false,
  "stall_test_active": false,
  "stall_home_active": false,
  "stall_home_backing_off": false,
  "spreadcycle_enabled": false,
  "stall_window_active": true,
  "enabled": true,
  "velocity_mode": true,
  "speed_mm_s": -2.0,
  "stall_test_travel_mm": 0,
  "stall_home_travel_mm": 0
}
```

### `motor.stall_test`

Starts a bounded constant-velocity StallGuard test and arms the DIAG GPIO 50 interrupt.

Input fields:

- `mm_s`: nonzero signed velocity, limited to `-8..8`.
- `max_travel_mm`: positive travel limit, maximum `10`.

Input:

```json
{"cmd":"motor.stall_test","mm_s":-2.0,"max_travel_mm":5.0}
```

Start outputs:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
{"type":"status","t_us":123457,"component":"motor","status":"stall_test_started"}
```

Completion outputs:

```json
{"type":"status","t_us":123458,"component":"motor","status":"stall_detected","position_steps":1000,"position_mm":0.625,"endstop_active":false}
```

or:

```json
{"type":"status","t_us":123458,"component":"motor","status":"stall_not_detected","position_steps":8000,"position_mm":5.0,"endstop_active":false}
```

or:

```json
{"type":"status","t_us":123458,"component":"motor","status":"stall_test_endstop","position_steps":0,"position_mm":0,"endstop_active":true}
```

Rejected output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"stall_test_rejected","detail":"check_enabled_idle_diag_and_limits"}
```

### `motor.stall_home`

Runs bounded sensorless homing. The firmware seeks at the configured homing velocity, stops on StallGuard DIAG or the physical endstop, backs off one lead-screw revolution, and sets the backed-off position to `0`.

Current homing settings:

- Seek velocity: `-2.0 mm/s`
- Backoff: `2.0 mm`
- Maximum allowed command travel: `100 mm`

Input fields:

- `max_travel_mm`: positive travel limit, maximum `100`.

Input:

```json
{"cmd":"motor.stall_home","max_travel_mm":70.0}
```

Start outputs:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
{"type":"status","t_us":123457,"component":"motor","status":"stall_home_started"}
```

Completion on StallGuard:

```json
{"type":"status","t_us":123458,"component":"motor","status":"stall_home_complete","position_steps":0,"position_mm":0,"endstop_active":false,"home_source":"stallguard"}
```

Completion on physical endstop:

```json
{"type":"status","t_us":123458,"component":"motor","status":"stall_home_complete","position_steps":0,"position_mm":0,"endstop_active":true,"home_source":"endstop"}
```

Travel limit without home:

```json
{"type":"status","t_us":123458,"component":"motor","status":"stall_home_not_detected","position_steps":80000,"position_mm":50.0,"endstop_active":false}
```

Rejected output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"stall_home_rejected","detail":"check_enabled_idle_diag_and_limits"}
```

## Sensor And Bus Commands

### `i2c.scan`

Scans I2C addresses `1..126` on SDA GPIO 7 and SCL GPIO 8.

Input:

```json
{"cmd":"i2c.scan"}
```

Output:

```json
{"type":"status","t_us":123456,"component":"i2c","status":"scan","addresses":[32,68,112,119],"count":4}
```

Expected full-board addresses:

- `32` / `0x20`: MCP23017
- `68` / `0x44`: SHT45
- `112` / `0x70`: DFRobot SEN0496 oxygen sensor with current config
- `119` / `0x77`: BME688 with current config

The SEN0496 address can be set to `0x70` through `0x73` with its DIP switch.

### `sensor.status`

Reports each instantiated sensor's startup state and configured rate.

Input:

```json
{"cmd":"sensor.status"}
```

Output:

```json
{
  "type": "status",
  "t_us": 123456,
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

### `sensor.rate`

Changes the scheduled polling rate for a sensor.

Input fields:

- `sensor`: one of `tc1`, `tc2`, `tc3`, `tc4`, `sht45`, `bme688`, `o2`.
- `hz`: integer polling rate. `0` disables scheduled reads for that sensor.

Input:

```json
{"cmd":"sensor.rate","sensor":"tc1","hz":1}
```

Output:

```json
{"type":"status","t_us":123456,"component":"tc1","status":"rate_updated"}
```

Unknown sensor output:

```json
{"type":"status","t_us":123456,"component":"sensor","status":"not_found","detail":"bad_name"}
```

Current-code note: the firmware uses separate sensor polling tasks for fast I2C sensors, BME688, and thermocouples. During motor-only debug, those tasks may be temporarily commented out; if disabled, `sensor.rate` still updates the stored rate but samples will not be published for the disabled task group.

## Flow Controller Commands

### `flow.set`

Sets a Bronkhorst flow controller setpoint as percent full scale. The firmware converts percent to Bronkhorst raw setpoint units using `0..32000`.

Input fields:

- `channel`: optional integer. `1` selects `flow1`; `2` selects `flow2`. Omitted values default to `1`.
- `pct`: optional numeric percent. Values are constrained to `0..100`. Omitted values default to `0`.

Input:

```json
{"cmd":"flow.set","channel":1,"pct":25.0}
```

Successful output:

```json
{"type":"status","t_us":123456,"component":"flow1","status":"setpoint_ok"}
```

Failure output:

```json
{"type":"status","t_us":123456,"component":"flow1","status":"setpoint_failed"}
```

## Automatic Output Messages

These are not commands, but host software should handle them.

### Boot Status

Typical boot messages:

```json
{"type":"status","t_us":1007909,"component":"boot","status":"starting"}
{"type":"status","t_us":1008588,"component":"motor","status":"queue_ok"}
{"type":"status","t_us":1010052,"component":"io_expander","status":"begin_ok"}
{"type":"status","t_us":1035638,"component":"tc1","status":"begin_ok"}
{"type":"status","t_us":1039022,"component":"sht45","status":"begin_ok"}
{"type":"status","t_us":1041174,"component":"boot","status":"ready"}
```

Startup warnings use `severity:"warning"`:

```json
{"type":"status","t_us":1039022,"component":"bme688","status":"begin_failed","severity":"warning"}
```

### Thermocouple Samples

Emitted by the sensor task when MAX31856 channels are online and scheduled.

```json
{
  "type": "sample",
  "kind": "thermocouple",
  "sensor": "tc1",
  "t_us": 123456,
  "temp_c": 25.1,
  "cold_junction_c": 24.6,
  "fault": 0,
  "valid": true,
  "ok": true
}
```

If the thermocouple is unplugged, `fault` is nonzero and `valid`/`ok` are false. Ignore `temp_c` when `valid` is false.

### SHT45 Samples

```json
{
  "type": "sample",
  "kind": "environment",
  "sensor": "sht45",
  "t_us": 123456,
  "temp_c": 24.2,
  "rh_pct": 41.9,
  "ok": true
}
```

### BME688 Samples

```json
{
  "type": "sample",
  "kind": "environment",
  "sensor": "bme688",
  "t_us": 123456,
  "temp_c": 25.0,
  "pressure_hpa": 1008.1,
  "rh_pct": 39.8,
  "gas_kohm": 8.2,
  "ok": true
}
```

### SEN0496 Oxygen Samples

Emitted by the sensor task when the DFRobot SEN0496 oxygen sensor is online and scheduled.

```json
{
  "type": "sample",
  "kind": "oxygen",
  "sensor": "o2",
  "t_us": 123456,
  "o2_vol_pct": 20.95,
  "ok": true
}
```

### Flow Controller Samples

The flow task polls `flow1` and `flow2` about every `200 ms`.

```json
{
  "type": "sample",
  "kind": "flow_controller",
  "sensor": "flow1",
  "t_us": 123456,
  "raw": 16000,
  "pct": 50.0,
  "ok": true
}
```
