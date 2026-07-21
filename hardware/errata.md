<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# Hardware Errata v1

Confirmed hardware issues and revision notes for the IgNYte-FPA support electronics.

## Endstop Connector Missing

Current issue:

- The current hardware does not provide a dedicated connector for the motor endstop switch.
- The endstop connection needs real header pins on the board so the switch can plug in securely during bring-up and normal use.
- This makes bring-up awkward because the endstop must be wired through loose jumper wires, direct soldering, or an external adapter.

Why it matters:

- The endstop is part of the motor safety and homing path.
- A loose or improvised connection can make endstop behavior unreliable.
- Directly soldering an endstop lead to the controller is inconvenient for debugging, replacement, and strain relief.

Next hardware revision:

- Add a dedicated endstop connector/header near the motor/stage interface.
- At minimum, expose `ENDSTOP` and `GND`.
- Consider a 3-pin connector with `3V3`, `GND`, and `ENDSTOP` so both bare switches and endstop modules can be supported.
- Use clear silkscreen labels for signal, ground, and optional power.

## TMC2209 UART RX Needs Series Resistor

Current issue:

- The TMC2209 UART bring-up required a bodged UART receive path instead of a clean board-level connection.
- The ESP32-side TMC2209 UART RX path should be wired through a 1 kOhm series resistor for the TMC2209 single-wire UART interface.

Why it matters:

- The TMC2209 PDN_UART interface is commonly used as a shared/single-wire UART node.
- A series resistor limits contention current and makes the MCU UART connection safer when TX/RX are tied into the driver UART line.
- Without this resistor and a documented routing path, UART diagnostics and StallGuard configuration can fail or require fragile bodge wiring.

Next hardware revision:

- Add the TMC2209 UART RX routing explicitly to the schematic.
- Include a 1 kOhm series resistor in the ESP32-to-TMC2209 UART path.
- Keep the TMC UART path separate from analog sensor headers so Analog 1 can be restored as a normal sensor input if needed.
- Label the resistor and UART net clearly for bring-up probing.

## More Ground Access Points Needed

Current issue:

- The current hardware does not provide enough convenient GND access points for bring-up and test wiring.

Why it matters:

- During hardware bring-up, temporary devices often need a reliable ground reference.
- Extra sensors, endstops, probes, oscilloscope clips, logic analyzers, and test jumpers all need accessible GND.
- Sharing a weak or improvised ground connection can cause noisy readings, unreliable digital inputs, or confusing debug results.

Next hardware revision:

- Add more GND pins or test pads near major connector groups.
- Add at least one easy-to-clip ground test point for oscilloscope or logic analyzer use.
- Consider small GND header blocks near the sensor, motor, and auxiliary I/O areas.
- Clearly label all ground access points on silkscreen.

## FireBeetle Header Footprint Offset

Current issue:

- The FireBeetle board pin/header placement appears to be off by about 1 mm relative to the current PCB footprint.
- This can make the module difficult to seat cleanly and may mechanically stress the headers or solder joints.

Why it matters:

- Misaligned headers can cause poor insertion, intermittent contact, bent pins, or long-term mechanical stress.
- Bring-up measurements may be less reliable if the module is not fully seated.
- Rework becomes harder because the module footprint is the central controller interface.

Next hardware revision:

- Recheck the FireBeetle 2 ESP32-P4 mechanical drawing against the PCB footprint.
- Verify both header pitch and row-to-row spacing.
- Print a 1:1 footprint check before ordering the next PCB.
- If possible, test-fit the module footprint with headers before committing the next board revision.

## Flow 2 Uses UART0 / Strapping-Pin GPIOs

Current issue:

- Flow 2 is routed to GPIO37/GPIO38.
- Those pins overlap with ESP32-P4 UART0/download/logging concerns.
- GPIO34, GPIO35, GPIO36, GPIO37, and GPIO38 are also strapping-pin area risks that should be reviewed carefully during the next board revision.

Why it matters:

- A connected flow controller could interfere with boot, flashing, or serial logging if it drives those pins at the wrong time.
- Flow-controller hardware was not available during the main bring-up, so this path remains unvalidated with the real controllers.
- MAX31856 chip-select pullups reduce the risk on the SPI CS pins, but Flow 2 on GPIO37/GPIO38 is still the higher-risk case.

Next hardware revision:

- Avoid routing external serial devices to boot/download/logging pins where possible.
- If GPIO37/GPIO38 must remain, validate boot and flashing with the real Flow 2 controller connected and disconnected.
- Keep pullups/pulldowns and connector behavior explicit in the schematic so reset-state pin levels are predictable.
