<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# OpenCV.js Flame-Tracking Prototype

Standalone browser prototype for tracking the bottom of a flame-like target using OpenCV.js.

This is intentionally separate from the production `ignyte` web app for now. The goal is to prove the camera processing, overlay, tracking output, and one-axis recommendation logic before integrating anything into the web app or firmware control path.

## Assumptions Made In This Prototype

- The final apparatus uses a vertical stage that moves the camera, not the sample.
- The sample is stationary and the flame front travels downward on the sample.
- The first control target is the bottom of the flame or flame-like object.
- Only vertical image motion matters. There is no X-axis stage control.
- Image coordinates use browser/OpenCV convention: origin at top-left, `x` right, `y` down.
- Default setpoint is the center row of the frame, but it is configurable.
- The detector uses two HSV masks: one for bright low-saturation flame regions and one for orange/yellow colored flame regions.
- The two masks are combined with a logical OR before contour detection.
- Current default detector values are based on printed targets and recorded flame videos, not final apparatus validation through glass.
- Real flame testing will still require threshold tuning because reflections, exposure changes, glass glare, and flame brightness vary.
- The prototype uses browser webcam access through `getUserMedia`.
- The prototype loads OpenCV.js from a CDN first for quick testing.
- The prototype is browser-only. It does not expose WebSocket, HTTP, MJPEG, or any API yet.
- The prototype can connect to the ESP32-P4 firmware through browser Web Serial.
- The prototype can manually send firmware commands after the operator connects the board.
- Auto control is disabled by default and must be explicitly toggled on by the operator.
- Auto control sends the latest velocity recommendation at a limited rate.
- If tracking is lost, the auto-control command becomes `{"cmd":"motor.velocity_mm_s","mm_s":0}`.
- OpenCV/browser code may not be able to disable auto exposure, auto white balance, gain, or focus on the Brio 100. The page reports camera capabilities/settings and applies constraints only on a best-effort basis.
- Processing is throttled below camera frame rate by default to reduce browser load.

## What It Shows

- Live webcam frame with overlay.
- Binary combined mask preview.
- Separate slider groups for the bright HSV mask and colored HSV mask.
- Selected contour outline.
- Bounding box.
- Bottom-point marker.
- Configurable horizontal setpoint line.
- Controller mode toggle between P and PI.
- Feedforward toggle and gain input.
- Tracking status, confidence, pixel error, image velocity, and velocity recommendation.
- Latest JSON tracking message.
- Camera capabilities and actual settings.
- Firmware serial controls and serial log.

## Run

Serve the folder from localhost. Camera access will not work reliably from a raw `file://` URL.

```powershell
cd C:\Users\llane\OneDrive\Documents\GithubRepos\IgNYte-FPA\software\camera\opencv-js-prototype
python -m http.server 8080
```

Open Chrome or Edge:

```text
http://localhost:8080
```

## First Test Target

Use a printed orange/yellow flame image on a simple background first. Recorded flame video on a screen is also useful after the printed target works.

Good first checks:

- The combined mask should be white mainly on the printed flame.
- The bright mask sliders should pick up white/yellow high-value flame regions.
- The colored mask sliders should pick up orange/yellow saturated flame regions.
- The contour should outline the whole target, not only the internal highlight.
- The red bottom dot should sit near the bottom of the flame shape.
- `error_y_px` should be near zero when the bottom dot is on the setpoint line.
- `tracking` should become `false` when the target leaves the frame.
- The recommendation should become `null` inside the deadband or when tracking is lost.

## Detector Logic

The segmentation pipeline in `src/detector.js` is:

```text
canvas frame
  -> RGBA to RGB
  -> RGB to HSV
  -> bright HSV inRange
  -> colored HSV inRange
  -> combinedMask = brightMask OR coloredMask
  -> morphology open
  -> morphology close
  -> external contour detection
  -> largest contour above minAreaPx
  -> bottom-most contour point
```

Default mask ranges live in `src/config.js`:

```js
brightHsvLow: { h: 0, s: 0, v: 170 }
brightHsvHigh: { h: 60, s: 90, v: 255 }
coloredHsvLow: { h: 0, s: 40, v: 80 }
coloredHsvHigh: { h: 45, s: 255, v: 255 }
```

OpenCV.js is loaded in `index.html` from:

```html
<script async src="https://docs.opencv.org/4.x/opencv.js"></script>
```

That script creates the global `cv` object. The project files call OpenCV functions through that global object after OpenCV finishes loading.

## Tuning Order

Tune in this order:

1. Camera exposure and lighting first. Keep the image stable before tuning HSV.
2. Bright HSV mask for washed-out yellow/white flame regions.
3. Colored HSV mask for orange/yellow flame body.
4. `minAreaPx` to reject small reflections/noise.
5. `kernelSizePx` to remove speckles and fill small holes.
6. Setpoint row and deadband.
7. Controller gains.
8. Feedforward only after P or PI behavior is understandable.

If the contour only follows the internal highlight, widen the colored mask or lower its value/saturation thresholds. If reflections are being tracked, increase `minAreaPx`, tighten hue/saturation ranges, or improve lighting/background before changing controller gains.

## Output Contract

The prototype displays a JSON object shaped for later web app integration:

