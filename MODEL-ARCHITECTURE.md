# Model extension boundary

The current app uses one closed circulation solver, with state in mL, pressures in mmHg, flows in mL/s internally, and time in seconds. Displayed CO/VR are L/min. It remains an eight-blood-compartment reduced model, not the original SimBioSys topology.

`dist/cardiac-mechanics.js` contains the recovered active chamber equation as a pure function. It accepts volume, activation and coefficients; it does not own the clock, reflexes, intervention names or fluid transfers. `model.js` supplies the calibrated LV parameters and combines active, passive and external pressures. The same active function supplies the LV solver and systolic plotting curve. This boundary allows another chamber to adopt the law with its own evidence-supported parameters, without duplicating it.

Future extensions should follow these contracts:

- **Pulmonary circulation/gas exchange:** extend the existing pulmonary artery/vein compartments with explicitly connected blood, gas and oxygen-content states. Flow connections must conserve blood; oxygen transport requires its own mass balance. Pulmonary resistance/compliance must not be inferred from a fixed cardiac-output multiplier.
- **Renal regulation:** represent filtration, excretion, fluid/electrolyte and hormonal states with explicit balances. Any net circulating-fluid change must enter the volume ledger. Renal dynamics may use slower update intervals, but must share simulation time and remain stable when coupled to fast cardiovascular integration. Renal output is not a hidden adjustment to blood pressure or Pms.
- **Autonomic and hormonal inputs:** feed documented chamber/vascular parameters through explicit couplings. Clamping must freeze the relevant response states. Preserve independent manual injury/function and passive-compliance controls.
- **Evidence:** distinguish recovered equations, documented examples, observed runtime configurations and newly fitted parameters. Never assume a help example is a reset default or that adopting one equation reproduces the complete legacy system.
- **Acceptance:** verify units, conservation, timestep convergence, shared numerical/graph outputs, isolated subsystem behavior and combined interventions before deployment. Preserve regression comparisons against previous supported experiments.

Pulmonary gas exchange, renal physiology and the full legacy integrator/filtering/activation dynamics are not implemented by this release. The next useful recovery targets are activation timing, pressure/filter assembly and chamber-specific parameters before extending organ-level physiology.
