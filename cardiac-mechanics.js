// Active chamber law documented in SimBioSys lvsyst.htm and supported by
// recovered routine 0x432b50. This pure equation does not prescribe activation
// timing, autonomic gains, pressure references, or the circulation topology.
// Units: mL, mmHg, mmHg/mL (a1), mmHg/mL² (a2). Activation is dimensionless.
export function activeChamberPressure(volume, activation, {a1, a2, vdMax, vdMin}) {
  const vd = vdMax + (vdMin - vdMax) * activation;
  const u = volume - vd;
  return activation * (a1 + a2 * u) * u;
}
