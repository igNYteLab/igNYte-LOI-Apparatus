# Possible Issues

Risk register for firmware/hardware bring-up. These are not confirmed bugs.

## High Priority

### UART0 / Flow 2 On GPIO37-GPIO38

**Risk:** GPIO37/GPIO38 are default UART0 boot/download/log pins, but Flow 2 also uses them.

**Current code:** `HardwareSerial Flow2Serial(0);`

**Likely fix:** try `HardwareSerial Flow2Serial(3);` while keeping physical pins GPIO37/GPIO38.

**Test:** build, flash, confirm USB logs, then loopback GPIO37 TX to GPIO38 RX.

### Strapping Pins Used As CS/UART

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

### Motor Safety / Task Ownership

**Risk:** `commandTask` and `motorTask` both touch motor state.

**Likely fix:** motor command queue; only `motorTask` mutates `MotorController`.

**Before motor testing:** add safe boot state, max travel, endstop test, homing routine, and `estop`.

### TMC2209 Single-Wire UART

**Risk:** GPIO32 single-wire UART may compile but not actually communicate with the TMC2209.

**Test:** add no-motion UART test and read a known driver register before enabling movement.

**Check:** PDN_UART wiring, address pins, sense resistor, UART baud, required series resistor.

### TMC2209 Microstep Source: UART Vs MS1/MS2

**Risk:** firmware assumes `Config::kMicrosteps = 16`, and MS1/MS2 must match that setting.

**Current hardware:** MCP23017 address `0x20`; MS1 = GPA1/A1, MS2 = GPA0/A0. Address can change via jumper pads.

**Current code:** `IoExpander` sets MS1/MS2 from `Config::kMicrosteps`; for 1/16, both are driven high before `motor.begin()`.

**Remaining risk:** if the MCP23017 is missing or UART config fails, the driver may use an unexpected fallback microstep mode.

**Test:** verify TMC2209 UART config succeeds and read back microstep setting before trusting mm movement.

**Mitigation:** missing MCP23017 is warning-only for now; verify expander status in boot JSON before motor testing.

## Medium Priority

### Endstop Polarity / Homing Direction

**Risk:** endstop assumed active-low and bottom/home.

**Test:** add command to report raw endstop state before moving motor.

### Motor Direction / Steps Per MM

**Risk:** current assumption is 200 steps/rev, 16 microsteps, 2 mm lead, 1600 steps/mm.

**Test:** command tiny moves and measure actual direction/distance.

### BME688 Address

**Risk:** code defaults to `0x77`; some boards use `0x76`.

**Test:** I2C scan; add autodetect if needed.

### I2C Bus Pullups / Conflicts

**Risk:** shared SHT45/BME688 bus may fail from wiring, pullups, voltage, or address conflict.

**Test:** I2C scan before individual sensor tests.

### MAX31856 Setup

**Risk:** code assumes K-type thermocouples.

**Test:** verify ambient reading and fault byte on one channel before all channels.

### D6F ADC Calibration

**Risk:** ESP32 ADC voltage may not match actual D6F output exactly.

**Test:** compare logged `voltage_v` to multimeter; always log raw ADC and voltage.

### Bronkhorst Baud / Node

**Risk:** code uses `38400,n,8,1` and node `0x80`; controllers may differ.

**Test:** read-only command first; try known baud rates; validate with laptop `bronkhorst-propar` if needed.

## Lower Priority / Later Improvements

### Flow Percent Vs Physical Units

**Current:** flow setpoint uses percent converted to raw `0..32000`.

**Later:** support SCCM or controller output units.

### Command Acknowledgements

**Current:** status messages do not include command IDs.

**Later:** add `id` in commands and matching `ack` responses.

### Blocking Calls / Motion Smoothness

**Risk:** sensor/flow libraries may block; `AccelStepper` needs frequent service calls.

**Watch for:** motor stutter, command lag, telemetry pauses.

**Later:** use motor queue and consider timer/RMT step generation.

### JSON / Heap Use

**Risk:** dynamic JSON allocation could matter during long runs.

**Watch for:** resets, parse failures, degraded long-run behavior.

### Missing Host Logger

**Current:** firmware streams JSONL but laptop logger is not implemented.

**Later:** Python logger with laptop receive timestamps and `.jsonl` output.
