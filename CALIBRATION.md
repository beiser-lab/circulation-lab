# Initial classroom calibration — 24 October 2026

This release calibrates an independent eight-compartment educational circulation model against selected classroom simulator observations. It is not a reconstruction of the complete SimBioSys engine, a patient model, or a validated model of myocardial infarction.

## Equations and measurements

All blood flows follow pressure gradients through positive resistances. Valve flows are one-way. Interventions conserve circulating blood except for the prescribed intravascular addition/removal. Pericardial fluid is separate.

LV passive pressure uses alpha*(exp(beta*stiffness*(V-V0))-1), with a continuous tangent extension below V0. Active pressure uses functionalFraction*autonomicContractility*activation*u*(A1+A2*u), with a positive-slope-factor guard outside the calibrated volume range. These equation families are informed by legacy documentation/recovery; the activation waveform, low-volume continuation, parameters, and complete circuit remain independent approximations. The legacy activation-dependent unstressed-volume equation has not been fully implemented. Systolic plotting curves are maximum-activation envelopes, not independently identified experimental ESPVRs.

LV systolic function and diastolic stiffness have separate controls. The pericardium has an exponential constraint dependent on chamber and effusion volumes, with a -4 mmHg external-pressure reference. Baseline effusion is 1 mL. An internal pericardium-removal API is tested, but a guided pericardiectomy case is not yet exposed.

Sympathetic and parasympathetic branches can each be Active or Clamped at the current state. The sympathetic target combines arterial-pressure and atrial-distending-pressure deviations, affecting HR, contractility, unstressed venous volume, and resistance. Parasympathetic activity affects HR. Gains are fitted teaching parameters; signed internal drives are not clinical measurements or the original tone units. Approximate 20-second sympathetic and 2-second vagal lags are modeling choices, not recovered legacy time constants. Measured settling behavior is not itself a time constant.

MAP is the completed-beat time integral of aortic pressure. CO and HR use the same completed-beat duration; CO = SV*HR/1000. EDV and ESV describe that ejection rather than mixing in the next beat's filling volume. Systemic VR is measured independently, so it can differ transiently from LV output. Intracavitary pressure is the default; the transmural selector appears for pericardial interventions.

For the two systemic compliant reservoirs, Pms = (Ca*meanPa + Cv*meanPv)/(Ca+Cv) and RVR = [Rv + Rs*Ca/(Ca+Cv)]/0.06, converting mmHg*s/mL to mmHg*min/L. These are effective systemic-compartment quantities, not total-body equilibrium pressure. Beat averaging suppresses pulse oscillations. Positive resistances avoid reproducing legacy negative-RVR artifacts. Volume redistribution and autonomic recruitment can change Pms without an external volume intervention. The cardiac Guyton curve remains illustrative; its shape is normalized through the current completed-beat (Pra, CO) operating point, not a solved family of steady states. The plotted grid includes the exact measured Pra. The intersection agrees with measured CO/VR at steady state, while transient differences remain possible. HR, contractility and afterload affect the anchor through the circulation solver, not a separate estimate of output.

## Calibration scope

Baseline, clamped hemorrhage, LV function at 50%, and approximately 200/400 mL effusions informed mechanical fitting. Active hemorrhage and the 400 mL effusion informed autonomic fitting. Intermediate 1 L hemorrhage, approximately 300 mL effusion, and 25% LV function were initially withheld from parameter fitting, though reviewed during validation. The later optimization below used the active-autonomic 25% LV checkpoint. This is internal validation, not an independent clinical cohort. Source decks and extracted answer tables remain outside this public repository.

After the severe-hemorrhage optimization, baseline is approximately CO 5.43 L/min, HR 70/min, waveform MAP 90 mmHg, CVP 3.9 mmHg, LVEDP 6.7 mmHg, Pms 7.8 mmHg, and SV 78 mL. Validation compares averages beginning at 120 seconds after an intervention with later averages; this demonstrates convergence for those tested protocols, not a universal settling guarantee. Simulation playback is 1:1.

## Remaining limits

- At 2 L hemorrhage with active autonomics, CO remains somewhat high (2.41 versus 2.09 L/min); CVP and LVEDP are too negative. Tissue oxygen delivery, ischemic decompensation, and shock progression are not represented.
- Severe LV impairment produces too little filling-pressure elevation and does not reproduce the legacy preservation/overshoot of output under active autonomics. A functional fraction is not a percentage of infarcted myocardium.
- Early tamponade reduces output somewhat too early; its HR response is larger than some legacy observations. Pericardial dynamics and respiratory effects remain simplified.
- Pms and RVR are physically coherent effective circuit quantities; they are deliberately not fitted to contradictory legacy edge values.
- Exercise, RV injury, dehydration-specific fluid compartments, chronic remodeling, and complete infarct physiology are not implemented or validated.
- The dicrotic notch remains a reduced closure/recoil approximation, not a wave-propagation model. Pressure axes span -10 to 180 mmHg and volume extends to 250 mL. The shared pressure tracing uses a fixed ten-second time window.

