import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysiologyModel } from '../dist/model.js';

// Behavioral checks for the independent teaching model, not evidence of
// numerical equivalence to SimBioSys or validation for clinical decisions.
const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`);

function settled({ reflex = false } = {}) {
  const model = new PhysiologyModel();
  model.advance(30);
  model.setReflex(reflex);
  return model;
}

function average(model, seconds = 10) {
  const fields = ['co', 'cvp', 'pms', 'map', 'hr', 'lvedp', 'pericardialPressure'];
  const totals = Object.fromEntries(fields.map(key => [key, 0]));
  const count = Math.round(seconds * 10);
  for (let i = 0; i < count; i++) {
    model.advance(0.1);
    const snapshot = model.snapshot();
    for (const field of fields) totals[field] += snapshot[field] / count;
  }
  return totals;
}

function checkFinite(snapshot) {
  for (const field of ['time', 'hr', 'sbp', 'dbp', 'map', 'co', 'cvp', 'lvedp',
    'pms', 'rvr', 'contractility', 'lvVolume', 'lvPressure',
    'arterialPressure', 'raPressure', 'pericardialPressure', 'bloodVolume',
    'effusionVolume', 'removedBlood']) {
    assert.ok(Number.isFinite(snapshot[field]), `${field} must remain finite`);
  }
  assert.ok(snapshot.bloodVolume >= 0, 'total blood volume must not be negative');
  assert.ok(snapshot.effusionVolume >= 0, 'effusion must not be negative');
  assert.ok(snapshot.lvVolume >= 0, 'LV volume must not be negative');
  assert.ok(Number.isFinite(snapshot.svr) || (snapshot.svr === null && snapshot.co <= 0.05),
    'SVR must be finite or explicitly unavailable at near-zero flow');
  assert.equal(snapshot.compartmentVolumes.length, 8);
  for (const volume of snapshot.compartmentVolumes) {
    assert.ok(Number.isFinite(volume) && volume >= 0, 'every compartment volume must remain finite and nonnegative');
  }
  close(snapshot.compartmentVolumes.reduce((sum, volume) => sum + volume, 0),
    snapshot.bloodVolume, 0.00001, 'compartment volume sum');
}

test('reset preserves complete-beat metrics without spurious zero-output startup values', () => {
  const model = new PhysiologyModel();
  for (const resetAgain of [false, true]) {
    if (resetAgain) model.reset();
    const baseline = model.snapshot();
    assert.equal(baseline.time, 0);
    assert.ok(baseline.co > 0, 'warmed baseline must have positive output');
    for (let i = 0; i < 200; i++) {
      model.advance(0.01);
      const snapshot = model.snapshot();
      checkFinite(snapshot);
      close(snapshot.co, baseline.co, baseline.co * 0.1, 'startup CO');
      close(snapshot.map, baseline.map, baseline.map * 0.1, 'startup MAP');
      assert.ok(snapshot.sbp - snapshot.dbp > (baseline.sbp - baseline.dbp) * 0.8,
        'startup beat must retain baseline pulse pressure');
    }
  }
});

test('closed circulation conserves blood volume during an unperturbed run', () => {
  const model = settled();
  const initial = model.snapshot().bloodVolume;
  model.advance(120);
  checkFinite(model.snapshot());
  close(model.snapshot().bloodVolume, initial, 0.01, 'blood volume');
});

test('withdrawal delivers the requested rate, stops at target, and conserves mass', () => {
  const model = settled();
  const initial = model.snapshot();
  model.startIntervention({ type: 'hemorrhage', volumeMl: 100, rateMlMin: 120 });
  model.advance(10);
  close(initial.bloodVolume - model.snapshot().bloodVolume, 20, 0.05, '10-second withdrawal');
  model.advance(60);
  close(initial.bloodVolume - model.snapshot().bloodVolume, 100, 0.05, 'completed withdrawal');
  close(model.snapshot().removedBlood - initial.removedBlood, 100, 0.05, 'withdrawal accounting');
  model.advance(10);
  close(initial.bloodVolume - model.snapshot().bloodVolume, 100, 0.05, 'no extra withdrawal');
});

test('blood infusion adds delivered volume to circulation', () => {
  const model = settled();
  const initial = model.snapshot().bloodVolume;
  model.startIntervention({ type: 'bloodInfusion', volumeMl: 100, rateMlMin: 120 });
  model.advance(10);
  close(model.snapshot().bloodVolume - initial, 20, 0.05, '10-second infusion');
  model.advance(60);
  close(model.snapshot().bloodVolume - initial, 100, 0.05, 'completed infusion');
});

test('freezing both autonomic limbs holds heart rate through blood withdrawal', () => {
  const model = settled();
  model.setVagalFeedback(false);
  const baseline = average(model);
  const baselineTone = model.snapshot().tone;
  model.startIntervention({ type: 'hemorrhage', volumeMl: 1000, rateMlMin: 1000 });
  model.advance(90);
  const after = average(model);
  assert.equal(model.snapshot().reflexEnabled, false);
  assert.equal(model.snapshot().tone, baselineTone, 'autonomic tone must freeze at current value');
  close(after.hr, baseline.hr, 0.01, 'frozen heart rate');
});

test('1 L hemorrhage with frozen reflexes reduces filling pressure and output', () => {
  const model = settled();
  const baseline = average(model);
  model.startIntervention({ type: 'hemorrhage', volumeMl: 1000, rateMlMin: 1000 });
  model.advance(90);
  const after = average(model);
  assert.ok(after.pms < baseline.pms, 'Pms must decrease');
  assert.ok(after.cvp < baseline.cvp, 'CVP must decrease');
  assert.ok(after.co < baseline.co, 'CO must decrease');
  assert.ok(after.map < baseline.map, 'MAP must decrease');
});

test('active reflexes provide compensatory tachycardia and preserve pressure after hemorrhage', () => {
  const frozen = settled();
  const active = settled({ reflex: true });
  for (const model of [frozen, active]) {
    model.startIntervention({ type: 'hemorrhage', volumeMl: 1000, rateMlMin: 1000 });
    model.advance(120);
  }
  const withoutReflex = average(frozen);
  const withReflex = average(active);
  assert.ok(withReflex.hr > withoutReflex.hr, 'active reflexes must increase HR');
  assert.ok(withReflex.map > withoutReflex.map, 'active reflexes must preserve more MAP');
});

test('pericardial delivery respects the chosen rate and stopping cancels further delivery', () => {
  const model = settled();
  const initial = model.snapshot();
  model.startIntervention({ type: 'pericardialInfusion', volumeMl: 400, rateMlMin: 120 });
  model.advance(10);
  close(model.snapshot().effusionVolume - initial.effusionVolume, 20, 0.05, '10-second pericardial infusion');
  model.stopIntervention();
  model.advance(30);
  close(model.snapshot().effusionVolume - initial.effusionVolume, 20, 0.05, 'stopped pericardial infusion');
  close(model.snapshot().bloodVolume, initial.bloodVolume, 0.01, 'separate pericardial compartment');
});

test('pericardial infusion raises external and RA pressure, lowers output, and drains', () => {
  const model = settled();
  const initial = model.snapshot();
  const baseline = average(model);
  model.startIntervention({ type: 'pericardialInfusion', volumeMl: 400, rateMlMin: 400 });
  model.advance(90);
  const tamponade = average(model);
  close(model.snapshot().effusionVolume - initial.effusionVolume, 400, 0.05, 'pericardial delivery');
  close(model.snapshot().bloodVolume, initial.bloodVolume, 0.01, 'circulating blood preserved');
  assert.ok(tamponade.pericardialPressure > baseline.pericardialPressure, 'external pressure must increase');
  assert.ok(tamponade.cvp > baseline.cvp, 'CVP must increase');
  assert.ok(tamponade.co < baseline.co, 'CO must decrease');
  model.startIntervention({ type: 'pericardialDrain', volumeMl: 500, rateMlMin: 500 });
  model.advance(90);
  const recovered = average(model);
  close(model.snapshot().effusionVolume, initial.effusionVolume, 0.05,
    'drain must preserve the model normal pericardial fluid volume');
  assert.ok(recovered.co > tamponade.co, 'CO must recover after drainage');
  close(recovered.co, baseline.co, baseline.co * 0.1, 'recovered CO');
});

test('5 L requested hemorrhage reaches an explicit bounded model limit', () => {
  const model = settled();
  model.startIntervention({ type: 'hemorrhage', volumeMl: 5000, rateMlMin: 5000 });
  for (let i = 0; i < 120; i++) {
    model.advance(1);
    checkFinite(model.snapshot());
  }
  const snapshot = model.snapshot();
  assert.ok(snapshot.limit, 'severe withdrawal must be marked outside model limits');
  assert.ok(snapshot.bloodVolume > 0, 'bounded model must preserve positive volume');
  assert.ok(snapshot.removedBlood < 5000, 'the model must not claim delivery of all 5 L');
  assert.equal(snapshot.intervention, null, 'model limit must stop the active intervention');
  assert.ok(snapshot.time < 150, 'simulation time must stop at the range boundary');
  model.advance(10);
  assert.deepEqual(model.snapshot(), snapshot, 'no evolution after an explicit model stop');
});

test('halving the integration step preserves averaged hemorrhage response within 1 percent', () => {
  function run(dt) {
    const model = settled();
    model.startIntervention({ type: 'hemorrhage', volumeMl: 1000, rateMlMin: 1000 });
    for (let i = 0; i < Math.round(90 / dt); i++) model.step(dt);
    const totals = { co: 0, map: 0, cvp: 0, pms: 0 };
    const count = Math.round(10 / dt);
    for (let i = 0; i < count; i++) {
      model.step(dt);
      const snapshot = model.snapshot();
      for (const key of Object.keys(totals)) totals[key] += snapshot[key] / count;
    }
    return totals;
  }
  const normal = run(0.002);
  const refined = run(0.001);
  for (const field of Object.keys(normal)) {
    close(normal[field], refined[field], Math.max(0.001, Math.abs(refined[field]) * 0.01),
      `${field} numerical step convergence`);
  }
});

test('identical experiments produce identical results', () => {
  const a = settled({ reflex: true });
  const b = settled({ reflex: true });
  for (const model of [a, b]) {
    model.startIntervention({ type: 'hemorrhage', volumeMl: 500, rateMlMin: 750 });
    model.advance(75);
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
});


test('freezing sympathetic feedback preserves active vagal heart-rate response', () => {
  const model=new PhysiologyModel();
  model.advance(20);
  model.setSympatheticFeedback(false);
  const tone=model.tone, drive=model.vagalDrive, before=model.hr;
  const parameters=model.parameters();
  model.startIntervention({type:'hemorrhage',volumeMl:500,rateMlMin:10000/60});
  model.advance(240);
  assert.equal(model.tone,tone);
  assert.deepEqual(model.parameters(),parameters, 'vagal feedback must not directly change vascular tone or contractility');
  assert.equal(model.snapshot().vagalFeedbackEnabled,true);
  assert.ok(model.vagalDrive<drive,'lower pressure withdraws vagal drive');
  assert.ok(model.hr>before,'heart rate may change despite frozen sympathetic tone');
  assert.equal(model.limit,null);
});

test('freezing vagal feedback holds its current drive while sympathetic response remains active', () => {
  const model=new PhysiologyModel();
  model.startIntervention({type:'hemorrhage',volumeMl:500,rateMlMin:500});
  model.advance(30);model.setVagalFeedback(false);
  const drive=model.vagalDrive,tone=model.tone;
  model.advance(90);
  assert.equal(model.vagalDrive,drive);
  assert.notEqual(model.tone,tone);
  assert.equal(model.snapshot().sympatheticFeedbackEnabled,true);
});

test('course vascular curve stays still across beats and pericardial infusion',()=>{
 const m=new PhysiologyModel(),base=m.snapshot();
 for(let i=0;i<100;i++){const s=m.advance(.02);close(s.pms,base.pms,1e-10,'stable Pms');assert.equal(s.rvr,base.rvr);}
 m.startIntervention({type:'pericardialInfusion',volumeMl:200,rateMlMin:600});
 const s=m.advance(20);close(s.pms,base.pms,1e-10,'unchanged blood volume');assert.equal(s.rvr,base.rvr);
});
test('blood volume shifts the vascular curve in parallel and marker lies on both curves',()=>{
 const m=new PhysiologyModel(),base=m.snapshot();
 m.startIntervention({type:'hemorrhage',volumeMl:500,rateMlMin:500});const s=m.advance(60);
 assert.ok(s.pms<base.pms);assert.equal(s.rvr,base.rvr);
 for(let i=0;i<s.guyton.venous.length;i++)close(s.guyton.venous[i].y-base.guyton.venous[i].y,(s.pms-base.pms)/s.rvr,1e-10,'parallel shift');
 for(const state of [base,s]){const p=state.guyton.intersection;assert.ok(p);close(p.y,(state.pms-p.x)/state.rvr,1e-10,'venous intersection');const c=state.guyton.cardiac,i=c.findIndex(q=>q.x>=p.x);const a=c[i-1],b=c[i];close(p.y,a.y+(b.y-a.y)*(p.x-a.x)/(b.x-a.x),1e-10,'cardiac intersection');}
 m.startIntervention({type:'bloodInfusion',volumeMl:500,rateMlMin:500});close(m.advance(60).pms,base.pms,1e-9,'volume restoration');
});

test('aortic closure produces a pressure notch and rebound during isovolumic relaxation',()=>{
 const m=new PhysiologyModel(),before=m.bloodVolume;let previous=m.aorticClosureTime,found=false;
 for(let i=0;i<600;i++){m.advance(.002);if(m.aorticClosureTime!==previous){found=true;break;}}
 assert.ok(found,'an ejecting beat closes the valve');
 const samples=[];for(let i=0;i<55;i++)samples.push(m.advance(.002));
 assert.ok(samples.every(s=>!s.aorticValveOpen),'valve stays closed through recoil');
 const trough=samples.slice(0,25).reduce((a,b)=>a.arterialPressure<b.arterialPressure?a:b);
 const rebound=samples.filter(s=>s.time>trough.time).reduce((a,b)=>a.arterialPressure>b.arterialPressure?a:b);
 assert.ok(rebound.arterialPressure-trough.arterialPressure>1,'visible post-closure rebound');
 assert.ok(trough.aorticClosurePressure<0,'initial dip');
 close(rebound.lvVolume,trough.lvVolume,.05,'isovolumic relaxation');
 close(m.bloodVolume,before,1e-8,'recoil conserves blood volume');
 m.advance(.2);close(m.aorticClosurePressure(),0,1e-12,'transient decays');
});
