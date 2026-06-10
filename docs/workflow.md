# AI-Agent Firmware Workflow

Use this workflow when developing the IgNYte-FPA firmware with Codex or another AI agent.

## Core Rule

Move fast when creating structure. Slow down at review gates, hardware behavior, and safety-critical code.

Do not try to understand every line of the whole project at once. Understand one subsystem at a time.

## Recommended Development Loop

1. Describe the goal and hardware context.
2. Ask the agent to restate assumptions.
3. Ask questions until the assumptions are clear.
4. Let the agent make a small, focused change.
5. Build immediately.
6. Review the changed subsystem.
7. Run the smallest useful hardware test.
8. Record what worked, what failed, and what changed.
9. Move to the next subsystem.

## Review Order For This Project

Review in this order:

1. `AppConfig.h`: pins, baud rates, motor constants, polarity assumptions.
2. `main.cpp`: FreeRTOS tasks, command parsing, data flow.
3. `MotorController`: anything that can enable or move the motor.
4. Sensor wrappers: one sensor type at a time.
5. `ProparAsciiClient`: Bronkhorst protocol and serial behavior.
6. `Telemetry`: JSON output format and timestamp behavior.

## How To Ask The Agent

Good prompts:

Explain this subsystem in plain language before editing it.

List the assumptions and safety risks in this file.

Make the smallest change needed and then run the build.

Create a no-motion test for the TMC2209 UART only.

Walk me through this file line by line, but focus on what affects hardware.

Before editing, tell me which files you plan to change and why.

Avoid broad prompts like:

Finish all the firmware.

Make it production ready.

Refactor everything.

## Build Rule

Run a build after every meaningful code change:

C:\Users\llane\.platformio\penv\Scripts\pio.exe run

A successful build means:

- files are syntactically valid
- dependencies resolve
- the selected board/framework can compile the code

A successful build does not mean:

- hardware wiring is correct
- UARTs work
- sensors are detected
- motor direction is correct
- safety behavior is validated

## Hardware Bring-Up Order

Do not connect and test everything at once. Bring up one subsystem at a time.

Recommended order:

1. Boot firmware and confirm JSON status over USB serial.
2. Confirm `Serial` does not conflict with other UARTs.
3. Run I2C scan.
4. Test SHT45.
5. Test BME688.
6. Test one MAX31856.
7. Test all MAX31856 channels.
8. Test D6F analog voltage and compare to a multimeter.
9. Test TMC2209 UART with motor movement disabled.
10. Test motor enable pin.
11. Test very small motor movement at low current.
12. Verify motor direction.
13. Verify endstop polarity.
14. Implement and test homing.
15. Test Bronkhorst read-only communication.
16. Test Bronkhorst setpoint at safe low flow.
17. Run integrated firmware.
18. Add host-side logging.

## RTOS Mental Model

A FreeRTOS task is like a separate `loop()` running alongside other loops.

Current task intent:

- motor task: highest priority, keeps motion responsive
- command task: reads laptop commands
- sensor task: polls sensors at each sensor's configured rate
- flow task: polls Bronkhorst controllers
- Arduino `loop()`: idle

Rules of thumb:

- motor/control tasks should not wait on slow sensors or serial reads
- low-priority tasks may block briefly
- shared data between tasks should use queues, mutexes, or clear ownership
- only one task should eventually own motor motion state

## Safety Review Gate

Before real motor testing, review and harden:

- motor starts disabled or in a safe state
- current limit is appropriate
- direction polarity is known
- endstop polarity is known
- negative movement is blocked
- max travel is configured
- homing behavior is defined
- emergency stop command exists
- motor commands go through one task or queue

## Data Logging Rule

Raw firmware telemetry should stay event-based.

Each sensor logs only when it is sampled. Faster sensors do not include stale values from slower sensors, and slower sensors are not emitted as `null`.

The laptop can later resample, interpolate, or carry-forward values during analysis.

## When To Ask For A Line-By-Line Explanation

Ask for line-by-line explanation when a file:

- can move hardware
- can change flow controller setpoints
- handles voltage/current/safety limits
- affects task scheduling
- parses commands from the laptop

For simple sensor wrappers, a high-level explanation is usually enough unless something fails.

## Documentation Rule

When a design decision changes, update:

- `docs/project-context.md` for architecture and assumptions
- `docs/workflow.md` for process changes
- `AppConfig.h` for pin/config constants

Future agents should read `docs/project-context.md` and `docs/workflow.md` before making firmware changes.

