/* Independent, reduced-order educational model. Units: mL, mmHg, seconds.
 * Flow follows compartment pressure gradients; all traces use the same state.
 * This is not SimBioSys's engine and is not calibrated for patient prediction.
 */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const BASE_V0=[10,15,700,2350,100,250,20,20];
export class PhysiologyModel {
  constructor(){this.reset();}
  reset(){
    this.v=[120,120,842,3050,175,410,80,110];
    this.time=0;this.phase=0;this.tone=0;this.vagalDrive=0;this.vagalEnabled=true;this.reflexEnabled=true;this.beatId=0;this.curveCache=null;
    this.effusionVolume=15;this.removedBlood=0;this.intervention=null;this.limit=null;
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
    this.referenceBloodVolume=this.bloodVolume;
    this.curveCache=null;
    return this.snapshot();
  }
  newBeat(){return {duration:0,aortic:0,map:0,peri:0,rap:0,max:-Infinity,min:Infinity,lvedp:0,lvedpTransmural:0,edv:0,esv:Infinity};}
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
  get hr(){return 72+55*this.tone-8*this.vagalDrive;}
  parameters(){return {v0:BASE_V0.map((v,i)=>i===3?v-450*this.tone:v),rs:1.05*(1+.85*this.tone),rv:.045,cp:1+0.55*this.tone};}
  aorticClosurePressure(){
    if(this.aorticClosureTime===null)return 0;
    const age=this.time-this.aorticClosureTime;
    // Reduced damped recoil response after valve closure, not a wave-propagation
    // or valve-leaflet model. One dip/rebound cycle, then smoothly zero.
    const duration=.14;
    if(age<0||age>=duration)return 0;
    return -this.notchAmplitude*Math.exp(-12*age)*Math.sin(2*Math.PI*age/duration)*(1-age/duration)**2;
  }
  pressures(){
    const p=this.parameters(),v=this.v;
    const peri=.35*Math.exp(clamp((v[0]+v[1]+v[6]+v[7]+this.effusionVolume-350)/85,-8,6));
    const systole=.38;const activation=this.phase<systole?Math.sin(Math.PI*this.phase/systole)**2:0;
    const lv=Math.max(0,v[0]-p.v0[0]),rv=Math.max(0,v[1]-p.v0[1]);
    return [peri+.55*(Math.exp(clamp(lv/65,0,8))-1)+2.1*p.cp*activation*lv,
      peri+.3*(Math.exp(clamp(rv/85,0,8))-1)+.65*p.cp*activation*rv,
      (v[2]-p.v0[2])/1.5+this.aorticClosurePressure(),(v[3]-p.v0[3])/110,
      (v[4]-p.v0[4])/5,(v[5]-p.v0[5])/22,
      peri+(v[6]-p.v0[6])/18,peri+(v[7]-p.v0[7])/15,peri];
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
      else {amount=Math.min(amount,Math.max(0,this.effusionVolume-15));this.effusionVolume-=amount;}
      a.deliveredMl+=amount;
      if(a.deliveredMl>=a.volumeMl-1e-8||(a.type==='pericardialDrain'&&this.effusionVolume<=15+1e-8))this.intervention=null;
    }
    const p=this.pressures(),params=this.parameters();
    if(this.aorticValveOpen&&p[0]<=p[2]){
      this.aorticValveOpen=false;this.aorticClosedThisBeat=true;
      this.aorticClosureTime=this.time;
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
    const b=this.beat;b.duration+=dt;b.aortic+=qa*dt;b.map+=p[2]*dt;b.peri+=p[8]*dt;b.rap+=p[6]*dt;b.max=Math.max(b.max,p[2]);b.min=Math.min(b.min,p[2]);
    b.edv=Math.max(b.edv,this.v[0]);b.esv=Math.min(b.esv,this.v[0]);
    if(this.phase>.85){b.lvedp=p[0];b.lvedpTransmural=p[0]-p[8];}
    const pressureError=((this.baselineMap||93)-this.metrics.map)/48;
    if(this.reflexEnabled){
      const target=clamp(pressureError,-.35,1);
      this.tone+=(target-this.tone)*dt/5;
    }
    // Independent, provisional vagal chronotropic limb. Signed deviation from
    // baseline, NOT the original SimBioSys 0–1 tone. No vascular/ventricular effect.
    // Gains (8 bpm per unit) and 1 s lag are uncalibrated teaching parameters.
    if(this.vagalEnabled){
      const target=clamp(-pressureError,-1,1);
      this.vagalDrive+=(target-this.vagalDrive)*dt;
    }
    this.phase+=dt*this.hr/60;this.time+=dt;
    if(this.phase>=1){this.phase%=1;this.beatId++;this.aorticClosedThisBeat=false;this.metrics={meanPericardialPressure:b.peri/b.duration,sbp:b.max,dbp:b.min,map:b.map/b.duration,co:b.aortic/b.duration*.06,cvp:b.rap/b.duration,lvedp:b.lvedp,lvedpTransmural:b.lvedpTransmural,sv:b.aortic,edv:b.edv,esv:b.esv};this.beat=this.newBeat();}
    if(this.effusionVolume>1500||p.some(x=>!Number.isFinite(x))||p.slice(2,8).some(x=>x < -20)||this.v.some(x=>!Number.isFinite(x)||x<0)){this.limit='Outside supported model range. Reset to continue.';this.intervention=null;}
  }
  snapshot(){
    const p=this.pressures(),q=this.parameters(),m=this.metrics;
    // Course Guyton approximation: volume shifts Pms, while RVR stays fixed.
    // Use total circulating volume, not pulsatile arterial/venous redistribution.
    // Effective course reservoir compliance: 250 mL/mmHg (provisional).
    const pms=Math.max(0,7+(this.bloodVolume-(this.referenceBloodVolume??this.bloodVolume))/250);
    const rvr=1;
    const venous=[],cardiac=[];
    const capacity=10*q.cp*(this.hr/72)*(1.05/q.rs);
    const externalPressure=this.metrics.meanPericardialPressure??p[8];
    for(let x=-5;x<=25;x+=.25){
      venous.push({x,y:(pms-x)/rvr});
      cardiac.push({x,y:Math.max(0,capacity*(1-Math.exp(-Math.max(0,x-externalPressure+2)/8)))});
    }
    // Intersect the exact plotted line segments, not the pulsatile solver state.
    let intersection=null;
    for(let i=1;i<venous.length;i++){
      const a=venous[i-1].y-cardiac[i-1].y,b=venous[i].y-cardiac[i].y;
      if(a>=0&&b<=0){const f=a/(a-b||1);intersection={x:venous[i-1].x+f*(venous[i].x-venous[i-1].x),y:cardiac[i-1].y+f*(cardiac[i].y-cardiac[i-1].y)};break;}
    }
    this.curveCache={venous,cardiac,intersection,label:'Course approximation: fixed RVR; volume-dependent Pms. Intersection is predicted equilibrium, not transient measured CO.'};
    return {aorticValveOpen:this.aorticValveOpen,aorticClosureTime:this.aorticClosureTime,aorticClosurePressure:this.aorticClosurePressure(),time:this.time,beatId:this.beatId,phase:this.phase,hr:this.hr,...m,svr:m.co>.05?(m.map-m.cvp)/m.co*80:null,pms,rvr,
      contractility:2.1*q.cp,lvVolume:this.v[0],lvPressure:p[0],arterialPressure:p[2],raPressure:p[6],
      rvPressure:p[1],paPressure:p[4],laPressure:p[7],pericardialPressure:p[8],
      lvTransmuralPressure:p[0]-p[8],
      bloodVolume:this.bloodVolume,effusionVolume:this.effusionVolume,removedBlood:this.removedBlood,
      reflexEnabled:this.reflexEnabled,sympatheticFeedbackEnabled:this.reflexEnabled,vagalFeedbackEnabled:this.vagalEnabled,vagalDrive:this.vagalDrive,vagalHeartRateEffect:-8*this.vagalDrive,tone:this.tone,autonomicTone:this.tone,intervention:this.intervention?{...this.intervention}:null,limit:this.limit,
      compartmentVolumes:[...this.v],guyton:this.curveCache};
  }
}
export default PhysiologyModel;
