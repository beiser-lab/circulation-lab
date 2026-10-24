// One recorded sample supplies both charts; retain beat identity during transients.
export function plotSample(state) {
  return Object.fromEntries(['time','beatId','arterialPressure','lvPressure','raPressure',
    'lvVolume','lvTransmuralPressure','pericardialPressure'].map(key=>[key,state[key]]));
}
export function pvPoints(samples, beatId, transmural=false) {
  return samples.filter(s=>s.beatId===beatId).map(s=>({x:s.lvVolume,
    y:transmural?s.lvTransmuralPressure:s.lvPressure}));
}
export const GUYTON_PRA_MAX=20;
