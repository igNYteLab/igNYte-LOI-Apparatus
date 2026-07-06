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
  "calibration_active": false,
  "limits_valid": true,
  "min_limit_mm": 0,
  "max_limit_mm": 148.5,
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
{"type":"status","t_us":123457,"component":"motor","status":"enabled","enabled":true,"endstop_active":false,"velocity_mode":false,"calibration_active":false,"limits_valid":false,"min_limit_mm":0,"max_limit_mm":0,"position_steps":0,"position_mm":0}
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
{"type":"status","t_us":123457,"component":"motor","status":"disabled","enabled":false,"endstop_active":false,"velocity_mode":false,"calibration_active":false,"limits_valid":false,"min_limit_mm":0,"max_limit_mm":0,"position_steps":0,"position_mm":0}
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

Velocity commands use a latest-wins mailbox instead of the normal FIFO motor command queue. If multiple velocity commands arrive faster than the motor task services them, only the newest velocity is kept. This prevents stale camera-control velocities from being replayed later.

If no new nonzero velocity command arrives within the firmware timeout, currently `2000 ms`, the firmware stops the motor and emits `velocity_watchdog_stop`.

Input fields:

- `mm_s`: signed numeric velocity. Positive and negative signs select opposite directions.
- `0` stops velocity motion immediately and disarms the velocity watchdog.

Input:

```json
{"cmd":"motor.velocity_mm_s","mm_s":-2.0}
```

Output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
```

Watchdog timeout output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"velocity_watchdog_stop","enabled":true,"endstop_active":false,"velocity_mode":false,"calibration_active":false,"limits_valid":true,"min_limit_mm":0,"max_limit_mm":148.5,"position_steps":12000,"position_mm":7.5}
```

If an active axis calibration is running, velocity commands are rejected:

```json
{"type":"status","t_us":123456,"component":"motor","status":"velocity_rejected","detail":"calibration_active"}
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
  "microsteps": 8
}
```

If `connection_ok` is false, TMC UART communication is not healthy and StallGuard configuration/readback should not be trusted.

### `motor.stall_config`

Configures the TMC2209 StallGuard threshold and lower velocity-window threshold. The motor must be stopped and no StallGuard test or axis calibration may be active.

Input fields:

- `sgthrs`: integer `0..255`. Higher values are more sensitive and detect earlier. Current firmware default is `158`.
- `tcoolthrs`: integer `0..1048575`.

Input:

```json
{"cmd":"motor.stall_config","sgthrs":158,"tcoolthrs":1500}
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
  "sg_threshold": 158,
  "effective_sg_threshold": 316,
  "tstep": 600,
  "tcoolthrs": 1500,
  "tpwmthrs": 0,
  "drv_status": 0,
  "diag_gpio": 50,
  "diag_pin": false,
  "diag_interrupt_pending": false,
  "stall_guard_armed": false,
  "stall_test_active": false,
  "spreadcycle_enabled": false,
  "stall_window_active": true,
  "enabled": true,
  "velocity_mode": true,
  "speed_mm_s": -2.0,
  "stall_test_travel_mm": 0
}
```

### `motor.stall_test`

Starts a bounded constant-velocity StallGuard test and arms the DIAG GPIO 50 interrupt.

Input fields:

- `mm_s`: nonzero signed velocity, limited to `-25..25`.
- `max_travel_mm`: positive travel limit, maximum `200`.

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

### `motor.calibrate_axis`

Runs full axis calibration and enables calibrated software limits. Before this command completes, software max-limit enforcement is inactive and normal motor commands behave like bring-up/manual mode.

Calibration sequence:

1. Seek negative at the configured calibration velocity until StallGuard DIAG or the physical endstop triggers.
2. Back off positive by one lead-screw revolution.
3. Set that backed-off position to `0 mm`.
4. Seek positive until StallGuard DIAG or the physical endstop triggers.
5. Back off negative by one lead-screw revolution.
6. Store the backed-off position as `max_limit_mm`.
7. Move automatically to the center between `0` and `max_limit_mm`.

Current calibration settings:

- Seek velocity: `20.0 mm/s`
- Backoff: `2.0 mm`
- Maximum seek travel per direction: `300 mm`
- The positive/max seek ignores DIAG for the first `2000 ms` after switching from the min-side backoff so stale or re-latched DIAG events do not immediately end calibration.

Input fields:

- `max_travel_mm`: optional positive safety cap for each seek direction, maximum `300`. If omitted, firmware uses `300`.

Input:

```json
{"cmd":"motor.calibrate_axis","max_travel_mm":300.0}
```

Start outputs:

```json
{"type":"status","t_us":123456,"component":"motor","status":"command_queued"}
{"type":"status","t_us":123457,"component":"motor","status":"axis_calibration_started","enabled":true,"endstop_active":false,"velocity_mode":true,"calibration_active":true,"limits_valid":false,"min_limit_mm":0,"max_limit_mm":0,"position_steps":1000,"position_mm":0.625}
```

Lower end found and zero set after backoff:

```json
{"type":"status","t_us":123458,"component":"motor","status":"axis_calibration_min_set","position_steps":0,"position_mm":0,"endstop_active":false,"calibration_active":true,"limits_valid":false,"min_limit_mm":0,"max_limit_mm":0}
```

Successful completion after the firmware stores the max limit and moves to the center:

```json
{"type":"status","t_us":123459,"component":"motor","status":"axis_calibration_complete","position_steps":118800,"position_mm":74.25,"endstop_active":false,"calibration_active":false,"limits_valid":true,"min_limit_mm":0,"max_limit_mm":148.5}
```

Travel safety cap hit before an end was detected:

```json
{"type":"status","t_us":123459,"component":"motor","status":"axis_calibration_failed","position_steps":400000,"position_mm":250,"endstop_active":false,"calibration_active":false,"limits_valid":false,"min_limit_mm":0,"max_limit_mm":0}
```

Rejected output:

```json
{"type":"status","t_us":123456,"component":"motor","status":"axis_calibration_rejected","detail":"check_enabled_idle_diag_and_limits"}
```

After calibration, position commands are clamped to the calibrated range and velocity motion is stopped at either limit. Limit hits emit:

```json
{"type":"status","t_us":123456,"component":"motor","status":"software_limit_hit","position_steps":237600,"position_mm":148.5,"endstop_active":false,"calibration_active":false,"limits_valid":true,"min_limit_mm":0,"max_limit_mm":148.5}
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

Current-code note: the firmware creates separate polling tasks for fast I2C sensors, BME688, thermocouples, and flow readback. If a future motor-only debug build temporarily disables those tasks, `sensor.rate` still updates the stored rate but samples will not be published for the disabled task group.

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
{"type":"status","t_us":1008595,"component":"motor","status":"velocity_mailbox_ok"}
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
