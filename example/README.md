# Example Test Runs

This folder contains exported example runs from the igNYte LOI apparatus. These
examples are intended to show the shape of the data produced by the full system:
camera recordings, extracted frames, firmware sensor telemetry, synchronized
frame references, and vision-processing outputs.

Each example run should live in its own timestamped folder. A run folder usually
contains:

| Output | Purpose |
| --- | --- |
| README | Summary of the test, sample, duration, and outputs. |
| Main run JSON | Machine-readable test metadata, sensor samples, exported frame list, and frame associations. |
| RGB video | Visible-light camera recording from the test. |
| HSI/source video | Source video stream used for extracted frames and image-processing review. |
| `frames/` | Exported still frames for frame-by-frame analysis and post-processing. |
| `vision/` | Vision overlay video and flame-tracking metrics. |

## Included Runs

| Run | Sample | Duration | Contents |
| --- | --- | ---: | --- |
| [`20260724-143958-LOI-1`](20260724-143958-LOI-1/) | Kitchen Towel | 34.3 s | Sensor telemetry, RGB/HSI videos, 172 exported frames, and 213 vision metric samples. |
