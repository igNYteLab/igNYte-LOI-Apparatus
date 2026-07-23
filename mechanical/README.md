# Mechanical

This folder is reserved for mechanical documentation and design artifacts for
the IgNYte LOI apparatus.

This folder shoudl contain information that describes the physical test bench 
such as:

- chamber, frame, and sample-holder drawings
- camera-stage and motor-mount CAD files
- lead screw, rail, bearing, and bracket specifications
- assembly instructions and exploded views
- mechanical bill of materials
- measured travel limits, clearances, and alignment notes
- payload limits for RGB, IR, or hyperspectral cameras
- cable routing, strain relief, and service-access notes
- photos of the completed apparatus and subassemblies
- fabrication notes for machined, printed, laser-cut, or purchased parts

## Suggested Layout

```text
mechanical/
  README.md
  cad/          Native CAD files and exported STEP/STL/DXF files
  drawings/     Dimensioned drawings, PDFs, and assembly diagrams
  bom/          Mechanical bill of materials and vendor references
  photos/       Build photos, alignment references, and installed views
  notes/        Assembly, calibration, and maintenance notes
```

Only create folders when there is content to put in them. Keep large generated
exports organized by part or assembly so future maintainers can find the source
CAD file that produced each manufacturing file.

## Handoff Notes

Mechanical changes can affect firmware and web app behavior. Update the
relevant docs when the physical apparatus changes:

- update `embedded/docs/final-validation.md` after travel, speed, or tracking
  validation on the assembled apparatus
- update `embedded/docs/futurework.md` when a mechanical limitation becomes an
  explicit next-step item
- update firmware constants if lead screw pitch, travel range, motor step angle,
  microstepping, or stage direction changes
- retune camera tracking and motor-control settings after changing camera
  payload, lens position, chamber geometry, lighting, or cable routing
