<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# Possible Issues

Risk register for firmware/hardware bring-up. These are not confirmed bugs.

## High Priority

### UART0 / Flow 2 On GPIO37-GPIO38

**Status:** still open / blocked by flow-controller hardware validation.

**Risk:** GPIO37/GPIO38 are default UART0 boot/download/log pins, but Flow 2 also uses them.

**Current code:** `HardwareSerial Flow2Serial(0);`

**Likely fix:** try `HardwareSerial Flow2Serial(3);` while keeping physical pins GPIO37/GPIO38.

**Test:** build, flash, confirm USB logs, then loopback GPIO37 TX to GPIO38 RX. Repeat with the real Flow 2 controller once available.

### Strapping Pins Used As CS/UART

**Status:** partially mitigated, still open for Flow 2.

**Risk:** GPIO34, GPIO35, GPIO36, GPIO37, and GPIO38 are strapping pins sampled at reset.

**Current use:**

- GPIO34 = CS5
- GPIO35 = CS4
- GPIO36 = CS3
- GPIO37 = Flow2 TX
- GPIO38 = Flow2 RX

**Updated note:** the MAX31856 schematic shows 10k pullups on CS, SCK, and SDI. That means CS3/CS4/CS5 should idle high during reset, which is good. GPIO35 is the key boot-mode pin and should be high for normal SPI boot.

**Remaining risk:** Flow2 on GPIO37/GPIO38 is still more concerning than the MAX31856 CS pins because those pins are also default UART0 boot/download/log pins.

**Failure mode:** boot failure, wrong boot mode, flashing issues, only boots when devices are unplugged.

**Test:** measure GPIO35/CS4 during reset. It should be about 3.3 V. Also boot/flash with all MAX31856 boards and Flow 2 connected/disconnected.

**Mitigation:** keep CS pullups; avoid strapping pins in a future board revision if possible; treat Flow2 GPIO37/GPIO38 as the higher-risk strap/UART case.

### Motor Command Queue Behavior

**Status:** queue ownership fixed; velocity stale-command behavior fixed; true e-stop still open.

**Current:** `commandTask` queues motor commands; `motorTask` owns `MotorController` and applies queued commands.

**Remaining risk:** queue depth is 8, so rapid absolute target updates could briefly queue stale targets. This is lower risk than velocity tracking because `motor.target_mm` is an absolute target and normal target motion now requires calibrated limits.

**Verified/fixed:** `motor.velocity_mm_s` now uses a one-slot latest-wins mailbox plus a `2000 ms` watchdog, so stale camera velocity commands are not replayed later.

**Later:** consider a latest-command mailbox for absolute target updates only if the web app starts streaming frequent absolute targets. Preserve priority handling for `stop`/future `estop`.

**Verified/fixed:** safe boot state, motor enable/disable commands, bounded StallGuard test/axis-calibration commands, endstop reporting, and warning-only queue setup status are implemented.

**Still open:** add a true emergency-stop command/path. `motor.stop` is a controlled software stop, not a hard power cutoff. Normal target/velocity motion is gated by calibrated software limits after `motor.calibrate_axis` succeeds.

### TMC2209 Single-Wire UART

**Status:** partially fixed/verified; hardware path remains a revision risk.

**Risk:** the TMC2209 UART path can fail if the bodge/series resistor/address wiring is wrong.

**Verified/fixed:** no-motion diagnostics exist through `motor.driver_status` and `motor.stall_status`; firmware uses RX GPIO32 and TX GPIO23; sense resistor was corrected to `0.05 ohm`; hardware errata now calls out the required 1 kOhm series resistor.

**Still open:** next PCB should route the TMC2209 UART path cleanly and keep it separate from Analog 1. Before trusting StallGuard, `motor.driver_status` must report `connection_ok:true`.

### TMC2209 Microstep Source: UART Vs MS1/MS2

**Status:** partially mitigated, still hardware-dependent.

**Risk:** firmware assumes `Config::kMicrosteps = 4`, but the MCP23017 MS1/MS2 helper only supports the standalone-driver choices `8`, `16`, `32`, and `64`.

