# Initial classroom calibration — 24 October 2026

This release calibrates an independent eight-compartment educational circulation model against selected classroom simulator observations. It is not a reconstruction of the complete SimBioSys engine, a patient model, or a validated model of myocardial infarction.

## Equations and measurements

All blood flows follow pressure gradients through positive resistances. Valve flows are one-way. Interventions conserve circulating blood except for the prescribed intravascular addition/removal. Pericardial fluid is separate.

LV passive pressure uses alpha*(exp(beta*stiffness*(V-V0))-1), with a continuous tangent extension below V0. Active pressure uses functionalFraction*autonomicContractility*activation*u*(A1+A2*u), with a positive-slope-factor guard outside the calibrated volume range. These equation families are informed by legacy documentation/recovery; the activation waveform, low-volume continuation, parameters, and complete circuit remain independent approximations. The legacy activation-dependent unstressed-volume equation has not been fully implemented. Systolic plotting curves are maximum-activation envelopes, not independently identified experimental ESPVRs.

LV systolic function and diastolic stiffness have separate controls. The pericardium has an exponential constraint dependent on chamber and effusion volumes, with a -4 mmHg external-pressure reference. Baseline effusion is 1 mL. An internal pericardium-removal API is tested, but a guided pericardiectomy case is not yet exposed.

Sympathetic and parasympathetic branches can each be Active or Clamped at the current state. The sympathetic target combines arterial-pressure and atrial-distending-pressure deviations, affecting HR, contractility, unstressed venous volume, and resistance. Parasympathetic activity affects HR. Gains are fitted teaching parameters; signed internal drives are not clinical measurements or the original tone units. Approximate 20-second sympathetic and 2-second vagal lags are modeling choices, not recovered legacy time constants. Measured settling behavior is not itself a time constant.

MAP is the completed-beat time integral of aortic pressure. CO and HR use the same completed-beat duration; CO = SV*HR/1000. EDV and ESV describe that ejection rather than mixing in the next beat's filling volume. Systemic VR is measured independently, so it can differ transiently from LV output. Intracavitary pressure is the default; the transmural selector appears for pericardial interventions.

For the two systemic compliant reservoirs, Pms = (Ca*meanPa + Cv*meanPv)/(Ca+Cv) and RVR = [Rv + Rs*Ca/(Ca+Cv)]/0.06, converting mmHg*s/mL to mmHg*min/L. These are effective systemic-compartment quantities, not total-body equilibrium pressure. Beat averaging suppresses pulse oscillations. Positive resistances avoid reproducing legacy negative-RVR artifacts. Volume redistribution and autonomic recruitment can change Pms without an external volume intervention. The cardiac Guyton curve remains illustrative; its shape is parameter-based and baseline-anchored, not a solved family of steady states. Its intersection is labeled accordingly.

## Calibration scope

Baseline, clamped hemorrhage, LV function at 50%, and approximately 200/400 mL effusions informed mechanical fitting. Active hemorrhage and the 400 mL effusion informed autonomic fitting. Intermediate 1 L hemorrhage, approximately 300 mL effusion, and 25% LV function were withheld from parameter fitting, though reviewed during validation. This is internal validation, not an independent clinical cohort. Source decks and extracted answer tables remain outside this public repository.

After the atrial/relaxation update, baseline is approximately CO 5.32 L/min, HR 70/min, waveform MAP 89 mmHg, CVP 3.9 mmHg, LVEDP 6.1 mmHg, Pms 7.7 mmHg, and SV 76 mL. Validation compares averages beginning at 120 seconds after an intervention with later averages; this demonstrates convergence for those tested protocols, not a universal settling guarantee. Simulation playback is 1:1.

## Remaining limits

- Severe hemorrhage (especially 2 L with active autonomics) retains too much output compared with the legacy observations. Shock/decompensation mechanisms have not been calibrated.
- Severe LV impairment produces too little filling-pressure elevation and does not reproduce the legacy preservation/overshoot of output under active autonomics. A functional fraction is not a percentage of infarcted myocardium.
- Early tamponade reduces output somewhat too early; its HR response is larger than some legacy observations. Pericardial dynamics and respiratory effects remain simplified.
- Pms and RVR are physically coherent effective circuit quantities; they are deliberately not fitted to contradictory legacy edge values.
- Exercise, RV injury, dehydration-specific fluid compartments, chronic remodeling, and complete infarct physiology are not implemented or validated.
- The dicrotic notch remains a reduced closure/recoil approximation, not a wave-propagation model. Pressure axes span -10 to 180 mmHg and volume extends to 250 mL. A separate -10 to 30 mmHg filling-pressure view shares the ten-second time window.

Run `npm test` for conservation, numerical-step convergence, pressure/PV consistency, autonomic independence, loading-response direction, and broad calibration bounds. Passing these checks does not establish clinical validity.


## Atrial waveform and lusitropy update

LA pressure now uses a passive compliance of 8 mL/mmHg and an unstressed volume of 85 mL, plus a late-diastolic active elastance pulse of 0.035 mmHg/mL over phases 0.78–0.98. Active pressure is applied only to positive distending volume. This is an independent illustrative atrial-contraction mechanism, not a recovered or quantitatively fitted SimBioSys atrial waveform. The a wave is generated by atrial contraction; reservoir filling and mitral emptying generate v-wave/y-descent behavior. Detailed c waves and respiratory variation are not represented. The new pressure participates in pulmonary venous and mitral flow, not just rendering.

LV relaxation speed changes the falling limb of activation while preserving its peak and passive pressure-volume relation. The multiplier is the manual relaxation setting times (1 + 0.5*sympatheticDrive). That sympathetic gain is provisional. Stiffness now offers 0.5× and 0.75× options as well as the previous higher settings. Relaxation and passive stiffness are distinct; lower stiffness means greater compliance.

Autonomic gauges display 1 + the internal signed branch deviation, with baseline 1.00. They are arbitrary relative model indices, not percentages of maximal neural activity or measured clinical quantities. Clamping holds the underlying branch state. The gauge values do not feed back into the solver.

Exercise remains a proposed extension, not an implemented intervention. A graded dynamic-exercise intensity should combine demand-related reductions in resistance, venous recruitment/muscle-pump effects, and autonomic drive affecting HR, contractility, and relaxation. Active/clamped branches must retain their meaning. Benchmark steady exercise and recovery before combining exercise with volume loss.