Run `npm test` for conservation, numerical-step convergence, pressure/PV consistency, autonomic independence, loading-response direction, and broad calibration bounds. Passing these checks does not establish clinical validity.


## Atrial waveform and lusitropy update

LA pressure now uses a passive compliance of 8 mL/mmHg and an unstressed volume of 85 mL, plus a late-diastolic active elastance pulse of 0.035 mmHg/mL over phases 0.78–0.98. Active pressure is applied only to positive distending volume. This is an independent illustrative atrial-contraction mechanism, not a recovered or quantitatively fitted SimBioSys atrial waveform. The a wave is generated by atrial contraction; reservoir filling and mitral emptying generate v-wave/y-descent behavior. A pressure-gated c-wave surrogate represents brief mitral leaflet displacement during rising LV pressure between mitral closure and aortic opening. Its amplitude is capped at 2.5 mmHg and reduced for small LV–aortic pressure gradients. This is a provisional mechanical approximation, not an explicit valve-geometry model or a fitted legacy c wave. Respiratory variation is not represented. The new pressure participates in pulmonary venous and mitral flow, not just rendering.

LV relaxation speed changes the falling limb of activation while preserving its peak and passive pressure-volume relation. The multiplier is the manual relaxation setting times (1 + 0.5*sympatheticDrive). That sympathetic gain is provisional. Stiffness now offers 0.5× and 0.75× options as well as the previous higher settings. Relaxation and passive stiffness are distinct; lower stiffness means greater compliance.

Autonomic gauges display 1 + the internal signed branch deviation, with baseline 1.00. They are arbitrary relative model indices, not percentages of maximal neural activity or measured clinical quantities. Clamping holds the underlying branch state. The gauge values do not feed back into the solver.

Exercise remains a proposed extension, not an implemented intervention. A graded dynamic-exercise intensity should combine demand-related reductions in resistance, venous recruitment/muscle-pump effects, and autonomic drive affecting HR, contractility, and relaxation. Active/clamped branches must retain their meaning. Benchmark steady exercise and recovery before combining exercise with volume loss.

## Severe hemorrhage optimization

Sympathetic recruitment of unstressed venous volume now saturates at an effective 250 mL reserve. The low-tone recruitment gain, sympathetic chronotropic and resistance gains, systemic unstressed volume, and RV active/passive pressure-volume parameters were recalibrated together. RV active pressure uses max(0, RV volume - 25 mL); this reference volume is separate from the passive relation. These are phenomenological circuit parameters, not measured human reserves or recovered SimBioSys constants. The saturation does not depend on a named scenario or force a target cardiac output; all output still follows the circulation solver.

The 2 L active-hemorrhage reference now gives CO 2.41 L/min, HR 186/min, MAP 48 mmHg, and SV 13 mL, versus legacy readouts 2.09, 187, 47, and 11. CVP is -3.63 versus -1.8 mmHg and LVEDP -4.41 versus -3 mmHg. Baseline and all 30 screenshot checkpoints were reevaluated. Descriptive mean absolute differences changed: CO 0.31 to 0.25 L/min, HR 8.53 to 7.62/min, MAP 4.44 to 3.84 mmHg, CVP 0.70 to 0.67 mmHg, LVEDP 1.71 to 1.74 mmHg, and Pms 1.54 to 1.71 mmHg. Not every measure improves. At 1.5 L active hemorrhage, MAP moves from 82 to 77 versus a reference of 82 mmHg.

This optimization explicitly used the severe hemorrhage and 25% LV active-autonomic observations; the latter is no longer a withheld fitting checkpoint. All reviewed data are internal calibration evidence, not a blinded validation set. Fitting used shorter delivery protocols followed by settling; final evaluation used the lab-rate protocols. Transient trajectories remain unvalidated. No ischemic injury or additional collapse mechanism was introduced.

## Display and next calibration target

Pulse pressure is displayed in Vital Signs by default and included in CSV exports. It equals the completed-beat SBP minus DBP, in mmHg. The accepted next calibration target is HR above 100/min at 1 L hemorrhage with intact autonomics (approximately 100–120/min); this takes priority over the older table HR of 90. It has not yet been implemented in the current circulation calibration.

## Ventricular property controls

The systolic-function selector includes 125% to explore increased active pressure generation. The UI exposes relative diastolic compliance from 1/3× to 2× baseline, mapped to stiffness = 1/compliance. The underlying exponential passive equation is unchanged; these are relative parameter settings, not fixed dV/dP multipliers at every volume. Active relaxation remains a separate control. These settings are exploratory and have not been fitted to exercise or chronic-hypertension cases.

Mean Pra is shown by default in Cardiac Measures and exported as `pra`. It is an alias of the same completed-beat mean right atrial pressure reported as CVP, not the instantaneous RA waveform.
