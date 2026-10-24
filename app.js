import { PhysiologyModel } from './model.js?v=waveforms-4';

import {plotSample,pvPoints,GUYTON_PRA_MAX} from './plot-data.js?v=waveforms-4';

const $ = id => document.getElementById(id);
const model = new PhysiologyModel();
const specs = [
 ['hr','HR','beats/min',0], ['sbp','SBP','mmHg',0], ['dbp','DBP','mmHg',0], ['map','MAP','mmHg',0],
 ['co','Cardiac output','L/min',2], ['vr','Systemic venous return','L/min',2], ['cvp','Central venous pressure','mmHg',1], ['lvedp','LV end-diastolic pressure','mmHg',1], ['svr','Systemic vascular resistance','dyn·s·cm⁻⁵',0],
 ['pms','Pms','mmHg',1], ['rvr','Resistance to venous return','mmHg·min/L',2], ['contractility','LV contractility','mmHg/mL',2], ['meanPericardialPressure','Mean pericardial pressure','mmHg',1],
 ['lvedpTransmural','LVEDP − pericardial pressure','mmHg',1], ['sv','Stroke volume','mL',1], ['edv','LV end-diastolic volume','mL',1], ['esv','LV end-systolic volume','mL',1], ['bloodVolume','Circulating blood volume','mL',0], ['effusionVolume','Pericardial fluid volume','mL',0]
];
const measureGroups = [
 {title:'Vital Signs',keys:['sbp','dbp','map','hr']},
 {title:'Cardiac Measures',keys:['co','sv','edv','esv','lvedp','contractility','lvedpTransmural','meanPericardialPressure','effusionVolume']},
 {title:'Vascular Measures',keys:['vr','cvp','svr','pms','rvr','bloodVolume']}
];
const selected = new Set(['sbp','dbp','map','hr','co','sv','edv','esv','lvedp','contractility','vr','cvp','svr','pms','rvr']);
let running = false, speed = 1, history = [], exportRows = [], baseline = [], baselineState, lastExport = -1;
let state = model.snapshot(), previousFrame = performance.now(), drawDue = 0, deliverySpec = null;
const colors = {arterial:'#800000',lv:'#a65e00',venous:'#155f83',grid:'#eaf0f2',text:'#666666'};
const fmt = (v,d=1) => Number.isFinite(v) ? v.toFixed(d) : '—';

