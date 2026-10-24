# Circulation Lab

Browser-based cardiovascular physiology teaching prototype for hemorrhage and cardiac tamponade. Open the published website; no installation or GitHub account is required.

## Status

Experimental and quantitatively uncalibrated. This independent implementation is not a validated replacement for SimBioSys and is not for patient care. The current version supports volume interventions, independent sympathetic/vagal freezing, live pressure traces, PV loops, illustrative Guyton curves, and CSV export.

Current plots include intrinsic diastolic and maximum-activation systolic PV reference curves and a provisional dicrotic notch. Recovery of original SimBioSys equations, further numerical-display consistency, and quantitative calibration remain outstanding.

## Development

Requires Node.js for tests and Python 3 for the local server.

```sh
npm test
npm start
```

Open http://localhost:4173. Application files are in `dist/`. GitHub Pages serves the `gh-pages` branch, containing only these static files.

Publish updates after tests pass:

```sh
git push origin main
git subtree push --prefix dist origin gh-pages
```

## Design

Phoenix Maroon (#800000), white, and greys follow the UChicago primary color palette referenced by Pritzker's identity guidance. Graph traces use additional contrasting colors. No university logo assets are included.

- https://creative.uchicago.edu/color-system/
- https://pritzker.uchicago.edu/resources/pritzker-identity-guidelines

## Source scope

This repository contains only the independent web application and its tests. Original SimBioSys binaries, reverse-engineering artifacts, lab answer keys, and private teaching files are excluded. No reuse license has yet been selected.

### Guyton teaching convention

RVR is fixed at 1 mmHg·min/L for the available non-exercise scenarios. Pms starts at 7 mmHg and changes with total circulating blood volume using a provisional effective reservoir compliance of 250 mL/mmHg, bounded at zero. This course-level curve approximation is separate from the pulsatile compartment solver; its slope is not inferred from instantaneous arterial resistance. Pericardial infusion alone does not shift the vascular curve. The cardiac approximation includes HR, contractility, afterload, and beat-averaged pericardial pressure. The dot is the intersection of the plotted curves (predicted equilibrium), not transient measured CO/CVP. Neither curve has yet been calibrated to the original model. Fixed plot limits: pressure 0–180 mmHg, LV volume 0–250 mL, Guyton flow 0–20 L/min and Pra −5–25 mmHg; out-of-range traces are clipped.

### Dicrotic notch

Aortic valve closure is detected from the LV–aortic pressure gradient after ejection. It triggers a 140 ms damped dip/rebound in arterial pressure, scaled by ejected volume and bounded in amplitude. This pressure participates in arterial flow calculations, beat pressure measurements, and the displayed waveform; it is not a canvas-only decoration. The valve remains closed until the next cycle, preventing recoil-induced reopening. This is a provisional reduced closure/recoil approximation, not a recovered SimBioSys equation, fluid-inertance solver, or calibrated wave-reflection model. Tests verify a post-closure pressure minimum and rebound during isovolumic relaxation, mass conservation, decay, and existing timestep convergence checks.

The PV plot uses transmural LV pressure (intracavitary LV minus pericardial pressure). Its diastolic and systolic reference curves share the solver pressure equation; the systolic curve is a maximum-activation envelope, an ESPVR approximation. Sympathetic tone changes active elastance. Loading alone does not move the intrinsic curves. Injury is not yet an implemented intervention.
