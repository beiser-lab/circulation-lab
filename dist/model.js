/* Independent, reduced-order educational model. Units: mL, mmHg, seconds.
 * Flow follows compartment pressure gradients; all traces use the same state.
 * This is not SimBioSys's engine and is not calibrated for patient prediction.
 */
import {activeChamberPressure} from './cardiac-mechanics.js?v=graph-cleanup-18';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const BASE_V0=[10,15,700,2350,100,250,20,20];
// Fitted to selected classroom checkpoints; see CALIBRATION.md for scope.
export const DEFAULT_PARAMETERS=Object.freeze({
  "pericardialBaseline": -4,
  "lvPassivePressureOffset": 3.7504,
  "cardiopulmonaryMaxError": 4.5,
  "systemicCompliance": 126.36,
  "systemicUnstressed": 2072.3986,
  "systemicResistance": 0.8941,
  "venousResistance": 0.01584,
  "lvElastance": 4.0293,
  "lvCurvature": -0.013,
  "lvActiveVdMax": 10,
  "lvActiveVdMin": 5,
  "lvAlpha": 1.588,
  "lvBeta": 0.021864,
  "lvUnstressed": 40,
  "rvElastance": 0.5802316,
  "rvAlpha": 2.03875,
  "rvBeta": 0.0165,
  "rvUnstressed": 53.6625,
  "venousRecruitment": 1100,
  "venousRecruitmentMax": 228.8,
  "rvActiveV0": 25,
  "sympatheticHR": 82.072,
  "vagalHR": 28,
  "sympatheticGain": 0.4731,
  "cardiopulmonaryGain": 0.08704,
  "sympatheticLag": 20,
  "vagalLag": 2,
  "pericardialCapacity": 700,
  "pericardialScale": 1,
  "pericardialCompliance": 35
});
export class PhysiologyModel {
  constructor(parameters={}){this.config={...DEFAULT_PARAMETERS,...parameters};this.reset();}
  reset(){
    this.v=[120,120,842,3050,175,410,80,110];
    this.lvFunction=1;this.lvStiffness=1;this.lvRelaxation=1;this.pericardiumIntact=true;
    this.time=0;this.phase=0;this.tone=0;this.vascularTone=0;this.vagalDrive=0;this.vagalEnabled=true;this.reflexEnabled=true;this.beatId=0;this.curveCache=null;
    this.effusionVolume=1;this.removedBlood=0;this.intervention=null;this.limit=null;
    this.metrics={sbp:120,dbp:80,map:93,co:5,cvp:4,lvedp:8};
    this.aorticValveOpen=false;this.aorticClosedThisBeat=false;this.aorticClosureTime=null;this.notchAmplitude=0;
    this.beat=this.newBeat();
    // Warm up circulation with baseline autonomic tone fixed; no intervention.
    this.reflexEnabled=false;this.vagalEnabled=false;
    for(let i=0;i<30000;i++)this.step(.002);
    // Keep the warmed-up beat accumulator aligned with cardiac phase. Clearing
    // it here would turn the remainder of the current beat into a false full
    // beat (near-zero CO and pulse pressure) at the first visible timestep.
    if(this.aorticClosureTime!==null)this.aorticClosureTime-=this.time;
    this.time=0;this.reflexEnabled=true;this.vagalEnabled=true;
    this.baselineMap=this.metrics.map;
    this.baselineAtrialDistendingPressure=this.metrics.cvp-this.metrics.meanPericardialPressure;
    this.referenceBloodVolume=this.bloodVolume;
    this.baselineCapacity=this.metrics.co/(1-Math.exp(-Math.max(.1,this.metrics.cvp-this.metrics.meanPericardialPressure+2)/8));
    this.curveCache=null;
    return this.snapshot();
  }
  newBeat(){return {duration:0,aortic:0,venous:0,systemicVenous:0,map:0,peri:0,rap:0,max:-Infinity,min:Infinity,lvedp:0,lvedpTransmural:0,edv:this.v?.[0]??0,esv:this.v?.[0]??Infinity};}
  // Legacy API now controls the sympathetic limb only; vagal control is independent.
  setReflex(enabled){this.setSympatheticFeedback(enabled);}
  setSympatheticFeedback(enabled){this.reflexEnabled=Boolean(enabled);}
  setVagalFeedback(enabled){this.vagalEnabled=Boolean(enabled);}
  startIntervention({type,volumeMl,rateMlMin}){
    if(!['hemorrhage','bloodInfusion','pericardialInfusion','pericardialDrain'].includes(type))throw new Error('Unknown intervention');
    if(!Number.isFinite(volumeMl)||volumeMl<0||!Number.isFinite(rateMlMin)||rateMlMin<=0)throw new Error('Use nonnegative volume and positive rate');
    this.intervention=volumeMl>0?{type,volumeMl,rateMlMin,deliveredMl:0}:null;
  }
  stopIntervention(){this.intervention=null;}
  get bloodVolume(){return this.v.reduce((a,b)=>a+b,0);}
  get hr(){return clamp(70+this.config.sympatheticHR*this.tone-this.config.vagalHR*this.vagalDrive,35,200);}
  setLVFunction(fraction){if(!Number.isFinite(fraction)||fraction<.1||fraction>1.5)throw new Error('LV function must be 0.1–1.5');this.lvFunction=fraction;}
  setLVStiffness(multiplier){if(!Number.isFinite(multiplier)||multiplier<.5||multiplier>3)throw new Error('LV stiffness must be 0.5–3');this.lvStiffness=multiplier;}
  // Relative compliance control is reciprocal to the passive stiffness
  // parameter; actual dV/dP remains volume-dependent on the exponential curve.
  setLVCompliance(multiplier){if(!Number.isFinite(multiplier)||multiplier<1/3||multiplier>2)throw new Error('LV relative compliance must be 1/3–2');this.setLVStiffness(1/multiplier);}
  setLVRelaxation(multiplier){if(!Number.isFinite(multiplier)||multiplier<.5||multiplier>2)throw new Error('LV relaxation speed must be 0.5–2');this.lvRelaxation=multiplier;}
  lvActivation(){
    // Preserve baseline activation; sympathetic stimulation speeds the falling
    // limb without shifting the passive pressure-volume relationship.
    const peak=.19,fall=.19/(this.lvRelaxation*(1+.5*this.tone));
    if(this.phase<peak)return Math.sin(Math.PI*this.phase/(2*peak))**2;
    if(this.phase<peak+fall)return Math.cos(Math.PI*(this.phase-peak)/(2*fall))**2;
    return 0;
  }
  setPericardium(intact){this.pericardiumIntact=Boolean(intact);}
  // Finite effective venous reserve: sympathetic recruitment saturates while
  // chronotropy, inotropy and resistance retain their independent responses.
  // The reserve and RV pressure-volume parameters are classroom calibration
  // parameters, not measured total human recruitable volume.
  parameters(){const c=this.config;return {v0:BASE_V0.map((v,i)=>i===3?c.systemicUnstressed-Math.min(c.venousRecruitment*this.tone,c.venousRecruitmentMax):v),rs:c.systemicResistance*(1+c.sympatheticGain*this.vascularTone),rv:c.venousResistance*(1+.12*this.vascularTone),cp:1+0.55*this.tone};}
  aorticClosurePressure(){
    if(this.aorticClosureTime===null)return 0;
    const age=this.time-this.aorticClosureTime;
    // Reduced damped recoil response after valve closure, not a wave-propagation
    // or valve-leaflet model. One dip/rebound cycle, then smoothly zero.
    const duration=.14;
    if(age<0||age>=duration)return 0;
    return -this.notchAmplitude*Math.exp(-12*age)*Math.sin(2*Math.PI*age/duration)*(1-age/duration)**2;
  }
  lvPressureVolume(volume,activation=0,properties=this.lvPressureParameters()){
    const c=properties,z=c.lvBeta*c.stiffness*(volume-c.lvUnstressed);
    // Generalized exponential passive law with fitted pressure intercept.
    // lvUnstressed is retained as an internal parameter name but now denotes
    // a fixed reference volume (40 mL), not the zero-pressure volume. The
    // intercept enters the circulation solver and reference curves alike.
    // Preserve a smooth tangent extension below the reference volume.
    // Avoid the legacy discontinuous low-volume branch and error-return pressure.
    const passive=c.lvAlpha*(z>0?Math.expm1(Math.min(z,8)):z);
    return c.lvPassivePressureOffset+passive+activeChamberPressure(volume,activation,c);
  }

