<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
GitHub: https://github.com/andre-llaneta
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# Final Validation Checklist

Checklist to verify the current IgNYte-FPA firmware, hardware, and camera-tracking workflow.

## Test Setup

| Item | Value / Notes |
| --- | --- |
| Date | 15th July |
| Firmware commit | 2a465e6 |
| Web app commit | eab57b1 |
| Board revision | `motherV1` |
| ESP32-P4 board | DFRobot FireBeetle 2 ESP32-P4 |
| Motor driver power on before boot | yes |
| Camera | Brio 100 USB webcam |
| Test operator | Will Andre Pasimio Llaneta|

## Firmware Build And CI

- [x] Working tree is clean before validation.
- [x] Firmware builds locally:

```powershell
pio run -d firmware/p4-sensor-hub-arduino
```

- [x] Native command parser unit tests pass:

```powershell
pio test -d firmware/p4-sensor-hub-arduino -e native
```

- [x] GitHub Actions workflow passes: `.github/workflows/firmware-opencv.yml`.
- [x] OpenCV prototype JavaScript syntax check passes in CI.

Notes:

```text
Firmware built locally on 2026-07-14. CI passed on GitHub after push.
```

## Boot Validation

Power the motor driver and motor supply before booting the ESP32-P4 when validating motor behavior. If the TMC2209 is unpowered during boot, it can miss UART configuration and report the wrong microstep setting later. However, axis calibration automatically resets UART configuration and as axis calibration is required before any velocity command and so if user follows correct procedure motor will act nominally even if inital configuration was missed. 

Expected boot messages include:

- `boot starting`
- `motor queue_ok`
- `motor velocity_mailbox_ok`
- `io_expander begin_ok` or a documented warning
- sensor `begin_ok` messages for connected sensors
- final `boot ready` or `boot ready_with_warnings`

Record actual final boot status:

```json
{"type":"status","t_us":...,"component":"boot","status":"starting"}
{"type":"status","t_us":...,"component":"motor","status":"queue_ok"}
{"type":"status","t_us":...,"component":"motor","status":"velocity_mailbox_ok"}
{"type":"status","t_us":...,"component":"io_expander","status":"begin_ok"}
{"type":"status","t_us":...,"component":"io_expander","status":"motor_microsteps_invalid","severity":"warning"}
{"type":"status","t_us":...,"component":"tc1","status":"begin_ok"}
{"type":"status","t_us":...,"component":"tc2","status":"begin_ok"}
{"type":"status","t_us":...,"component":"tc3","status":"begin_ok"}
{"type":"status","t_us":...,"component":"tc4","status":"begin_ok"}
{"type":"status","t_us":...,"component":"sht45","status":"begin_ok"}
{"type":"status","t_us":...,"component":"bme688","status":"begin_ok"}
{"type":"status","t_us":...,"component":"o2","status":"begin_ok"}
{"type":"status","t_us":...,"component":"boot","status":"ready_with_warnings"}
```

Warnings observed:

| Component | Status | Detail | Acceptable? |
| --- | --- | --- | --- |
| MCP23017 | motor_microsteps_invalid | Physical microstep pins only allow down to 8 | Yes, as microsteps are configured through UART|

## I2C And Sensor Validation

Send:

```json
{"cmd":"i2c.scan"}
```

Expected full-board addresses:

| Device | Expected address |
| --- | --- |
| MCP23017 | `0x20` / `32` |
| SHT45 | `0x44` / `68` |
| SEN0496 oxygen | `0x70` / `112` |
| BME688 | `0x77` / `119` |

Observed addresses:

| Device | Observed address |
| --- | --- |
| MCP23017 | `0x20` / `32` |
| SHT45 | `0x44` / `68` |
| SEN0496 oxygen | `0x70` / `112` |
| BME688 | `0x77` / `119` |

Send:

```json
{"cmd":"sensor.status"}
```

Record status:

| Sensor | Expected | Observed online? | Rate Hz | Notes |
| --- | --- | --- | ---: | --- |
| `tc1` | online | | 1 | |
| `tc2` | online | | 1 | |
| `tc3` | online | | 1 | |
| `tc4` | online | | 1 | |
| `sht45` | online | | 10 | |
| `bme688` | online | | 2 | |
| `o2` | online | | 1 | |

Confirm thermocouple channel identity:

| Physical thermocouple order | Expected firmware sensor | GPIO / CS | Observed sensor | Pass? |
| ---: | --- | ---: | --- | --- |
| 1 | `tc1` | 21 | | |
| 2 | `tc2` | 36 | | |
| 3 | `tc3` | 35 | | |
| 4 | `tc4` | 20 | | |