**Current hardware:** MCP23017 address `0x20`; MS1 = GPA1/A1, MS2 = GPA0/A0. Address can change via jumper pads.

**Current code:** `IoExpander::setMotorMicrosteps(4)` returns false and produces the `motor_microsteps_invalid` boot warning. `MotorController::configureDriver()` then enables `mstep_reg_select(true)` and writes the 4-microstep setting over TMC2209 UART.

**Remaining risk:** if UART configuration fails, the driver may use an unexpected pin-selected fallback mode while firmware continues calculating motion at `400 steps/mm`.

**Current mitigation:** `motor.calibrate_axis` calls `configureDriver()` before calibration motion, so the required calibration workflow can recover TMC UART configuration if the initial boot write was missed. Operators should still verify `motor.driver_status` before trusting motion scale.

**Verified/fixed:** firmware now warns with `microstep_pins_unverified` if the MCP23017 is missing and `motor.driver_status` reports UART microstep readback.

**Test:** verify TMC2209 UART config succeeds, read back microstep setting, and verify the MCP23017 is present on I2C before trusting mm movement.

**Mitigation:** missing MCP23017 is warning-only for now; verify expander status in boot JSON before motor testing.

## Medium Priority

### Endstop Polarity / Homing Direction

**Status:** mostly verified in firmware bring-up; hardware connector still needs revision.

**Risk:** endstop is assumed active-low and bottom/home.

**Verified/fixed:** `motor.status` reports `endstop_active`; axis calibration can also complete on physical endstop; bring-up confirmed endstop status/behavior.

**Still open:** next hardware revision needs a dedicated endstop header/connector, already tracked in `hardware/errata.md`.

### Vertical Stage Mechanical Binding / Directional Speed Limit

**Status:** active hardware issue.

**Risk:** the stage has shown a repeatable sticking point at the same physical travel location, and downward motion is less reliable than upward motion at the same commanded speed. This points to mechanical binding, cable drag, rail/screw alignment, backlash, or gravity-assisted resonance rather than a pure firmware step-generation limit.

**Current behavior:** hardware-timed STEP generation improved the achievable speed compared with the previous polling path, but the supplier headline speed should not be treated as guaranteed on the assembled vertical camera stage.

**Test:** power off and hand-drive the screw through the full travel, test unloaded/with cable slack, run both directions at `2..5 mm/s`, and confirm whether the bind occurs at the same height or once per screw revolution.

**Mitigation:** fix mechanical binding before raising current or forcing through the spot. If the mechanism is otherwise acceptable, consider asymmetric speed limits for up/down tracking motion.

### Motor Direction / Steps Per MM

**Status:** partially verified.

**Risk:** current assumption is 200 steps/rev, 4 microsteps, 2 mm lead, 400 steps/mm.

**Verified/fixed:** direction convention was tested and `Config::kMotorDirectionInverted=true` is the current intended setting.

**Still open:** measure actual stage travel to validate `400 steps/mm` and the 2 mm lead assumption under real load.

### BME688 Address

**Status:** verified for the current board configuration unless hardware changes.

**Risk:** code defaults to `0x77`; some boards use `0x76`.

**Observed:** current logs show the BME688 responding at the configured address. Keep `0x76` in mind for replacement boards/modules.

**Later:** add autodetect if modules with mixed addresses are expected.

### I2C Bus Pullups / Conflicts

**Status:** confirmed as an active hardware bring-up risk.

**Risk:** shared SHT45/BME688 bus may fail from wiring, pullups, voltage, or address conflict.

**Observed:** a failed MCP23017/I/O expander connection pulled the I2C bus into an unhealthy idle-voltage state and caused MCP23017, SHT45, BME688, and SEN0496 startup failures together.

**Test:** I2C scan before individual sensor tests. Healthy SDA/SCL idle should be near 3.3 V. If all I2C devices fail together, isolate the device or cable dragging the bus down.

### MAX31856 Setup

**Status:** telemetry path validated; thermocouple wiring/type/fault validation should still be recorded in final validation.

**Risk:** code assumes K-type thermocouples.

**Verified/fixed:** MAX31856 devices initialize, publish telemetry, and are now configured for continuous conversion so thermocouple reads no longer block the sensor scheduler.