  lvPressureParameters(){
    const c=this.config,factor=this.lvFunction*this.parameters().cp;
    return {lvBeta:c.lvBeta,stiffness:this.lvStiffness,lvUnstressed:c.lvUnstressed,
      lvAlpha:c.lvAlpha,lvPassivePressureOffset:c.lvPassivePressureOffset,
      a1:factor*c.lvElastance,a2:factor*c.lvCurvature,
      vdMax:c.lvActiveVdMax,vdMin:c.lvActiveVdMin};
  }
  lvActivePressure(volume,activation){
    return activeChamberPressure(volume,activation,this.lvPressureParameters());
  }
  endSystolicReference(transmural=false){
    const event=this.metrics?.endSystole;
    if(!event)return null; // No end-ejection reference for a non-ejecting beat.
    const offset=transmural?0:event.externalPressure;
    // An isochrone at actual valve closure, not a load-independent ESPVR fit.
    // Freeze the completed beat's activation and properties. Include its exact
    // volume so canvas interpolation also passes through the measured point.
    const volumes=[...new Set([...Array.from({length:251},(_,i)=>i),event.volume])].sort((a,b)=>a-b);
    return {curve:volumes.map(x=>({x,y:offset+this.lvPressureVolume(x,event.activation,event.properties)})),
      point:{x:event.volume,y:event.pressure-(transmural?event.externalPressure:0)}};
  }