Confirm live telemetry reaches the host/web app:

| Signal | Pass? | Notes |
| --- | --- | --- |
| Thermocouple samples `tc1..tc4` | Pass | |
| SHT45 temperature/RH | Pass | |
| BME688 temperature/pressure/RH/gas | Pass | |
| SEN0496 oxygen percent | Pass | |

## Motor Driver No-Motion Validation

Before movement, keep the stage clear and verify driver communication.

Send:

```json
{"cmd":"motor.driver_status"}
```

Expected:

| Field | Expected |
| --- | --- |
| `connection_ok` | `true` |
| `microsteps` | `4` |
| `rms_current_ma` | approximately `950` |

Observed:

| Field | Observed |
| --- | --- |
| `connection_ok` | `true` |
| `microsteps` | `4` |
| `rms_current_ma` | `923` |
| `ifcnt` | |
| `drv_status` | |

Send:

```json
{"cmd":"motor.status"}
```

Record:

| Field | Observed |
| --- | --- |
| `enabled` | |
| `step_generator_ready` | |
| `endstop_active` | |
| `limits_valid` | |
| `position_mm` | |

Do not continue to motion tests unless:

- [x] `connection_ok` is true.
- [x] `microsteps` matches `Config::kMicrosteps` (`4`).
- [x] `step_generator_ready` is true.
- [x] motor/stage area is clear.

## Motor Calibration Validation

Enable the driver:

```json
{"cmd":"motor.enable"}
```

Run axis calibration:

```json
{"cmd":"motor.calibrate_axis"}
```

Expected sequence:

- `axis_calibration_started`
- `axis_calibration_min_set`
- `axis_calibration_complete`

Record:

| Field | Observed |
| --- | --- |
| Calibration completed? | |
| `min_limit_mm` | |
| `max_limit_mm` | |
| final `position_mm` | |
| any stall/skipping/noise? | |

If calibration fails:

- [ ] Confirm DIAG is low before calibration.
- [ ] Confirm `motor.driver_status` still reports `connection_ok:true`.
- [ ] Confirm mechanical endstop wiring.
- [ ] Confirm the stage is not already hard against an end.
- [ ] Record failure status and position.

Failure notes:

```text

```

## Motor Motion Scale Validation

After successful calibration, test small absolute moves before velocity tracking.

| Command | Expected travel | Observed travel | Pass? | Notes |
| --- | ---: | ---: | --- | --- |
| `{"cmd":"motor.target_mm","mm":10}` | 10 mm from home reference | | | |
| `{"cmd":"motor.target_mm","mm":25}` | 25 mm from home reference | | | |
| `{"cmd":"motor.target_mm","mm":50}` | 50 mm from home reference | | | |

Confirm software limits:

| Test | Expected | Observed |
| --- | --- | --- |
| Target below `0 mm` | clamp/limit behavior, no negative overtravel | |
| Target above `max_limit_mm` | clamp/limit behavior, no overtravel | |
| Velocity into min limit | emits `software_limit_hit` and stops | |
| Velocity into max limit | emits `software_limit_hit` and stops | |

## Motor Speed Characterization

Use safe distances away from end limits. Record reliable speed separately for each direction because the current stage has shown directional/mechanical differences.

| Direction | Commanded speed mm/s | Reliable? | Notes |
| --- | ---: | --- | --- |
| Up / positive | 5 | | |
| Up / positive | 10 | | |
| Up / positive | 15 | | |
| Up / positive | 20 | | |
| Up / positive | 25 | | |
| Down / negative | 5 | | |
| Down / negative | 10 | | |
| Down / negative | 15 | | |
| Down / negative | 20 | | |
| Down / negative | 25 | | |

Mechanical sticking point:

| Observation | Value / Notes |
| --- | --- |
| Same physical spot every time? | |
| Approximate position | |
| Direction affected | |
| Load/cable condition | |
| Action taken | |

## OpenCV / Web App Validation

Final apparatus-level closed-loop validation was partially blocked because the full mechanical apparatus was not completed within the internship window. Firmware, hardware bring-up, web app integration, and camera-tracking tests should be evaluated against the available bench setup here; final through-chamber validation belongs in future work.

Camera setup:

| Item | Value |
| --- | --- |
| Resolution | |
| FPS | |
| Exposure mode | auto / manual / unknown |
| White balance mode | auto / manual / unknown |
| Lighting condition | |
| Background/reflections | |

