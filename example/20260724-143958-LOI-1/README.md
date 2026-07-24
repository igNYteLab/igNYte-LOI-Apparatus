# Example Run: 20260724-143958-LOI-1

| Field | Value |
| --- | --- |
| Test time | 2026-07-24 14:39:58 ET |
| Test duration | 34.3 s |
| Sample | Kitchen Towel |
| Run ID | `20260724-143958-LOI-1` |
| Protocol / preset ID | `LOI-1` |
| Operator | Andre Pasimio Llaneta |
| Sensor samples | 525 |
| Exported frames | 172 |
| Frame export rate | 5 FPS |
| Vision metric samples | 213 |
| Frame source | HSI video |

This folder is an example export from the igNYte LOI apparatus web application.
It shows the combined output of a short test run: synchronized sensor telemetry,
RGB and HSI video recordings, exported frame images, and flame-tracking vision
outputs.

## Output Files

| Output | Function |
| --- | --- |
| `20260724-143958-LOI-1.json` | Primary machine-readable export for the run. It contains run metadata, the sensor sample log, the exported frame list, and the frame association attached to each sensor sample. |
| `20260724-143958-LOI-1-rgb.webm` | RGB camera recording for visual review of the test. This is useful for checking sample behavior, lighting, and visible flame progression. |
| `20260724-143958-LOI-1-hsi (1).webm` | HSI/source camera recording. In this export, the frame images were generated from this stream. |
| `frames/` | Folder of exported still images. The run exported 172 JPEG frames at 5 FPS for frame-level analysis. |
| `vision/tracking-metrics.json` | Machine-readable flame-tracking output. Each metric includes timing, tracking state, confidence, frame size, setpoint, detected target position/area when available, recommended vertical-stage velocity, and processed FPS. |
| `vision/flame-tracking-overlay.webm` | Review video with flame-tracking overlays rendered on top of the camera stream. This is useful for validating whether the vision algorithm tracked the expected flame region. |

## Main JSON Structure

The main JSON export is organized into three top-level sections:

| Section | Description |
| --- | --- |
| `meta` | Run-level metadata, including run ID, start/stop time, duration, operator, frame count, video filenames, frame source, and vision output filenames. |
| `samples` | Firmware telemetry samples received during the run. Samples include thermocouples, environmental sensors, oxygen data, and timing fields from the host. |
| `frames` | Exported frame index. Each frame record includes the frame number, filename, relative path, elapsed time, and host performance timestamp. |

## Sensor Samples And Frame Alignment

Each sensor sample is attached to the nearest exported frame through an
`associatedFrame` object. This makes post-processing easier because analysis
scripts do not need to infer which image should be compared with each telemetry
sample.

For example, a sensor sample contains:

```json
"associatedFrame": {
  "frameNumber": 1,
  "filename": "20260724-143958-Frame000001.jpg",
  "elapsedMs": 0,
  "deltaMs": 10.178
}
```

The important fields are:

| Field | Description |
| --- | --- |
| `frameNumber` | The exported frame closest in time to the sensor sample. |
| `filename` | The image file that should be paired with the sensor sample. |
| `elapsedMs` | The frame timestamp relative to the beginning of the run. |
| `deltaMs` | Time difference between the sensor sample and the associated frame. Smaller values indicate tighter alignment. |

This alignment lets a post-processing script load a sensor row, open the exact
corresponding frame, and compare flame appearance, sample position, oxygen
level, thermocouple readings, and environmental readings at the same point in
the test.

## Example Linked Frame And Samples

Frame 118 is a useful example because several firmware samples were associated
with the same exported image. The frame occurs at `23.400 s` from the start of
the run.

![Frame 118 from the Kitchen Towel example](<frames/20260724-143958-Frame000118 (1).jpg>)

The samples linked to this frame include these readings:

| Sensor | Reading | Sample time | Frame delta |
| --- | --- | ---: | ---: |
| `sht45` | 23.51263 C, 42.52941 %RH | 23.332 s | 67.822 ms |
| `tc1` | 23.86719 C, cold junction 26.03125 C | 23.384 s | 16.302 ms |
| `tc2` | 24.09375 C, cold junction 26.50000 C | 23.384 s | 16.028 ms |
| `tc3` | 23.99219 C, cold junction 26.14063 C | 23.384 s | 15.756 ms |
| `tc4` | 24.49219 C, cold junction 26.75000 C | 23.385 s | 15.486 ms |
| `sht45` | 23.49928 C, 42.50271 %RH | 23.443 s | 43.190 ms |
| `bme688` | 24.82505 C, 35.80073 %RH, 1019.08 hPa, 104.553 kOhm | 23.481 s | 80.708 ms |

