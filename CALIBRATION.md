# Classroom calibration — 25 October 2026

Circulation Lab is an independent eight-compartment educational model. The calibration balances classroom experiments, an older teaching table, and instructor-approved physiological constraints. It is not the complete SimBioSys engine or a validated patient model.

## Current calibration

Resting values are approximately CO 5.48 L/min, HR 70/min, MAP 88 mmHg, mean Pra/CVP 4.93 mmHg, Pms 7.33 mmHg, LVEDP 6.28 mmHg, EDV 114.0 mL, and ESV 35.7 mL. Minimum resting intracavitary LV pressure is near zero (approximately +0.004 mmHg at the default integration step). This is a solver result, not a graphical zero clamp. Subatmospheric pressures remain possible during volume depletion and altered ventricular properties.

The recalibration changes passive LV mechanics, RV active elastance, systemic volume/compliance/resistance parameters, and autonomic gains. It preserves pressure-driven flow, volume conservation, shared waveform/PV pressures, and same-beat CO = SV × HR / 1000. MAP remains the time average of the arterial waveform. Systemic venous return is measured independently and may differ from LV output during transients.

At the current 500 mL/min hemorrhage rate, settled 1 L loss produces approximately HR 102/min, CO 5.70 L/min, and MAP 87 mmHg. Settled 2 L loss produces approximately HR 175/min, CO 2.52 L/min, and MAP 49 mmHg. The instructor's HR above 100/min at 1 L takes priority over the lower legacy HR. Moderate loss can produce a small CO overshoot; pulse pressure narrows. The model does not represent irreversible tissue injury.

## Ventricular pressure equations

The passive LV law is now a generalized exponential:

```
z = beta × stiffness × (V − Vref)
Ppassive = P0 + alpha × expm1(z)              when z > 0
Ppassive = P0 + alpha × z                    otherwise
Pintracavitary = Pexternal + Ppassive + Pactive
```

Default P0 = 3.7504 mmHg, alpha = 1.588 mmHg, beta = 0.021864/mL, and Vref = 40 mL. The exponent is bounded outside the supported range for numerical protection. Vref is a fixed fitting reference, not an anatomical unstressed volume or the zero-pressure volume; the internal configuration name `lvUnstressed` is retained for compatibility. P0 is an independently fitted constitutive pressure intercept, not a recovered SimBioSys constant, a claim about measured myocardial prestress, or a display-only correction. It is added once in the passive law and affects flow, filling, and reference curves. Keeping the steeper exponential response was necessary to avoid flattening the high-volume LV dysfunction response while correcting resting low-volume pressure.

The active LV law now uses the recovered SimBioSys formula, implemented as a reusable pure function in `dist/cardiac-mechanics.js`:

```
Vd(F) = Vdmax + (Vdmin − Vdmax) × F
u = V − Vd(F)
Pactive = F × (A1 + A2 × u) × u
A1 = functionalFraction × autonomicContractility × baselineA1
A2 = functionalFraction × autonomicContractility × baselineA2
```

Vdmax = 10 mL and Vdmin = 5 mL follow the supplied help examples, not verified shipped reset defaults. The fitted coefficients remain baselineA1 = 4.0293 mmHg/mL and baselineA2 = −0.013 mmHg/mL². Function/contractility scale both coefficients, without changing the activation input or Vd at a given activation. The prior positive-factor guard and clamped active-volume difference are removed from this law. Its extrapolation is not asserted to be physiological outside the supported operating range.

The solver adds passive and active pressure, then external pressure once. Following the recovered plotting convention, the **systolic reference shows active pressure at peak activation plus external pressure**, not the sum of active and passive pressure. The diastolic reference separately shows passive plus external pressure. At fixed tone, 50% function halves the active reference and its local slope exactly; the external pressure offset is not halved. Changing compliance does not directly change the active reference. Baseline overlay now includes both reference curves, using their own baseline external pressure.

At a selected fixed activation, this is the quadratic form `a × (V−Vd)² + b × (V−Vd)`, with a = F×A2 and b = F×A1. Its local active-pressure slope is `2a×(V−Vd)+b`. The displayed reference uses F=1. The complete legacy activation waveform and its Peak Elastance input have not been recovered; our existing waveform, autonomic coupling and calibrated passive law remain independent approximations. This is not a claim that the reference is a measured family of end-systolic operating points, or that the entire original engine has been reconstructed. RV/atrial active mechanics have not been migrated in this change.

Relative compliance is reciprocal to the passive stiffness parameter. It is not a fixed dV/dP multiplier at every volume. Active relaxation remains separate and speeds with cardiac sympathetic drive. Intracavitary reference curves add the same mean external-pressure reference used for the displayed pressure convention; the optional transmural view removes it.

## Autonomic responses

Each branch can be Active or Clamped. Clamping sympathetic control freezes both cardiac and vascular response states at their current values; it does not reset them to zero. Parasympathetic control remains independent.

Cardiac sympathetic stimulation uses arterial pressure error plus a bounded atrial-distending-pressure contribution. The latter saturates at an error magnitude of 4.5 mmHg. The vascular resistance response has a separate state driven by arterial pressure error. Both use the existing 20-second response lag. This regional-response approximation prevents the additional filling-pressure signal from automatically raising resistance enough to reverse the expected MAP response to tamponade. It is a fitted reduced-model design, not a recovered legacy autonomic equation. Parasympathetic chronotropy uses a separate two-second lag. Neither lag is equated to an observed settling time.