  ventricularReferenceCurves(){
    const diastolic=[],systolic=[];
    for(let x=0;x<=250;x+=1){
      diastolic.push({x,y:this.lvPressureVolume(x,0)});
      // Legacy plotting convention: active relation at peak activation,
      // separately from passive pressure. The UI adds external pressure once.
      systolic.push({x,y:this.lvActivePressure(x,1)});
    }
    return {diastolic,systolic};
  }
  leftAtrialPressure(volume,lvPressure,aorticPressure,externalPressure){
    const distendingVolume=volume-85;
    const atrialActivation=this.phase>=.78&&this.phase<.98?Math.sin(Math.PI*(this.phase-.78)/.20)**2:0;
    const reservoir=externalPressure+distendingVolume/8;
    const aWave=Math.max(0,distendingVolume)*.035*atrialActivation;
    const base=reservoir+aWave;
    // Equivalent brief leaflet displacement during rising LV pressure between
    // mitral closure and aortic opening. This pressure enters the flow solver;
    // it does not transfer blood or add a display-only waveform.
    const gradient=aorticPressure-base;
    const fraction=gradient>0?(lvPressure-base)/gradient:0;
    const cWave=this.phase<.19&&fraction>0&&fraction<1?Math.min(2.5,gradient/8)*4*fraction*(1-fraction):0;
    // Reservoir inflow and mitral outflow generate the v wave and y descent.
    return {pressure:base+cWave,aWave,cWave,reservoir};
  }
  pressures(){
    const p=this.parameters(),v=this.v;
    const c=this.config;
    const peri=c.pericardialBaseline+(this.pericardiumIntact?c.pericardialScale*Math.exp(clamp((v[0]+v[1]+v[6]+v[7]+this.effusionVolume-c.pericardialCapacity)/c.pericardialCompliance,-12,7)):0);
    const systole=.38;const activation=this.phase<systole?Math.sin(Math.PI*this.phase/systole)**2:0;
    const lv=Math.max(0,v[0]-p.v0[0]),rv=Math.max(0,v[1]-c.rvActiveV0);
    const lvPressure=peri+this.lvPressureVolume(v[0],this.lvActivation());
    const aorticPressure=(v[2]-p.v0[2])/1.5+this.aorticClosurePressure();
    const la=this.leftAtrialPressure(v[7],lvPressure,aorticPressure,peri);
    return [lvPressure,
      peri+c.rvAlpha*Math.expm1(clamp(c.rvBeta*(v[1]-c.rvUnstressed),-8,8))+c.rvElastance*p.cp*activation*rv,
      aorticPressure,(v[3]-p.v0[3])/c.systemicCompliance,
      (v[4]-p.v0[4])/5,(v[5]-p.v0[5])/22,
      peri+(v[6]-p.v0[6])/18,la.pressure,peri];
  }
  advance(seconds){
    if(!Number.isFinite(seconds)||seconds<0||seconds>3600)throw new Error('Advance must be 0–3600 seconds');
    let remaining=seconds;
    while(remaining>1e-10&&!this.limit){const dt=Math.min(.002,remaining);this.step(dt);remaining-=dt;}
    return this.snapshot();
  }
  step(dt){
    if(this.limit)return;
    const blood=this.bloodVolume;
    if(blood<1800){this.limit='Severe blood loss: outside the supported model range. Reset to continue.';this.intervention=null;return;}
    const a=this.intervention;
    if(a){
      let amount=Math.min(a.rateMlMin/60*dt,a.volumeMl-a.deliveredMl);
      if(a.type==='hemorrhage'){
        amount=Math.min(amount,Math.max(0,blood-1799));
        // Withdrawal is proportional to blood in each compartment, conserving mass.
        this.v=this.v.map(v=>v*(1-amount/blood));this.removedBlood+=amount;
      }else if(a.type==='bloodInfusion')this.v[3]+=amount;
      else if(a.type==='pericardialInfusion')this.effusionVolume+=amount;
      else {amount=Math.min(amount,Math.max(0,this.effusionVolume-1));this.effusionVolume-=amount;}
      a.deliveredMl+=amount;
      if(a.deliveredMl>=a.volumeMl-1e-8||(a.type==='pericardialDrain'&&this.effusionVolume<=1+1e-8))this.intervention=null;
    }
    const p=this.pressures(),params=this.parameters();
    if(this.aorticValveOpen&&p[0]<=p[2]){
      this.aorticValveOpen=false;this.aorticClosedThisBeat=true;
      this.aorticClosureTime=this.time;
      this.beat.endSystole={volume:this.v[0],pressure:p[0],externalPressure:p[8],
        activation:this.lvActivation(),properties:this.lvPressureParameters()};
      this.notchAmplitude=clamp(this.beat.aortic/1.5*.3,0,14);
    }
    if(!this.aorticClosedThisBeat&&p[0]>p[2])this.aorticValveOpen=true;
    // Edges: LV→arteries→systemic veins→RA→RV→PA→PV→LA→LV.
    const edges=[[0,2,.014,true],[2,3,params.rs,false],[3,6,params.rv,false],
      [6,1,.012,true],[1,4,.012,true],[4,5,.12,false],[5,7,.035,false],[7,0,.012,true]];
    const transfers=edges.map(([i,j,r,valve])=>{let q=(p[i]-p[j])/r;if(valve)q=Math.max(0,q);if(i===0&&j===2&&!this.aorticValveOpen)q=0;return q>=0?{i,j,q}:{i:j,j:i,q:-q};});
    const out=Array(8).fill(0);for(const e of transfers)out[e.i]+=e.q;
    const scale=this.v.map((v,i)=>out[i]>0?Math.min(1,Math.max(0,v-1)/(out[i]*dt)):1);
    let qa=0;for(let k=0;k<transfers.length;k++){const e=transfers[k],q=e.q*scale[e.i],d=q*dt;this.v[e.i]-=d;this.v[e.j]+=d;if(k===0)qa=q;}
    const b=this.beat;b.venous+=(p[3]-p[6])/params.rv*dt;b.systemicVenous+=p[3]*dt;b.duration+=dt;b.aortic+=qa*dt;b.map+=p[2]*dt;b.peri+=p[8]*dt;b.rap+=p[6]*dt;b.max=Math.max(b.max,p[2]);b.min=Math.min(b.min,p[2]);
    // Use volumes from this ejection, not the next beat's changing preload.
    if(this.phase<.2)b.edv=Math.max(b.edv,this.v[0]);if(this.phase<.6)b.esv=Math.min(b.esv,this.v[0]);
    if(this.phase>.85){b.lvedp=p[0];b.lvedpTransmural=p[0]-p[8];}
    const pressureError=((this.baselineMap||93)-this.metrics.map)/48;
    if(this.reflexEnabled){
      const atrialError=(this.baselineAtrialDistendingPressure??0)-(this.metrics.cvp-this.metrics.meanPericardialPressure);
      const target=clamp(pressureError+this.config.cardiopulmonaryGain*clamp(atrialError,-this.config.cardiopulmonaryMaxError,this.config.cardiopulmonaryMaxError),-.35,1);
      this.tone+=(target-this.tone)*dt/this.config.sympatheticLag;
      // Regional reduced-model response: arterial pressure drives vascular
      // resistance; cardiac drive also receives bounded filling-pressure input.
      // Both states stop updating when sympathetic feedback is clamped.
      this.vascularTone+=(clamp(pressureError,-.35,1)-this.vascularTone)*dt/this.config.sympatheticLag;
    }
    // Independent, provisional vagal chronotropic limb. Signed deviation from
    // baseline, NOT the original SimBioSys 0–1 tone. No vascular/ventricular effect.
    // Gains and lags are reduced-model calibration parameters, not legacy tone units.
    if(this.vagalEnabled){
      const target=clamp(-pressureError,-1,1);
      this.vagalDrive+=(target-this.vagalDrive)*dt/this.config.vagalLag;
    }
    this.phase+=dt*this.hr/60;this.time+=dt;
    if(this.phase>=1){this.phase%=1;this.beatId++;this.aorticClosedThisBeat=false;this.metrics={beatHR:60/b.duration,vr:b.venous/b.duration*.06,meanSystemicVenousPressure:b.systemicVenous/b.duration,meanPericardialPressure:b.peri/b.duration,sbp:b.max,dbp:b.min,map:b.map/b.duration,co:b.aortic/b.duration*.06,cvp:b.rap/b.duration,lvedp:b.lvedp,lvedpTransmural:b.lvedpTransmural,sv:b.aortic,edv:b.edv,esv:b.esv,lvesp:b.endSystole?.pressure??null,endSystole:b.endSystole??null};this.beat=this.newBeat();}
    if(this.effusionVolume>1500||p.some(x=>!Number.isFinite(x))||p.slice(2,8).some(x=>x < -20)||this.v.some(x=>!Number.isFinite(x)||x<0)){this.limit='Outside supported model range. Reset to continue.';this.intervention=null;}
  }
  snapshot(){
    const p=this.pressures(),q=this.parameters(),m=this.metrics;
    // Two systemic compliant reservoirs: the zero-flow filling pressure is
    // the compliance-weighted mean arterial/venous pressure. The effective
    // return resistance includes the arterial compliance fraction of SVR.
    // Beat averages remove pulsatile redistribution without inventing negative RVR.
    const c=this.config,ca=1.5,cv=c.systemicCompliance;
    const pms=(ca*m.map+cv*m.meanSystemicVenousPressure)/(ca+cv);
    const rvr=(q.rv+q.rs*ca/(ca+cv))/.06;
    const venous=[],cardiac=[];
    // Anchor the illustrative curve to the same completed-beat Pra and CO
    // used by the numerical display. HR, inotropy and afterload affect this
    // operating point through the solver, rather than a second output estimate.
    // The off-operating-point curve remains illustrative, not a pressure sweep.
    const externalPressure=m.meanPericardialPressure??p[8];
    const zeroPressure=Math.min(externalPressure-2,m.cvp-.1);
    const shape=x=>-Math.expm1(-Math.max(0,x-zeroPressure)/8);
    const capacity=Math.max(0,m.co)/shape(m.cvp);
    const xs=Array.from({length:121},(_,i)=>-5+i*.25);
    if(m.cvp>=-5&&m.cvp<=25)xs.push(m.cvp);
    xs.sort((a,b)=>a-b);
    for(const x of [...new Set(xs)]){
      venous.push({x,y:(pms-x)/rvr});
      cardiac.push({x,y:capacity*shape(x)});
    }
    // Intersect the exact plotted line segments, not the pulsatile solver state.
    let intersection=null;
    for(let i=1;i<venous.length;i++){
      const a=venous[i-1].y-cardiac[i-1].y,b=venous[i].y-cardiac[i].y;
      if(a>=0&&b<=0){const f=a/(a-b||1);intersection={x:venous[i-1].x+f*(venous[i].x-venous[i-1].x),y:cardiac[i-1].y+f*(cardiac[i].y-cardiac[i-1].y)};break;}
    }
    this.curveCache={venous,cardiac,intersection,label:'Cardiac curve is anchored to measured beat Pra and CO; its remaining shape is illustrative. Vascular curve uses systemic compartment parameters. Intersection agrees with output at steady state; transient CO and VR may differ.'};
    return {aorticValveOpen:this.aorticValveOpen,aorticClosureTime:this.aorticClosureTime,aorticClosurePressure:this.aorticClosurePressure(),time:this.time,beatId:this.beatId,phase:this.phase,...m,pra:m.cvp,pulsePressure:m.sbp-m.dbp,hr:m.beatHR??this.hr,instantaneousHR:this.hr,lvFunction:this.lvFunction,lvStiffness:this.lvStiffness,lvCompliance:1/this.lvStiffness,lvRelaxation:this.lvRelaxation,lvRelaxationRate:this.lvRelaxation*(1+.5*this.tone),pericardiumIntact:this.pericardiumIntact,svr:m.co>.05?(m.map-m.cvp)/m.co*80:null,pms,rvr,
      contractility:this.config.lvElastance*q.cp*this.lvFunction,lvVolume:this.v[0],lvPressure:p[0],arterialPressure:p[2],raPressure:p[6],
      rvPressure:p[1],paPressure:p[4],laPressure:p[7],pericardialPressure:p[8],
      lvTransmuralPressure:p[0]-p[8],
      bloodVolume:this.bloodVolume,effusionVolume:this.effusionVolume,removedBlood:this.removedBlood,
      reflexEnabled:this.reflexEnabled,sympatheticFeedbackEnabled:this.reflexEnabled,vagalFeedbackEnabled:this.vagalEnabled,vagalDrive:this.vagalDrive,vagalHeartRateEffect:-this.config.vagalHR*this.vagalDrive,tone:this.tone,vascularTone:this.vascularTone,autonomicTone:this.tone,intervention:this.intervention?{...this.intervention}:null,limit:this.limit,
      compartmentVolumes:[...this.v],guyton:this.curveCache};
  }
}
export default PhysiologyModel;
