<!--
Primary author: Will Andre Pasimio Llaneta (wpl5304)
GitHub: https://github.com/andre-llaneta
Project: IgNYte-FPA
Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.
-->

# Camera Software

Camera-related host software for the IgNYte-FPA system.

Current contents:

- `opencv-js-prototype/`: standalone browser prototype for tracking the bottom
  of an orange/yellow flame-like target with OpenCV.js. It can connect to the
  ESP32-P4 over browser Web Serial, send manual motor commands, send one-shot
  velocity recommendations, and toggle rate-limited auto control for bring-up.