The displayed sympathetic index represents cardiac drive; CSV exports also include `vascularTone`. All indices are relative model states, not clinical measurements or percentages of neural activity. Venous recruitment still uses a finite **228.8 mL effective circuit reserve**. This is not the instructor's approximately 1 L anatomical recruitable-volume concept, which remains a structural-model limitation requiring a richer venous reservoir model. Outside exercise, effective RVR changes remain modest (about 21% in the 2 L active hemorrhage check).

## Pericardial and atrial mechanics

The current pericardial model remains an instantaneous exponential constraint on chamber plus effusion volume with a −4 mmHg external reference. Baseline effusion is 1 mL. Capacity is an effective fitted offset; it is not numerically equivalent to the legacy capacity parameter. The pericardium-removal API is tested, but a guided pericardiectomy case is not exposed.

Further binary analysis recovered a legacy pericardial plotting law `100 × expm1(kV) / expm1(kC)` and documented separate filtering of extracardiac pressure. These were **not substituted**: the full pressure update, filter recurrence, cardiac tissue-volume contribution, and reset provenance are not sufficiently recovered for an equivalent implementation. Decompiled evidence is not original source code.

LA pressure still includes passive compliance, late-diastolic contraction, a brief pressure-gated c-wave approximation, and reservoir filling/emptying. The a/c/v features participate in the solver rather than being painted onto the waveform. Respiratory variation, valve geometry and wave propagation are not modeled. The dicrotic notch remains a reduced closure/recoil response.

## Comparison scope and tradeoffs

Selected PowerPoint hemorrhage, tamponade and LV-function checkpoints informed fitting. The final fit also used the active rows of the 2017 table as lower-weight targets. Baseline Pra near 5 mmHg, nonnegative resting LV pressure, same-beat identities, narrowing pulse pressure, and HR above 100/min after 1 L hemorrhage were explicit teaching priorities. Inconsistent rounded legacy values were not forced to satisfy mutually incompatible targets; flagged severe-hemorrhage EDV/ESV values were excluded from that fitting residual.

All 30 extracted PowerPoint intervention checkpoints and all 11 older-table rows were then compared. These are internally reviewed calibration data, **not blinded validation**. The 1 L hemorrhage and severe LV-function observations are no longer described as withheld. Source documents, screenshots, extracted reference values, fitting scripts and full residual tables remain outside this public repository.

Fitting uses the current 500 mL/min hemorrhage default and settled outputs. The full PowerPoint comparison uses 166.7 mL/min from the older lab protocol; actual PowerPoint delivery rates are unknown. Pericardial delivery is assumed 200 mL/min. Final values average ten seconds after at least two minutes of settling, with a second window after another minute. CO, HR, MAP, Pra and LVEDP convergence are checked. These results do not validate exact transient trajectories. Older no-sympathetic rows are additionally compared with both branches clamped because their HR is constant; their true vagal setting is undocumented.

Across the 30 PowerPoint states, descriptive mean absolute differences from the pre-recalibration build to the current build (including the recovered active law) changed as follows:

| Measure | Previous | Recalibrated |
|---|---:|---:|
| CO (L/min) | 0.251 | 0.267 |
| HR (/min) | 7.62 | 7.50 |
| MAP (mmHg) | 3.84 | 3.56 |
| Pra/CVP (mmHg) | 0.67 | 0.55 |
| LVEDP (mmHg) | 1.74 | 2.28 |
| Pms (mmHg) | 1.71 | 1.30 |
| EDV (mL) | 5.22 | 4.30 |
| ESV (mL) | 2.92 | 5.07 |

Important remaining differences:

- Moderate hemorrhage is somewhat overcompensated in CO; severe pulse-pressure narrowing can be greater than the older table.
- At about 400 mL effusion, CO and HR remain too high relative to the screenshots, and the fall in MAP is too small. The direction of CO/MAP decline and Pra rise is preserved.
- The moving active reference volume lowers baseline ESV by about 4.5 mL compared with the preceding calibration; average ESV error increases. Coefficients were retained rather than refitted to conceal this change.
- Severe LV dysfunction raises filling pressure and chamber volumes, but the active-autonomic legacy LVEDP and MAP are not fully reproduced.
- Correcting resting pressure worsens LVEDP residuals in some depleted-volume states. Negative pressure during marked depletion is not hidden.
- Exercise, RV injury, dehydration-specific fluid redistribution, chronic remodeling and ischemic tissue injury remain unimplemented or unvalidated.

## Graphs and verification

Pms and RVR derive from beat-averaged systemic compartment pressures and positive resistances: Pms = (Ca × meanPa + Cv × meanPv)/(Ca + Cv), RVR = [Rv + Rs × Ca/(Ca + Cv)]/0.06. They are effective circuit quantities, not forced matches to contradictory legacy readings. Mean Pra and CVP are identical aliases. The Guyton cardiac curve passes through measured Pra/CO; its off-operating-point shape remains illustrative. The marker matches both curves at steady state; transient CO/VR differences are retained.

Axes remain fixed: pressure −10 to 180 mmHg, PV volume 0 to 250 mL with 50 mL ticks, Guyton Pra −5 to 20 mmHg with 5 mmHg ticks, and flow 0 to 20 L/min. The time tracing spans ten seconds.

`npm test` runs 39 checks covering conservation, numerical convergence, baseline pressure, hemorrhage and replacement, tamponade and drainage, LV function/compliance, independent clamping, same-beat identities, waveform MAP, notch and atrial features, and Guyton consistency. Near-zero pressure convergence uses a 0.01 mmHg absolute tolerance in addition to the relative criterion. Passing these checks establishes software/model consistency, not clinical validity.
