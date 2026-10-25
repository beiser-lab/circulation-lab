# Circulation Lab

Browser-based cardiovascular physiology teaching prototype for hemorrhage and cardiac tamponade. Open the published website; no installation or GitHub account is required.

## Status

Experimental teaching model recalibrated against classroom observations and instructor-defined physiological constraints. Supports volume interventions, independent Active/Clamped autonomic controls with relative-state gauges, LV systolic function and compliance controls, pressure traces, PV loops, illustrative Guyton curves, and CSV export. Not for patient care.

The LV active-pressure component uses the recovered SimBioSys quadratic law with an activation-dependent reference volume. Other physiology remains independently modeled. See [MODEL-ARCHITECTURE.md](MODEL-ARCHITECTURE.md) for the boundary for future organ components.

See [CALIBRATION.md](CALIBRATION.md) for equations, measurement conventions, fitting/validation scope, and remaining differences. Severe hemorrhage and severe LV dysfunction remain approximate. Guided clinical cases and exercise are subsequent work.

## What this model represents

An independent, simplified closed-loop teaching prototype; calibrated against selected SimBioSys classroom observations, with remaining differences. Sympathetic and parasympathetic feedback can be clamped independently. Parasympathetic feedback affects heart rate only in this simplified model; its gain is an approximation. No patient predictions. Severe volume loss can exceed its useful physiological range.

Waveforms and PV loops come from integrated model states. The aortic dicrotic notch uses a simplified damped recoil response triggered by valve closure; its shape is provisional. Dashed overlays on all three plots show a separately simulated healthy baseline; they do not change with the experiment.

The Guyton cardiac curve passes through the model’s measured right atrial pressure and cardiac output; its remaining shape is illustrative. At steady state the intersection agrees with output; during transients CO and venous return can differ. Filling pressures are intravascular; ventricular distending pressure also depends on external pericardial pressure.

Resting teaching baseline: CO approximately 5 L/min, HR 70/min, MAP 88 mmHg, and Pra 5.2 mmHg. See the calibration report for the limited parameter adjustment and its effects on intervention outputs.

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

Playback is 1:1. MAP is waveform-averaged. CO, SV, and HR use the same completed beat; venous return is measured independently. Pms and RVR derive from systemic compartment parameters and beat-averaged pressures. The Guyton cardiac curve passes through current measured Pra and CO; its remaining shape is illustrative. The marker shows measured mean Pra and CO, with axis guides. At steady state it also lies at the curve intersection; during transients it can be off the venous-return curve.

Pressure plots use −10–180 mmHg, LV volume 0–250 mL, and Guyton Pra -5–20 mmHg with flow 0–20 L/min. Curves outside these limits are clipped. Intracavitary LV pressure is shared by both plots; the optional transmural selector appears in pericardial experiments. PV references share the solver's pressure equations.

### Lab interventions

Hemorrhage defaults to 500 mL at 500 mL/min (one minute). Pericardial presets target 200 or 400 mL total, including the 1 mL baseline. Pericardial infusion uses an assumed 200 mL/min; custom volume means additional fluid. Large steps with active autonomics may require about two minutes to settle.

The pressure panel shows LA alongside aortic/LV pressure on one shared scale. The ten-second time axis remains fixed at 0, 5, and 10 seconds. LA pressure includes atrial contraction (a wave), a brief early-contraction c-wave approximation, and reservoir filling/emptying (v wave and y descent).

## Feedback and usage

The simulator links to public GitHub issue forms for [bug reports](https://github.com/beiser-lab/circulation-lab/issues/new?template=bug_report.yml) and [suggestions](https://github.com/beiser-lab/circulation-lab/issues/new?template=suggestion.yml). Submitting requires a GitHub account. Reports are reviewed before any changes are made.

To receive notifications, open the repository's **Watch → Custom → Issues** setting (or **All Activity**). Email delivery follows your GitHub notification settings.

[Insights → Traffic](https://github.com/beiser-lab/circulation-lab/graphs/traffic) shows repository visitors over the past 14 days for users with push access. These are **not visits to the published simulator**. No external analytics or simulator visitor counter is installed.

Guyton axes use Pra ticks -5, 0, 5, 10, 15, 20 mmHg and flow ticks 0, 5, 10, 15, 20 L/min. PV volume ticks are 0, 50, 100, 150, 200, 250 mL. The Guyton marker uses displayed mean Pra and CO, with dashed axis guides. It is not an equilibrium-intersection marker during transients.
