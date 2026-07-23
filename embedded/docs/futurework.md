<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
GitHub: https://github.com/andre-llaneta
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# Future Work

This document collects the remaining project work that should be handed off after the current firmware, hardware, OpenCV prototype, and IgNYte web app integration work.

This is intentionally not a bug list. Confirmed board revision issues belong in `hardware/errata.md`, validation results belong in `docs/final-validation.md`, and serial/API details belong in `docs/firmware-serial-protocol.md`.

## Bronkhorst Flow Controller Integration

The flow controllers were not available during the main firmware bring-up, so this is still the largest unvalidated firmware-facing subsystem.

Future work:

- Connect the real Bronkhorst controllers to the `motherV1` flow interfaces.
- Confirm the controller baud rate, serial settings, and node addresses. The current firmware path assumes `38400,n,8,1` and node `0x80`, but the real controllers may differ.
- Validate read-only communication before sending setpoints.
- Validate `flow.set` behavior from the web app and firmware.
- Confirm whether the UI should expose flow as percent, SCCM, or another physical unit.
- If Flow 2 interferes with boot/download/log behavior, test `HardwareSerial Flow2Serial(3)` while keeping the physical GPIO37/GPIO38 pins.
- Once the controllers are available, revisit flow read timeouts. A Flow 1 timeout can still delay Flow 2 inside the current shared `flowTask`.
- Record the final flow-controller settings and physical validation results in `docs/final-validation.md`.

Hardware note:

- Flow 2 GPIO37/GPIO38 boot/download/logging risk is tracked in `hardware/errata.md`.

## Hyperspectral Camera Integration

The current web app supports HSI preview recording and frame export, but current HSI support is browser-preview video/JPEG only. It is not native RAW hyperspectral datacube capture.

Future work:

- Identify exactly what data the hyperspectral camera provides:
  - RGB preview only
  - per-band frames
  - spectral datacube
  - vendor-native `.raw/.hdr`, `radiance.sc/.hdr`, `.hcc`, or similar files
  - SDK-only stream
- Decide whether the camera can be controlled directly from the browser.
- If browser control is not possible, build a local native camera agent or use vendor software to capture native files.
- Decide how the web app should reference native hyperspectral files in the run archive manifest.
- Define whether the web app needs live HSI preview only, full HSI recording, frame export, experiment metadata linking, or all of these.
- Keep this work primarily on the web app / host side unless hardware sync triggers or firmware timing signals become necessary.

Key open question:

- What exact frame/data object should downstream post-processing consume from the hyperspectral camera?

## Heavier Camera / Motor Stage Upgrade

The current motor stage works for the present camera setup, but a hyperspectral camera may be significantly heavier. If the stage struggles with the final camera payload, replace or upgrade the motor/stage assembly.

Final apparatus-level motor and closed-loop tracking validation remains future work because the complete mechanical chamber/stage assembly was not available within the internship window.

Recommended bring-up sequence for any replacement motor or stage:

1. Confirm the motor driver powers correctly before ESP32-P4 boot.
2. Confirm TMC2209 communication with `motor.driver_status`.
3. Confirm configured microsteps and current settings are applied.
4. Verify motor direction with a small manual command.
5. Confirm `controlSign` in the web app using one-shot flame-tracking recommendations.
6. Run bounded low-speed motion before higher-speed tests.
7. Run axis calibration and confirm `limits_valid:true`.
8. Retune StallGuard for the new motor/stage/load before trusting stall-based calibration.
9. Test up/down motion separately at conservative speeds.
10. Increase speed gradually while watching for skipped steps, binding, missed motion, or excessive noise/heat.
11. Repeat the full OpenCV one-shot and auto-control demo flow only after manual motion is reliable.

Notes:

- Do not assume supplier headline speed applies to the assembled vertical camera stage.
- A heavier camera changes load, cable drag, resonance, and required acceleration/current margins.
- Earlier bring-up showed directional speed differences and a repeatable sticking point at the same physical travel location. If this returns with a heavier camera, inspect the rail/screw alignment, cable drag, backlash, and vertical load before raising current or forcing through the spot.
- StallGuard thresholds are load- and motion-dependent. Use `tools/tmc_stall_sweep.py` to sweep candidate `SGTHRS` values with bounded travel before relying on `motor.calibrate_axis` for a changed camera payload, motor, driver current, microstep setting, or stage assembly.
- If a replacement stage uses a different lead screw, microstep setting, or motor step angle, update firmware constants before trusting mm commands.

## IR Camera Flame-Front Sensing

An IR camera may improve flame-front segmentation if the flame-front temperature is more stable than the RGB appearance of the flame.

Future work:

- Test whether the bottom of the flame can be detected from temperature rather than RGB/HSV color.
- Compare IR bottom-point detection against the current RGB OpenCV detector.
- Validate whether the flame front is separable from the sample/background temperature during real burns.
- Check whether the IR camera can see the relevant wavelength band through the borosilicate glass tube.
- Decide whether IR sensing should replace RGB tracking or only provide a second validation/debug view.

Important caution:

- Many long-wave IR thermal cameras do not see through ordinary glass well. Borosilicate glass transmission must be tested with the actual camera/wavelength range, not assumed from RGB camera behavior.

## Final Closed-Loop Flame Tracking Validation

The RGB OpenCV tracker and web app control path have been built and tested on the available setup, but final quantitative closed-loop performance should be measured on the completed apparatus.

Future work:

- Measure steady-state tracking error.
- Measure maximum flame-front velocity successfully followed.
- Measure settling time and overshoot after disturbances.
- Validate lost-tracking recovery.
- Test weak flames.
- Test through the actual glass chamber.
- Test sensitivity across materials and lighting conditions.
- Compare P, PI, and feedforward control using the same material/chamber setup.

Record results in `docs/final-validation.md`.

## True Emergency Stop

The current firmware has software stop/disable behavior and calibrated software limits, but this is not the same as a true emergency stop.

Future work:

- Add a physical e-stop or hardware enable cutoff path that does not depend on browser state, Web Serial, or normal firmware command processing.
- Decide whether the e-stop should cut motor-driver enable, motor power, system power, or a combination.
- Document the operator-facing e-stop behavior in `docs/operator-demo-flow.md`.
- Validate that the stage stops safely even if the host/web app disconnects.

## Firmware / Protocol Polish

The current protocol is sufficient for bring-up and web app integration, but a future production protocol could be stricter.

Future work:

- Add optional command IDs so host commands can be matched to firmware acknowledgements.
- Decide which startup warnings should remain noncritical and which should block a specific test mode.
- If the web app starts streaming frequent absolute `motor.target_mm` commands, consider changing those commands to latest-wins behavior like velocity commands.

## Documentation / Handoff Maintenance

Future maintainers should keep these docs aligned:

- Use `docs/operator-demo-flow.md` for demo procedure changes.
- Use `docs/final-validation.md` for measured validation results.
- Use `docs/firmware-serial-protocol.md` for command and telemetry changes.
- Use `hardware/errata.md` for confirmed board revision issues.
- Use this file for larger future integrations and design decisions.