The corresponding JSON samples look like this when reduced to the fields most
useful for post-processing:

```json
[
  {
    "kind": "environment",
    "sensor": "sht45",
    "elapsedMs": 23332.178,
    "temp_c": 23.51263,
    "rh_pct": 42.52941,
    "associatedFrame": {
      "frameNumber": 118,
      "filename": "20260724-143958-Frame000118.jpg",
      "elapsedMs": 23400,
      "deltaMs": 67.822
    }
  },
  {
    "kind": "thermocouple",
    "sensor": "tc1",
    "elapsedMs": 23383.698,
    "temp_c": 23.86719,
    "cold_junction_c": 26.03125,
    "associatedFrame": {
      "frameNumber": 118,
      "filename": "20260724-143958-Frame000118.jpg",
      "elapsedMs": 23400,
      "deltaMs": 16.302
    }
  },
  {
    "kind": "thermocouple",
    "sensor": "tc2",
    "elapsedMs": 23383.972,
    "temp_c": 24.09375,
    "cold_junction_c": 26.5,
    "associatedFrame": {
      "frameNumber": 118,
      "filename": "20260724-143958-Frame000118.jpg",
      "elapsedMs": 23400,
      "deltaMs": 16.028
    }
  },
  {
    "kind": "thermocouple",
    "sensor": "tc3",
    "elapsedMs": 23384.244,
    "temp_c": 23.99219,
    "cold_junction_c": 26.14063,
    "associatedFrame": {
      "frameNumber": 118,
      "filename": "20260724-143958-Frame000118.jpg",
      "elapsedMs": 23400,
      "deltaMs": 15.756
    }
  },
  {
    "kind": "thermocouple",
    "sensor": "tc4",
    "elapsedMs": 23384.514,
    "temp_c": 24.49219,
    "cold_junction_c": 26.75,
    "associatedFrame": {
      "frameNumber": 118,
      "filename": "20260724-143958-Frame000118.jpg",
      "elapsedMs": 23400,
      "deltaMs": 15.486
    }
  },
  {
    "kind": "environment",
    "sensor": "sht45",
    "elapsedMs": 23443.19,
    "temp_c": 23.49928,
    "rh_pct": 42.50271,
    "associatedFrame": {
      "frameNumber": 118,
      "filename": "20260724-143958-Frame000118.jpg",
      "elapsedMs": 23400,
      "deltaMs": 43.19
    }
  },
  {
    "kind": "environment",
    "sensor": "bme688",
    "elapsedMs": 23480.708,
    "temp_c": 24.82505,
    "rh_pct": 35.80073,
    "pressure_hpa": 1019.08,
    "gas_kohm": 104.553,
    "associatedFrame": {
      "frameNumber": 118,
      "filename": "20260724-143958-Frame000118.jpg",
      "elapsedMs": 23400,
      "deltaMs": 80.708
    }
  }
]
```

## Captured Sensor Data

The 525 telemetry samples in this example include:

| Sensor group | Sensor | Samples | Example fields |
| --- | --- | ---: | --- |
| Environment | `sht45` | 306 | temperature, relative humidity |
| Environment | `bme688` | 49 | temperature, relative humidity, pressure, gas resistance |
| Oxygen | `o2` | 34 | oxygen concentration/status fields |
| Thermocouple | `tc1` | 34 | temperature/status fields |
| Thermocouple | `tc2` | 34 | temperature/status fields |
| Thermocouple | `tc3` | 34 | temperature/status fields |
| Thermocouple | `tc4` | 34 | temperature/status fields |

## Vision Outputs

The vision metrics file contains 213 processed samples. In this run, 160 of
those samples reported active tracking. These records are useful for checking
whether the vision controller consistently detected the flame and what stage
motion it would recommend.

Key fields in each vision metric include:

| Field | Description |
| --- | --- |
| `elapsedMs` | Time since the start of the run. |
| `tracking` | Whether the flame tracker found a valid target in that processed frame. |
| `confidence` | Tracker confidence score. |
| `targetBottomXPx`, `targetBottomYPx` | Detected bottom point of the target flame region in image coordinates. |
| `targetAreaPx` | Area of the detected target region. |
| `setpointYPx`, `setpointYNorm` | Desired vertical image position for the tracked flame. |
| `errorYPx` | Difference between detected target position and vertical setpoint. |
| `recommendedVelocityMmS` | Vertical-stage velocity recommendation from the vision controller. |
| `processedFps` | Approximate processing rate for the vision pipeline. |
