# Debug Log

Use this file for confirmed problems that were observed, diagnosed, and fixed. Keep suspected or unverified risks in `docs/possible-issues.md`.

When adding an entry, use this format:

```text
## YYYY-MM-DD - Short Title

Symptom:

Cause:

Fix:

Verification:
```

## 2026-06-10 - PlatformIO Build Failed From Edited TMCStepper Header

Symptom:

`pio run` failed while compiling `TMCStepper`. The compiler reported:

```text
stray '#' in program
move#pragma once
```

Cause:

The generated dependency file `.pio/libdeps/esp32-p4/TMCStepper/src/TMCStepper.h` had an accidental `move` token before `#pragma once`.

Fix:

Removed the stray `move` text so the first line returned to:

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

