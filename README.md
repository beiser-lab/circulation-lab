# Circulation Lab

Browser-based cardiovascular physiology teaching prototype for hemorrhage and cardiac tamponade. Open the published website; no installation or GitHub account is required.

## Status

Experimental teaching model with an initial calibration against selected classroom observations. Supports volume interventions, independent Active/Clamped autonomic controls with relative-state gauges, LV systolic function, stiffness, and relaxation controls, pressure traces, PV loops, illustrative Guyton curves, and CSV export. Not for patient care.

See [CALIBRATION.md](CALIBRATION.md) for equations, measurement conventions, fitting/validation scope, and remaining differences. Severe hemorrhage and severe LV dysfunction remain approximate. Guided clinical cases and exercise are subsequent work.

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

### Display conventions

Playback is 1:1. MAP is waveform-averaged. CO, SV, and HR use the same completed beat; venous return is measured independently. Pms and RVR derive from systemic compartment parameters and beat-averaged pressures. The Guyton cardiac curve remains illustrative; the marker is its intersection with the vascular curve.

Pressure plots use −10–180 mmHg, LV volume 0–250 mL, and Guyton Pra -5–20 mmHg with flow 0–20 L/min. Curves outside these limits are clipped. Intracavitary LV pressure is shared by both plots; the optional transmural selector appears in pericardial experiments. PV references share the solver's pressure equations.

### Lab interventions

Hemorrhage defaults to 500 mL at 500 mL/min (one minute). Pericardial presets target 200 or 400 mL total, including the 1 mL baseline. Pericardial infusion uses an assumed 200 mL/min; custom volume means additional fluid. Large steps with active autonomics may require about two minutes to settle.

The pressure panel shows LA alongside aortic/LV pressure on one shared scale. The ten-second time axis remains fixed at 0, 5, and 10 seconds. LA pressure includes atrial contraction (a wave), a brief early-contraction c-wave approximation, and reservoir filling/emptying (v wave and y descent).

## Feedback and usage

The simulator links to public GitHub issue forms for [bug reports](https://github.com/beiser-lab/circulation-lab/issues/new?template=bug_report.yml) and [suggestions](https://github.com/beiser-lab/circulation-lab/issues/new?template=suggestion.yml). Submitting requires a GitHub account. Reports are reviewed before any changes are made.

To receive notifications, open the repository's **Watch → Custom → Issues** setting (or **All Activity**). Email delivery follows your GitHub notification settings.

[Insights → Traffic](https://github.com/beiser-lab/circulation-lab/graphs/traffic) shows repository visitors over the past 14 days for users with push access. These are **not visits to the published simulator**. No external analytics or simulator visitor counter is installed.