```json
{
  "type": "vision.tracking",
  "version": 1,
  "frame_id": 123,
  "t_host_ms": 45678.9,
  "tracking": true,
  "confidence": 0.87,
  "frame_width_px": 1920,
  "frame_height_px": 1080,
  "target": {
    "bottom_x_px": 910,
    "bottom_y_px": 622,
    "bbox_px": [850, 410, 120, 212],
    "area_px": 14800
  },
  "setpoint": {
    "y_px": 540,
    "y_norm": 0.5
  },
  "error": {
    "y_px": 82
  },
  "recommendation": {
    "mode": "velocity_mm_s",
    "velocity_mm_s": -0.25
  }
}
```

When tracking is lost:

```json
{
  "type": "vision.tracking",
  "version": 1,
  "tracking": false,
  "confidence": 0,
  "recommendation": null
}
```

## Controller Mode, Feedforward, And Control Sign

The prototype can switch between a proportional controller and a proportional-integral controller.

In P mode, it computes:

```text
error_y_px = target_bottom_y_px - setpoint_y_px
velocity_mm_s = control_sign * kp_mm_s_per_px * error_y_px
```

In PI mode, it also accumulates error over time:

```text
integral_error_px_s += error_y_px * dt_s
velocity_mm_s = control_sign * (kp_mm_s_per_px * error_y_px + ki_mm_s_per_px_s * integral_error_px_s)
```

The PI integral state resets when tracking is lost, when the error enters the deadband, when the camera starts/stops, when auto control is toggled, and when the controller mode changes. The accumulated integral is clamped by `maxIntegralErrorPxS` from `src/config.js`.

Feedforward can be toggled separately from P/PI. It estimates the flame's real image-plane velocity by adding the measured image velocity to the estimated applied camera velocity converted back into pixels per second. The applied velocity estimate follows the same acceleration limit as the firmware instead of assuming the stage reaches each command immediately:

```text
image_velocity_px_s = (bottom_y_now - bottom_y_previous) / dt_s
estimated_applied_mm_s = move_toward(
  previous_applied_mm_s,
  last_commanded_mm_s,
  motor_acceleration_mm_s2 * dt_s
)
camera_velocity_px_s = estimated_applied_mm_s / (control_sign * mm_per_px)
estimated_flame_velocity_px_s = image_velocity_px_s + camera_velocity_px_s
feedforward_mm_s = control_sign * feedforward_gain * estimated_flame_velocity_px_s * mm_per_px
velocity_mm_s = feedback_mm_s + feedforward_mm_s
```

This frame-of-reference correction matters because once the camera is following the flame well, the flame may appear nearly stationary in the image even though the real burn front is still moving. Start with feedforward gain below `1.0`, then increase only if the stage still lags without overshooting. The `mm_per_px` value is approximate and should be tuned at the flame plane.

`motorAccelerationMmS2` in `src/config.js` must match firmware `Config::kMaxStageAccelMmS2`. Stop, watchdog, stall, and limit events remain immediate in firmware and reset the browser's applied-velocity estimate to zero.

`control_sign` is configurable because the relationship between image error and motor command direction must be validated on the real stage.

Current defaults in `src/config.js` are:

```text
controller mode: P
setpointYNorm: 0.5
controlSign: -1
maxVelocityMmS: 25.0
motorAccelerationMmS2: 40.0
feedforwardEnabled: false
autoControlHz: 10
processFps: 12
```

## Firmware Serial

Use Chrome or Edge for Web Serial support. Connect the board, enable the motor manually, then use either:

- `Send Current Recommendation Once` for one command at a time.
- `Auto Control Off/On` to repeatedly send the current recommendation at `autoControlHz` from `src/config.js`.
- `Calibrate Axis` to send `{"cmd":"motor.calibrate_axis"}` after turning off auto control.

Recommended motor test flow:

1. Connect the board.
2. Run `Driver status` and confirm the TMC2209 responds.
3. Enable the motor.
4. Run `Calibrate Axis`.
5. Start the camera and confirm tracking is stable.
6. Use `Send Current Recommendation Once`.
7. Toggle `Auto Control On` only after one-shot commands move in the expected direction.

Turning auto control off sends zero velocity first. Stopping the camera, clicking `Stop`, clicking `Disable`, or disconnecting serial also sends zero velocity first if auto control was active; otherwise those controls send their direct firmware command.

The serial log prints `calibrate clicked` before the calibration command is attempted. If that line appears without a following `> {"cmd":"motor.calibrate_axis"}`, the button handler fired but the serial write path failed.

## Files

- `index.html`: standalone browser page.
- `styles.css`: layout and visual styling.
- `src/config.js`: centralized default camera, detector, and controller values.
- `src/app.js`: camera setup, OpenCV startup, processing loop, UI wiring.
- `src/detector.js`: dual HSV thresholding, mask combination, morphology, contour selection, bottom-point detection.
- `src/controller.js`: one-axis P/PI/feedforward error and velocity recommendation.
- `src/messages.js`: stable JSON message builder.
- `src/serial.js`: Web Serial connection, firmware command builders, serial log, and recommendation-to-command conversion.

## Later Integration Direction

After this prototype is validated, the detector/controller/message logic can be ported into the `ignyte` web app. The web app should still own safety decisions and firmware command forwarding over Web Serial.

The production app should preserve these responsibilities:

- Camera frame ownership and UI state belong to the web app.
- Vision logic should emit tracking/recommendation data, not silently command hardware by itself.
- Operator actions should gate motor enable, calibration, and auto control.
- Firmware remains the final authority on calibrated limits, stops, and driver state.