function setupMetrics(){
 $('measure-options').innerHTML='<legend>Displayed measures</legend>' + specs.map(([key,label])=>`<label><input type="checkbox" value="${key}" ${selected.has(key)?'checked':''}> ${label}</label>`).join('');
 $('measure-options').addEventListener('change', e=>{if(e.target.checked)selected.add(e.target.value);else selected.delete(e.target.value); renderMetrics();});
 renderMetrics();
}
function renderMetrics(){
 $('metrics').innerHTML=measureGroups.map(({title,keys},index)=>{
 const visible=keys.map(key=>specs.find(([k])=>k===key)).filter(([k])=>selected.has(k));
 if(!visible.length)return '';
 return `<section class="measure-group" aria-labelledby="measure-group-${index}"><h3 id="measure-group-${index}">${title}</h3><div class="metrics">${visible.map(([k,label,unit,d])=>`<div class="metric"><div class="metric-label" title="${label}">${label}</div><div class="metric-value"><span data-metric="${k}">${fmt(state[k],d)}</span><span class="metric-unit">${unit}</span></div></div>`).join('')}</div></section>`;
 }).join('');
}
function updateMetrics(){
 for(const [branch,value] of [['sympathetic',1+state.tone],['parasympathetic',1+state.vagalDrive]]){$(`${branch}-value`).textContent=fmt(value,2);$(`${branch}-gauge`).value=value;}
 $('relaxation-rate').textContent=`Effective relaxation speed: ${fmt(state.lvRelaxationRate,2)}× baseline`;

 for(const [k,, ,d] of specs){const el=document.querySelector(`[data-metric="${k}"]`);if(el)el.textContent=fmt(state[k],d);}
 const tamponade=state.effusionVolume>1.1||['pericardial','drainage'].includes($('intervention').value);$('pv-pressure-control').hidden=!tamponade;if(!tamponade)$('pv-pressure').value='intracavitary';
 const t=state.time; $('clock').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;
 $('status').textContent=state.limit ? 'Model boundary reached' : running ? (speed===1?'Running · Real time (1×)':`Running · Accelerated (${speed}×)`) : 'Simulation paused';
 $('feedback-status').textContent=`Sympathetic feedback ${state.sympatheticFeedbackEnabled?'active':'clamped at current tone'} · Parasympathetic feedback ${state.vagalFeedbackEnabled?'active':'clamped at current tone'}.`;
 $('run').textContent=running?'Ⅱ Pause simulator':'▶ Start simulator';
 $('warning').hidden=!state.limit; $('warning').textContent=state.limit || '';
 if(deliverySpec){
 const actual = state.intervention?.deliveredMl ?? (deliverySpec.type==='hemorrhage' ? Math.max(0,state.removedBlood-deliverySpec.startRemoved) : deliverySpec.type==='bloodInfusion' ? Math.max(0,state.bloodVolume-deliverySpec.startBlood) : deliverySpec.type==='pericardialInfusion' ? Math.max(0,state.effusionVolume-deliverySpec.startEffusion) : Math.max(0,deliverySpec.startEffusion-state.effusionVolume));
 $('progress').value=Math.min(1,actual/deliverySpec.volumeMl);
 $('delivery').textContent=`${state.intervention?'In progress':'Stopped / complete'} · ${fmt(actual,0)} / ${fmt(deliverySpec.volumeMl,0)} mL delivered`;
 }
}
function makeBaseline(){
 const b=new PhysiologyModel(); baseline=[];
 for(let i=0;i<1000;i++){b.advance(.01);const s=b.snapshot();baseline.push(plotSample(s));}
 baselineState=b.snapshot();
}
function capture(){
 history.push(plotSample(state));
 if(state.time-lastExport>=.1){exportRows.push(Object.fromEntries(['time',...specs.map(s=>s[0]),'lvVolume','lvPressure','arterialPressure','raPressure','laPressure','tone','vagalDrive','lvRelaxationRate'].map(k=>[k,state[k]])));lastExport=state.time;}
}
function reset(){running=false;model.reset();$('lv-function').value='1';$('lv-stiffness').value='1';$('lv-relaxation').value='1';model.setSympatheticFeedback($('reflex').value==='active');model.setVagalFeedback($('vagal').value==='active');speed=1;$('speed').value='1';previousFrame=performance.now();state=model.snapshot();history=[];exportRows=[];lastExport=-1;deliverySpec=null;$('delivery').textContent='No active intervention';$('progress').value=0;capture();updateMetrics();draw();}
function start(type,volumeMl,rateMlMin){
 if(!Number.isFinite(volumeMl)||volumeMl<=0||volumeMl>5000||!Number.isFinite(rateMlMin)||rateMlMin<=0||rateMlMin>10000){$('delivery').textContent='Use a volume above 0 and at most 5,000 mL; rate must be 1–10,000 mL/min.';return;}
 deliverySpec={type,volumeMl,rateMlMin,startRemoved:state.removedBlood,startBlood:state.bloodVolume,startEffusion:state.effusionVolume};
 model.startIntervention({type,volumeMl,rateMlMin});previousFrame=performance.now();running=true;state=model.snapshot();updateMetrics();
}

