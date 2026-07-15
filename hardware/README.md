<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# motherV1

`motherV1` is a fabricated and tested custom DAQ/interface motherboard for the IgNYte-FPA ESP32-P4 sensor hub. It consolidates the apparatus support electronics onto one PCB, mounting the FireBeetle 2 ESP32-P4, sensor breakout interfaces, TMC2209 stepper-driver interface, RS232 flow-controller interfaces, and 20 V / 5 V / 3.3 V power distribution used for fire-propagation apparatus bring-up and firmware integration.

The board is intended to reduce loose wiring during apparatus bring-up by collecting the major support electronics on one PCB:

- DFRobot FireBeetle 2 ESP32-P4 controller interface
- TMC2209 stepper motor driver interface
- MCP23017 I/O expander
- 4 MAX31856 thermocouple interfaces
- SHT45, BME688, and SEN0496 I2C sensor interfaces
- SPI and analog sensor expansion
- D6F analog flow sensor support
- Flow controller UART interfaces
- Motor DIAG, INDEX, and endstop-related signals
- USB-C power input
- MPM3610 buck converter
- TPS62827 buck converter
- Power distribution for the sensor hub peripherals

## Directory Layout

```text
hardware/
  README.md
  errata.md
  motherV1/
    motherV1.kicad_pro
    motherV1.kicad_sch
    motherV1.kicad_pcb
    motherv1-schematic.pdf
    jlcpcb/
      motherV1.zip
      bom.csv
      positions.csv
      designators.csv
      netlist.ipc
```

## Design Files

The KiCad source files for the board are stored in `hardware/motherV1/`.

- `motherV1.kicad_pro`: KiCad project file
- `motherV1.kicad_sch`: schematic source
- `motherV1.kicad_pcb`: PCB layout source
- `motherv1-schematic.pdf`: exported schematic PDF for quick review

The `hardware/motherV1/jlcpcb/` directory contains manufacturing/export files for JLCPCB, including the Gerber archive, BOM, component placement data, designators, and IPC netlist.

## Board Status

`motherV1` has been fabricated and tested. The board is usable for current bring-up and firmware integration work, but it has known revision notes that should be addressed before a future hardware revision.

See [errata.md](./errata.md) for confirmed hardware issues and next-revision recommendations.

## Validation Summary

| Subsystem | Status | Evidence |
| --- | --- | --- |
| 20 V input | Validated | Measured voltage/current |
| 5 V buck | Validated | No-load/load voltage |
| 3.3 V buck | Validated | No-load/load voltage |
| FireBeetle headers | Usable with errata | Footprint offset noted |
| I2C sensors | Validated | Scan + telemetry |
| Thermocouples | Validated | MAX31856 telemetry |
| TMC2209 | Validated with bodge | UART/status/motion |
| Endstop | Works, needs connector | Errata |
| Flow RS232 | Pending controllers | Planned test |

## Known Errata Summary

The current hardware errata includes:

- Missing dedicated motor endstop connector
- TMC2209 UART RX path requiring a 1 kOhm series resistor / bodge routing
- Insufficient convenient ground access points for bring-up and probing
- FireBeetle 2 ESP32-P4 header footprint offset of approximately 1 mm

Refer to [errata.md](./errata.md) for the detailed impact and proposed fixes for each issue.

## Notes For Bring-Up

- Keep the motor driver and motor power available during firmware boot when testing motor configuration. If the driver is unpowered during initialization, configuration commands such as microstep setup may not take effect and the driver can remain at its default settings.
- Treat the JLCPCB export folder as a snapshot of the current fabricated revision. Regenerate manufacturing files from KiCad before ordering a revised board.
- Do not delete or ignore the errata when using this revision; several issues affect motor bring-up, wiring reliability, and next-board layout changes.