**Still open:** record final per-channel thermocouple validation in `docs/final-validation.md`, including realistic ambient/known-temperature readings and fault bytes.

### D6F ADC Calibration

**Status:** inactive for current hardware/firmware configuration.

**Risk:** ESP32 ADC voltage may not match actual D6F output exactly.

**Current:** D6F runtime instance is not active because GPIO23/Analog 1 is reserved for the TMC2209 UART path on this board revision.

**Later:** move the analog input or TMC UART route in hardware, then compare logged `voltage_v` to a multimeter and always log raw ADC plus voltage.

### Bronkhorst Baud / Node

**Status:** still open / pending flow-controller hardware.

**Risk:** code uses `38400,n,8,1` and node `0x80`; controllers may differ.

**Test:** read-only command first; try known baud rates; validate with laptop `bronkhorst-propar` if needed. Do not claim physical flow validation until the real controllers are connected.

### Real Flame / Glass-Tube OpenCV Validation

**Status:** prototype validated on printed targets/video-style flame imagery; final apparatus validation still open.

**Risk:** the current OpenCV.js tracker uses HSV thresholding with a bright low-saturation mask OR an orange/yellow colored mask. Real flame through a glass tube may add glare, reflections, exposure shifts, and saturation changes that were not present in printed-target tests.

**Current mitigation:** the prototype exposes separate sliders for bright and colored HSV masks, morphology kernel size, minimum contour area, P/PI mode, feedforward, `mmPerPx`, and control sign. Auto control is off by default and should only be enabled after one-shot command direction is verified.

**Test:** record the final working HSV ranges, contour behavior, setpoint, gains, feedforward state, and observed lag/overshoot in `docs/final-validation.md`.

## Lower Priority / Later Improvements

### Flow Percent Vs Physical Units

**Current:** flow setpoint uses percent converted to raw `0..32000`.

**Later:** support SCCM or controller output units.

### Command Acknowledgements

**Current:** status messages do not include command IDs.

**Later:** add `id` in commands and matching `ack` responses.

### Boot Warning Classification

**Current:** setup failures are warning-only and final boot status becomes `ready_with_warnings`.

**Risk:** firmware may continue running even if a device needed for a specific test failed to initialize.

**Later:** classify required devices as critical once bring-up requirements are fixed.

### Blocking Calls / Motion Smoothness

**Status:** sensor-side blocking mostly fixed; motor pulse timing moved to MCPWM; flow blocking remains a watch item.

**Risk:** sensor/flow libraries may still block their own tasks. MCPWM pulse generation no longer depends on how frequently `motorTask` runs, but calibration, software limits, acceleration updates, and watchdog handling still do.

**Watch for:** command lag, delayed limit/stall response, telemetry pauses, incorrect MCPWM frequency, or disagreement between PCNT position and physical travel.

**Verified/fixed:** sensor polling is split into fast I2C, BME688, and thermocouple tasks; I2C/SPI bus access is mutex-protected; BME688 uses async start/finish so its gas-heater wait does not hold the I2C bus; MAX31856 uses continuous conversion mode.

**Remaining behavior:** a Flow 1 timeout can still delay Flow 2 in `flowTask`.

**Current note:** `motorTask` runs every 1 ms and updates the motion planner. ESP32-P4 MCPWM generates STEP pulses continuously in hardware, and PCNT counts commanded pulses. PCNT does not detect physically skipped motor steps, so final motion-scale validation still requires measuring actual stage travel.

**Later:** shorten flow timeouts, consider separate flow tasks, use non-blocking flow reads if needed, and consider an independent hardware/timer cutoff because continuous MCPWM output can continue if the motor task or scheduler fails completely.

### JSON / Heap Use

**Risk:** dynamic JSON allocation could matter during long runs.

**Watch for:** resets, parse failures, degraded long-run behavior.

### Missing Host Logger

**Status:** still open / belongs on the host-webapp side.

**Current:** firmware streams JSONL but laptop logger is not implemented.

**Later:** webapp/logger should record each serial JSON line with host monotonic receive time, estimate MCU-to-host time offset, and save `.jsonl` with both MCU `t_us` and host timestamps for camera sync.