Tracking settings:

| Setting | Value |
| --- | --- |
| Bright HSV low | `{ h: 0, s: 0, v: 133 }` |
| Bright HSV high | `{ h: 13, s: 255, v: 255 }` |
| Colored HSV low | `{ h: 0, s: 196, v: 19 }` |
| Colored HSV high | `{ h: 8, s: 255, v: 255 }` |
| Minimum area px | `50` |
| Morph kernel px | `2` |
| Exposure time | `35` |
| Setpoint row / norm | |
| Controller mode | P / PI |
| Kp | |
| Ki | |
| Feedforward enabled | yes / no |
| Feedforward gain | |
| mm per px | |
| Max velocity mm/s | |

Current flame segmentation overlay:

![Current flame segmentation overlay](../images/overlay.png)

Current binary mask:

![Current flame segmentation binary mask](../images/binarymask.png)

Validation checks:

- [ ] Camera stream appears in UI.
- [ ] Mask isolates the flame/body and ignores most reflections.
- [ ] Contour follows the intended flame region.
- [ ] Bottom point tracks the bottom of the flame.
- [ ] Tracking becomes false when the flame leaves the frame.
- [ ] Lost tracking sends zero velocity / no motion command.
- [ ] Auto control is off by default.
- [ ] Operator can enable auto control only after motor calibration.
- [ ] Stage follows the flame without hitting software limits.
- [ ] Serial log shows expected `motor.velocity_mm_s` commands.

Observed behavior:

```text

```

## Closed-Loop Tracking Performance

Use this section to record quantitative closed-loop flame tracking behavior once the complete mechanical chamber/stage assembly is available.

Status: partially blocked at handoff by incomplete mechanical apparatus.

| Test condition | Value / Notes |
| --- | --- |
| Chamber/glass present | |
| Material tested | |
| Flame brightness / condition | |
| Controller mode | P / PI / PI + feedforward |
| Kp / Ki / feedforward gain | |
| Setpoint row / norm | |
| Max motor velocity mm/s | |
| Max motor acceleration mm/s^2 | |

| Metric | Result | Notes |
| --- | --- | --- |
| Mean steady-state error px | | |
| Max absolute tracking error px | | |
| Maximum flame-front velocity followed | | |
| Settling time after disturbance | | |
| Overshoot | | |
| Lost-tracking recovery time | | |
| Weak-flame performance | pass / fail / partial / blocked | |
| Through-glass performance | pass / fail / partial / blocked | |
| Sensitivity across materials/lighting | | |

Controller comparison:

| Controller | Kp | Ki | Feedforward gain | Mean error | Max error | Overshoot | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| P | | | n/a | | | | |
| PI | | | n/a | | | | |
| PI + feedforward | | | | | | | |

## Data Logging Validation

Confirm the host/web app records enough data for later analysis.

- [ ] Firmware JSONL lines are preserved.
- [ ] Host receive timestamp is recorded.
- [ ] Camera/tracking timestamp is recorded.
- [ ] Motor command history is recorded.
- [ ] Sensor samples are not forced into fake combined rows unless post-processing intentionally resamples them.

Output file(s):

```text

```

## Flow Controller Status

Flow controllers were pending during earlier bring-up. If controllers are still unavailable, mark this section as blocked and do not claim validation.

| Item | Status / Notes |
| --- | --- |
| Flow 1 controller connected | |
| Flow 2 controller connected | |
| Baud confirmed | |
| Node/address confirmed | |
| Readback works | |
| Low setpoint write tested | |
| Web app displays flow readback | |

Safe first commands:

```json
{"cmd":"flow.set","channel":1,"pct":0}
{"cmd":"flow.set","channel":2,"pct":0}
```

Do not validate physical flow setpoints until gas routing and controller ranges are known.

## Known Open Risks At Handoff

Fill this in at the end of validation.

| Risk | Current status | Recommended next action |
| --- | --- | --- |
| True emergency stop command/path | | |
| Flow RS232 validation | | |
| Mechanical sticking point | | |
| TMC2209 UART hardware bodge | | |
| Endstop connector revision | | |
| ESP-IDF skeleton / VS Code setting confusion | | |

## Final Result

Overall status:

- [ ] Ready for demo.
- [ ] Ready for controlled lab use.
- [ ] Partially validated; see `docs/futurework.md`.
- [ ] Not ready; blocking issue exists.

Summary:

```text

```
