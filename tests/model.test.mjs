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
  close(after.hr, baseline.hr, 0.15, 'clamped completed-beat heart rate');
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

test('beat-averaged Pms avoids heartbeat oscillations, with positive modest RVR changes',()=>{
 const m=new PhysiologyModel();m.setReflex(false);m.setVagalFeedback(false);m.advance(120);const base=m.snapshot();
 const values=[];for(let i=0;i<100;i++)values.push(m.advance(.02).pms);
 assert.ok(Math.max(...values)-Math.min(...values)<.05);
 m.setReflex(true);m.startIntervention({type:'hemorrhage',volumeMl:1000,rateMlMin:1000});
 const s=m.advance(180);assert.ok(s.pms<base.pms);assert.ok(s.rvr>0);assert.ok(Math.abs(s.rvr/base.rvr-1)<.2);
});
test('Guyton marker lies on both curves and steady forward return has Pms above Pra',()=>{
 const m=new PhysiologyModel();m.setReflex(false);
 for(const target of [1,200,400]){
 if(target>1){m.startIntervention({type:'pericardialInfusion',volumeMl:target-m.effusionVolume,rateMlMin:600});m.advance(180);}
 const state=m.snapshot(),p=state.guyton.intersection;assert.ok(p);assert.ok(state.pms>state.cvp);assert.ok(state.rvr>0);
 close(state.vr,(state.pms-state.cvp)/state.rvr,.1,'systemic steady return relation');
 close(p.y,(state.pms-p.x)/state.rvr,1e-10,'venous intersection');
 const c=state.guyton.cardiac,i=c.findIndex(q=>q.x>=p.x),a=c[i-1],b=c[i];
 close(p.y,a.y+(b.y-a.y)*(p.x-a.x)/(b.x-a.x),1e-10,'cardiac intersection');
 }
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

test('intrinsic ventricular reference curves ignore loading and phase, but systolic curve responds to sympathetic tone',()=>{
 const m=new PhysiologyModel();m.setSympatheticFeedback(false);const before=m.ventricularReferenceCurves();
 m.startIntervention({type:'pericardialInfusion',volumeMl:200,rateMlMin:600});m.advance(20);
 assert.deepEqual(m.ventricularReferenceCurves(),before);
 m.startIntervention({type:'hemorrhage',volumeMl:500,rateMlMin:1000});m.advance(30);
 assert.deepEqual(m.ventricularReferenceCurves(),before);
 m.setSympatheticFeedback(true);m.advance(20);const after=m.ventricularReferenceCurves();
 assert.deepEqual(after.diastolic,before.diastolic);
 assert.notDeepEqual(after.systolic,before.systolic);
 for(let i=0;i<500;i++){const s=m.advance(.002);const low=m.lvPressureVolume(s.lvVolume,0),high=m.lvPressureVolume(s.lvVolume,1);assert.ok(s.lvTransmuralPressure>=low-1e-8&&s.lvTransmuralPressure<=high+1e-8,'loop enclosed by intrinsic envelopes');}
});

test('PV and waveform samples preserve identical LV pressures through late tamponade',async()=>{
 const {plotSample,pvPoints,GUYTON_PRA_MAX}=await import('../dist/plot-data.js');
 assert.equal(GUYTON_PRA_MAX,20);
 const m=new PhysiologyModel();
 m.startIntervention({type:'pericardialInfusion',volumeMl:399,rateMlMin:200});
 m.advance(180);
 close(m.effusionVolume,400,1e-8,'lab total pericardial volume');
 const samples=[];for(let i=0;i<2000;i++)samples.push(plotSample(m.advance(.002)));
 const id=m.beatId-1,beat=samples.filter(s=>s.beatId===id);
 assert.ok(beat.length>100);
 const cavity=pvPoints(samples,id),transmural=pvPoints(samples,id,true);
 close(Math.max(...cavity.map(p=>p.y)),Math.max(...beat.map(s=>s.lvPressure)),0,'same-beat LV peak');
 for(let i=0;i<beat.length;i++)close(cavity[i].y-transmural[i].y,beat[i].pericardialPressure,1e-10,'same-sample external pressure offset');
 for(let i=0;i<beat.length;i++){
  assert.equal(cavity[i].y,beat[i].lvPressure);
  assert.equal(cavity[i].x,beat[i].lvVolume);
 }
});


test('LV systolic impairment raises filling pressure and ESV, with reduced output and unchanged RV intrinsic parameters',()=>{
 const m=new PhysiologyModel();m.setReflex(false);const before=m.snapshot(),rv=m.config.rvElastance;
 m.setLVFunction(.25);const after=m.advance(180);
 assert.ok(after.co<before.co);assert.ok(after.lvedp>before.lvedp+5);assert.ok(after.esv>before.esv+20);
 assert.equal(m.config.rvElastance,rv);assert.equal(m.lvStiffness,1);
 m.setLVFunction(1);const recovered=m.advance(180);close(recovered.co,before.co,.15,'LV function restoration');
});
test('stiffness and systolic function are independent, and removing pericardial constraint conserves volume',()=>{
 const m=new PhysiologyModel();m.setReflex(false);m.setVagalFeedback(false);
 const passive=m.lvPressureVolume(120,0);m.setLVStiffness(2);
 assert.ok(m.lvPressureVolume(120,0)>passive);assert.equal(m.lvFunction,1);
 m.setLVStiffness(1);m.startIntervention({type:'pericardialInfusion',volumeMl:399,rateMlMin:600});const before=m.advance(180);
 m.setPericardium(false);const after=m.advance(180);
 assert.ok(after.co>before.co);assert.ok(after.edv>before.edv);close(after.bloodVolume,before.bloodVolume,1e-7,'pericardiectomy conservation');
});
test('completed-beat CO equals SV times HR during changing function and hemorrhage',()=>{
 const m=new PhysiologyModel();m.setLVFunction(.5);m.startIntervention({type:'hemorrhage',volumeMl:500,rateMlMin:1000});
 for(let i=0;i<300;i++){const s=m.advance(.1);close(s.co,s.sv*s.hr/1000,1e-10,'beat identity');assert.ok(s.map>=s.dbp&&s.map<=s.sbp);}
});
test('reported MAP is the time integral of the sampled arterial waveform over a completed beat',()=>{
 const m=new PhysiologyModel();while(m.phase>.005)m.step(.002);
 // Begin at an actual accumulator boundary, retaining its tiny existing sample.
 let integral=m.beat.map,duration=m.beat.duration,id=m.beatId;
 while(m.beatId===id){integral+=m.pressures()[2]*.002;duration+=.002;m.step(.002);}
 close(m.snapshot().map,integral/duration,1e-10,'waveform averaged MAP');
});

test('PV ejection width agrees with stroke volume during an abrupt change in LV function',()=>{
 const m=new PhysiologyModel();m.setLVFunction(.25);
 for(let i=0;i<500;i++){const s=m.advance(.1);close(s.edv-s.esv,s.sv,.1,'same-ejection SV');}
});
test('baseline and withheld moderate hemorrhage remain within teaching calibration ranges',()=>{
 const m=new PhysiologyModel();m.setReflex(false);m.setVagalFeedback(false);const b=m.snapshot();
 assert.ok(b.co>4.8&&b.co<5.8);assert.ok(b.map>80&&b.map<95);assert.ok(b.pms>6&&b.pms<9);
 m.startIntervention({type:'hemorrhage',volumeMl:1000,rateMlMin:1000});const s=m.advance(240);
 assert.ok(s.co>3.2&&s.co<4.4);assert.ok(s.map>50&&s.map<70);assert.ok(s.cvp<b.cvp);
});


test('LA contraction generates an a wave and the waveform records true atrial pressure',async()=>{
 const {plotSample}=await import('../dist/plot-data.js');const m=new PhysiologyModel();
 m.phase=.76;const before=m.pressures()[7];m.phase=.88;assert.ok(m.pressures()[7]>before+1,'atrial contraction raises pressure at fixed volume');
 m.reset();const values=[];for(let i=0;i<1000;i++){const s=m.advance(.002);values.push(s.laPressure);assert.equal(plotSample(s).laPressure,s.laPressure);}
 assert.ok(Math.max(...values)-Math.min(...values)>3.5,'resolved atrial pulsatility');
});
test('lusitropy speeds relaxation independently of passive stiffness',()=>{
 const m=new PhysiologyModel(),passive=m.ventricularReferenceCurves().diastolic;
 m.phase=.30;const normal=m.lvActivation();m.setLVRelaxation(1.5);assert.ok(m.lvActivation()<normal);
 assert.deepEqual(m.ventricularReferenceCurves().diastolic,passive);
 m.setLVRelaxation(1);m.tone=.5;assert.ok(m.lvActivation()<normal);assert.deepEqual(m.ventricularReferenceCurves().diastolic,passive);
 m.phase=.19;close(m.lvActivation(),1,1e-12,'peak activation unchanged');
});
test('greater passive compliance and faster relaxation remain bounded and conserve blood',()=>{
 const m=new PhysiologyModel();const blood=m.bloodVolume,baseline=m.lvPressureVolume(120,0);
 m.setLVStiffness(.5);assert.ok(m.lvPressureVolume(120,0)<baseline);m.setLVRelaxation(2);
 const s=m.advance(180);assert.equal(s.limit,null);checkFinite(s);close(s.bloodVolume,blood,1e-7,'relaxation conserves blood');
});


test('LA c wave is confined to rising isovolumic LV contraction and enters the real LA pressure',()=>{
 const m=new PhysiologyModel();let found=0;const blood=m.bloodVolume;
 for(let i=0;i<1500;i++){
  const p=m.pressures(),la=m.leftAtrialPressure(m.v[7],p[0],p[2],p[8]);
  close(p[7],la.pressure,1e-12,'LA solver pressure');
  if(la.cWave>0){found++;assert.ok(m.phase<.19);assert.ok(p[0]>p[7]);assert.ok(p[0]<p[2]);assert.equal(la.aWave,0);assert.ok(la.cWave<=2.5);}
  m.step(.002);
 }
 assert.ok(found>10,'resolved c wave over multiple beats');close(m.bloodVolume,blood,1e-7,'leaflet displacement conserves blood');
 m.phase=.25;assert.equal(m.leftAtrialPressure(160,100,90,-4).cWave,0,'no c wave during ejection');
 m.phase=.35;assert.equal(m.leftAtrialPressure(160,30,90,-4).cWave,0,'no second c wave during relaxation');
 m.phase=.88;assert.ok(m.leftAtrialPressure(160,5,80,-4).aWave>0,'atrial systole remains separate');
});

test('severe hemorrhage exhausts compensation without breaking beat identities and recovers after volume replacement',()=>{
 const m=new PhysiologyModel(),base=m.snapshot();let moderate;
 for(let i=0;i<4;i++){
  m.startIntervention({type:'hemorrhage',volumeMl:500,rateMlMin:10000/60});m.advance(380);
  if(i===1)moderate=m.snapshot();
 }
 const severe=average(m);const s=m.snapshot();checkFinite(s);assert.equal(s.limit,null);
 assert.ok(moderate.co>4.5&&moderate.co<5.5,'moderate hemorrhage remains compensated');
 assert.ok(severe.co>1.8&&severe.co<2.8,'severe hemorrhage has markedly reduced output');
 assert.ok(severe.hr>170&&severe.hr<198,'tachycardia without hitting the HR ceiling');
 assert.ok(severe.map>40&&severe.map<58,'pressure no longer excessively preserved');
 assert.ok(severe.cvp<moderate.cvp);assert.ok(s.pms>s.cvp);assert.ok(s.rvr/base.rvr<1.25,'modest RVR change');
 close(s.co,s.sv*s.hr/1000,1e-10,'severe beat identity');close(s.edv-s.esv,s.sv,.1,'severe PV width');
 close(s.bloodVolume,base.bloodVolume-2000,.001,'withdrawal mass balance');
 m.startIntervention({type:'bloodInfusion',volumeMl:2000,rateMlMin:1000});m.advance(420);
 const recovered=average(m);assert.equal(m.limit,null);close(m.bloodVolume,base.bloodVolume,.001,'replacement mass balance');
 close(recovered.co,base.co,.15,'recovered CO');close(recovered.hr,base.hr,2,'recovered HR');
});

test('severe hemorrhage remains stable when the integration timestep is halved',()=>{
 function run(dt){const m=new PhysiologyModel();m.startIntervention({type:'hemorrhage',volumeMl:2000,rateMlMin:2000});
  for(let i=0;i<280/dt;i++)m.step(dt);
  const sums={co:0,map:0,hr:0,cvp:0};for(let i=0;i<10/dt;i++){m.step(dt);const s=m.snapshot();for(const k in sums)sums[k]+=s[k]*dt/10;}
  assert.equal(m.limit,null);return sums;
 }
 const normal=run(.002),fine=run(.001);for(const k in normal)close(normal[k],fine[k],Math.max(.03,Math.abs(fine[k])*.02),`severe ${k} convergence`);
});

test('relative compliance moves the passive curve in the correct direction independently of 125 percent systolic function',()=>{
 const m=new PhysiologyModel(),pressure=m.lvPressureVolume(120,0),active=m.lvPressureVolume(120,1)-pressure;
 m.setLVFunction(1.25);close(m.lvPressureVolume(120,0),pressure,1e-12,'unchanged passive curve');close(m.lvPressureVolume(120,1)-pressure,active*1.25,1e-10,'increased active pressure');
 for(const c of [1/3,.5,.75,1,1.25,1.5,2]){
  m.setLVCompliance(c);const p=m.lvPressureVolume(120,0);
  if(c>1)assert.ok(p<pressure);if(c<1)assert.ok(p>pressure);
  close(m.snapshot().lvCompliance,c,1e-12,'reported compliance');
  const blood=m.bloodVolume;m.advance(30);assert.equal(m.limit,null);close(m.bloodVolume,blood,1e-7,'conservation');
 }
 m.reset();assert.equal(m.snapshot().lvCompliance,1);assert.equal(m.lvFunction,1);
});