function chart(id,xMin,xMax,yMin,yMax,xLabel,yLabel){
 const canvas=$(id),r=canvas.getBoundingClientRect(),w=r.width,h=Number(canvas.dataset.logicalHeight || (canvas.dataset.logicalHeight=canvas.getAttribute('height'))),dpr=window.devicePixelRatio||1;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.height=h+'px';}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const left=45,right=w-17,top=22,bottom=h-36;const X=x=>left+(x-xMin)/(xMax-xMin)*(right-left),Y=y=>bottom-(y-yMin)/(yMax-yMin)*(bottom-top);
 ctx.font='10px -apple-system, sans-serif';ctx.fillStyle=colors.text;ctx.strokeStyle=colors.grid;ctx.lineWidth=1;
 const pressurePlot=['pressures','pv','filling'].includes(id),timePlot=['pressures','filling'].includes(id);
 const yTicks=pressurePlot?(id==='filling'?[-10,0,10,20,30]:[-10,0,60,120,180]):Array.from({length:5},(_,i)=>yMin+(yMax-yMin)*i/4);
 for(const y of yTicks){ctx.strokeStyle=y===0?'#aebdc4':colors.grid;ctx.beginPath();ctx.moveTo(left,Y(y));ctx.lineTo(right,Y(y));ctx.stroke();ctx.textAlign='right';ctx.fillText(Number(y.toFixed(1)),left-8,Y(y)+3);}
 ctx.textAlign='center';
 if(timePlot){ctx.strokeStyle=colors.text;for(let second=0;second<=10;second++){ctx.beginPath();ctx.moveTo(X(second),bottom);ctx.lineTo(X(second),bottom+(second%5===0?6:3));ctx.stroke();if(second%5===0)ctx.fillText(second,X(second),bottom+16);}}
 else for(let i=0;i<=4;i++){const x=xMin+(xMax-xMin)*i/4;ctx.fillText(Number(x.toFixed(1)),X(x),bottom+16);}
 ctx.textAlign='left';ctx.fillText(yLabel,3,10);ctx.textAlign='center';ctx.fillText(xLabel,(left+right)/2,h-3);
 const line=(points,color,dashed=false)=>{ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.strokeStyle=color;ctx.lineWidth=dashed?1.2:1.8;ctx.globalAlpha=dashed?.4:1;ctx.setLineDash(dashed?[4,4]:[]);ctx.beginPath();let active=false;for(const p of points){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){active=false;continue;}if(!active){ctx.moveTo(X(p.x),Y(p.y));active=true;}else ctx.lineTo(X(p.x),Y(p.y));}ctx.stroke();ctx.restore();};
 const dot=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;ctx.fillStyle='#193944';ctx.strokeStyle='white';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(x),Y(y),4.5,0,Math.PI*2);ctx.fill();ctx.stroke();};
 return {line,dot};
}
function draw(){
 const overlay=$('overlay').checked;const end=Math.max(10,state.time),start=end-10;
 // Fixed axes preserve visual comparisons throughout every experiment.
 const pressureMax=180;
 const wave=chart('pressures',0,10,-10,pressureMax,'Time (s)','Pressure (mmHg)');
 for(const [key,color] of [['arterialPressure',colors.arterial],['lvPressure',colors.lv],['laPressure',colors.venous]]){
 if(overlay)wave.line(baseline.map((s,i)=>({x:i*.01,y:s[key]})),color,true);
 wave.line(history.map(s=>({x:s.time-start,y:s[key]})),color);
 }
 const filling=chart('filling',0,10,-10,30,'Time (s)','Pressure (mmHg)');
 for(const [key,color] of [['lvPressure',colors.lv],['laPressure',colors.venous]]){
 if(overlay)filling.line(baseline.map((s,i)=>({x:i*.01,y:s[key]})),color,true);
 filling.line(history.map(s=>({x:s.time-start,y:s[key]})),color);
 }
 const transmural=$('pv-pressure').value==='transmural';
 const maxVolume=250;
 const pv=chart('pv',0,maxVolume,-10,pressureMax,'LV volume (mL)',transmural?'LV transmural pressure (mmHg)':'LV pressure (mmHg)');
 const reference=model.ventricularReferenceCurves();
 const offset=transmural?0:(state.meanPericardialPressure??state.pericardialPressure);
 pv.line(reference.diastolic.map(p=>({x:p.x,y:p.y+offset})),colors.venous);pv.line(reference.systolic.map(p=>({x:p.x,y:p.y+offset})),colors.lv);
 if(overlay)pv.line(pvPoints(baseline,baselineState.beatId-1,transmural),colors.arterial,true);
 // Draw beats separately: never connect the end of one beat to another.
 pv.line(pvPoints(history,state.beatId-1,transmural),colors.arterial,true);
 pv.line(pvPoints(history,state.beatId,transmural),colors.arterial);
 pv.dot(state.lvVolume,transmural?state.lvTransmuralPressure:state.lvPressure);
 const g=state.guyton;
 if(g){const plot=chart('guyton',-5,GUYTON_PRA_MAX,0,20,'Right atrial pressure (mmHg)','Venous Return (L/min)');if(overlay&&baselineState.guyton){plot.line(baselineState.guyton.cardiac,colors.arterial,true);plot.line(baselineState.guyton.venous,colors.venous,true);}plot.line(g.cardiac,colors.arterial);plot.line(g.venous,colors.venous);if(g.intersection)plot.dot(g.intersection.x,g.intersection.y);}

}
function frame(now){
 const elapsed=Math.max(0,(now-previousFrame)/1000);previousFrame=now;
 if(running){let amount=elapsed*speed;while(amount>0){const dt=Math.min(.01,amount);model.advance(dt);amount-=dt;state=model.snapshot();capture();if(state.limit){running=false;break;}}
 const cutoff=state.time-10;while(history.length&&history[0].time<cutoff)history.shift();}
 if(now-drawDue>=16){updateMetrics();draw();drawDue=now;}
 requestAnimationFrame(frame);
}
for(const [id,setter] of [['lv-function','setLVFunction'],['lv-stiffness','setLVStiffness'],['lv-relaxation','setLVRelaxation']])$(id).addEventListener('change',e=>{model[setter](Number(e.target.value));state=model.snapshot();updateMetrics();draw();});
$('run').addEventListener('click',()=>{running=!running;previousFrame=performance.now();updateMetrics();});
$('reset').addEventListener('click',reset);
$('speed').addEventListener('change',e=>{speed=Number(e.target.value);previousFrame=performance.now();updateMetrics();});
$('reflex').addEventListener('change',e=>{model.setSympatheticFeedback(e.target.value==='active');state=model.snapshot();updateMetrics();});
$('vagal').addEventListener('change',e=>{model.setVagalFeedback(e.target.value==='active');state=model.snapshot();updateMetrics();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;updateMetrics();}previousFrame=performance.now();});
$('overlay').addEventListener('change',draw);
$('configure').addEventListener('click',()=>{const open=$('display-options').hidden;$('display-options').hidden=!open;$('configure').setAttribute('aria-expanded',String(open));});
$('apply').addEventListener('click',()=>start({hemorrhage:'hemorrhage',infusion:'bloodInfusion',pericardial:'pericardialInfusion',drainage:'pericardialDrain'}[$('intervention').value],Number($('volume').value),Number($('rate').value)));
$('stop').addEventListener('click',()=>{model.stopIntervention();state=model.snapshot();updateMetrics();});
$('pv-pressure').addEventListener('change',draw);
$('load').addEventListener('click',()=>{
 reset();const p=$('preset').value;
 if(p==='hemorrhage'){$('intervention').value='hemorrhage';$('volume').value=500;$('rate').value=10000/60;start('hemorrhage',500,10000/60);}
 if(p==='tamponade200'||p==='tamponade400'){
   const target=p==='tamponade200'?200:400;
   $('intervention').value='pericardial';$('volume').value=target-state.effusionVolume;$('rate').value=200;
   start('pericardialInfusion',target-state.effusionVolume,200);
 }
 updateQuestion();
});
function updateQuestion(){const p=$('intervention').value;const tamponade=['pericardial','drainage'].includes(p);$('question-title').textContent=tamponade?'Pressure is not always preload':'Follow the pressure gradient';$('question').textContent=tamponade?'As pericardial pressure rises, what happens to measured filling pressure versus the pressure that distends the ventricle?':'How does a fall in circulating volume change Pms, venous return, and stroke volume?';}
$('intervention').addEventListener('change',()=>{
 const pericardial=['pericardial','drainage'].includes($('intervention').value);
 $('volume').value=pericardial?200:500;$('rate').value=pericardial?200:10000/60;
 updateQuestion();
});
$('export').addEventListener('click',()=>{if(!exportRows.length)return;const keys=Object.keys(exportRows[0]);const csv=keys.join(',')+'\n'+exportRows.map(row=>keys.map(k=>Number.isFinite(row[k])?row[k].toFixed(5):'').join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='circulation-lab-experiment.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener('resize',draw);
makeBaseline();setupMetrics();capture();updateMetrics();draw();requestAnimationFrame(frame);
