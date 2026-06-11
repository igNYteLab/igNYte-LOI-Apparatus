# Change Log

Use this file for confirmed problems/fixes and meaningful design changes. Keep suspected or unverified risks in `docs/possible-issues.md`.

When adding an entry, use this format:

```text
## YYYY-MM-DD - Short Title

What changed:

Why:

Verification:
```

## 2026-06-11 - Motor Commands Routed Through FreeRTOS Queue

What changed:

- Added a motor command queue with depth 8.
- `commandTask` now validates motor JSON commands and queues them.
- `motorTask` now owns `MotorController`, drains queued commands, and applies them before `motor.service()`.
- Motor commands now require their fields instead of defaulting to current motor position.

Why:

`commandTask` and `motorTask` previously touched motor state directly. The queue gives motor state clear ownership and reduces race-condition risk with `AccelStepper`.

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```

## 2026-06-10 - PlatformIO Build Failed From Edited TMCStepper Header

What changed:

Removed an accidental `move` token from the generated dependency file `.pio/libdeps/esp32-p4/TMCStepper/src/TMCStepper.h`.

Why:

`pio run` failed while compiling `TMCStepper`. The compiler reported:

```text
stray '#' in program
move#pragma once
```

The first line needed to be:

```cpp
#pragma once
```

Verification:

Reran PlatformIO build:

```text
pio run
```

Result:

```text
SUCCESS
```

