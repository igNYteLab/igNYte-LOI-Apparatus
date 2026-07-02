# OpenCV.js Flame-Tracking Prototype

Standalone browser prototype for tracking the bottom of a flame-like orange/yellow target.

This is intentionally separate from the production `ignyte` web app for now. The goal is to prove the camera processing, overlay, tracking output, and one-axis recommendation logic before integrating anything into the web app or firmware control path.

## Assumptions Made In This Prototype

- The final apparatus uses a vertical stage that moves the camera, not the sample.
- The sample is stationary and the flame front travels downward on the sample.
- The first control target is the bottom of the flame or flame-like object.
- Only vertical image motion matters. There is no X-axis stage control.
- Image coordinates use browser/OpenCV convention: origin at top-left, `x` right, `y` down.
- Default setpoint is the center row of the frame, but it is configurable.
- The first detector is tuned for a printed orange/yellow flame target, not a real flame through glass.
- Real flame testing will require threshold tuning because reflections, exposure changes, and flame brightness are not yet validated.
- The prototype uses browser webcam access through `getUserMedia`.
- The prototype loads OpenCV.js from a CDN first for quick testing.
- The prototype is browser-only. It does not expose WebSocket, HTTP, MJPEG, or any API yet.
- The prototype can connect to the ESP32-P4 firmware through browser Web Serial.
- The prototype can manually send firmware commands after the operator connects the board.
- Auto control is disabled by default and must be explicitly toggled on by the operator.
- Auto control sends the latest velocity recommendation at a limited rate.
- If tracking is lost, the auto-control command becomes zero velocity.
- OpenCV/browser code may not be able to disable auto exposure, auto white balance, gain, or focus on the Brio 100. The page reports camera capabilities/settings and applies constraints only on a best-effort basis.
- Processing is throttled below camera frame rate by default to reduce browser load.

## What It Shows

- Live webcam frame with overlay.
- Binary orange/yellow mask preview.
- Selected contour outline.
- Bounding box.
- Bottom-point marker.
- Configurable horizontal setpoint line.
- Tracking status, confidence, pixel error, and velocity recommendation.
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

Use a printed orange/yellow flame image on a simple background. Move it slowly up and down in the webcam frame.

Good first checks:

- The mask should be white mainly on the printed flame.
- The contour should outline the printed flame.
- The red bottom dot should sit near the bottom of the flame shape.
- `error_y_px` should be near zero when the bottom dot is on the setpoint line.
- `tracking` should become `false` when the target leaves the frame.
- The recommendation should become `null` inside the deadband or when tracking is lost.

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

## Control Sign

The prototype computes:

```text
error_y_px = target_bottom_y_px - setpoint_y_px
velocity_mm_s = control_sign * kp_mm_s_per_px * error_y_px
```

`control_sign` is configurable because the relationship between image error and motor command direction must be validated on the real stage.

## Firmware Serial

Use Chrome or Edge for Web Serial support. Connect the board, enable the motor manually, then use either:

- `Send Current Recommendation Once` for one command at a time.
- `Auto Control Off/On` to repeatedly send the current recommendation at `autoControlHz` from `src/config.js`.
- `Calibrate Axis` to send `{"cmd":"motor.calibrate_axis"}` after turning off auto control.

Turning auto control off, stopping the camera, clicking `Stop`, clicking `Disable`, or disconnecting serial sends zero velocity first.

The serial log prints `calibrate clicked` before the calibration command is attempted. If that line appears without a following `> {"cmd":"motor.calibrate_axis"}`, the button handler fired but the serial write path failed.

## Files

- `index.html`: standalone browser page.
- `styles.css`: layout and visual styling.
- `src/config.js`: centralized default camera, detector, and controller values.
- `src/app.js`: camera setup, OpenCV startup, processing loop, UI wiring.
- `src/detector.js`: HSV thresholding, morphology, contour selection, bottom-point detection.
- `src/controller.js`: one-axis error and velocity recommendation.
- `src/messages.js`: stable JSON message builder.
- `src/serial.js`: Web Serial connection, firmware command builders, serial log, and recommendation-to-command conversion.

## Later Integration Direction

After this prototype is validated, the detector/controller/message logic can be ported into the `ignyte` web app. The web app should still own safety decisions and firmware command forwarding over Web Serial.
