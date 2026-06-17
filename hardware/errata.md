# Hardware Errata v1

Confirmed hardware issues and revision notes for the IgNYte-FPA support electronics.

## Endstop Connector Missing

Current issue:

- The current hardware does not provide a dedicated connector for the motor endstop switch.
- This makes bring-up awkward because the endstop must be wired through loose jumper wires, direct soldering, or an external adapter.

Why it matters:

- The endstop is part of the motor safety and homing path.
- A loose or improvised connection can make endstop behavior unreliable.
- Directly soldering an endstop lead to the controller is inconvenient for debugging, replacement, and strain relief.

Next hardware revision:

- Add a dedicated endstop connector near the motor/stage interface.
- At minimum, expose `ENDSTOP` and `GND`.
- Consider a 3-pin connector with `3V3`, `GND`, and `ENDSTOP` so both bare switches and endstop modules can be supported.
- Use clear silkscreen labels for signal, ground, and optional power.

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
