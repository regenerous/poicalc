/**
 * Point-mass trajectory with G1 drag, sight height, and a zero.
 * Flat fire: height is measured from the line of sight, and gravity
 * is perpendicular to that line. No wind.
 *
 * G1 Cd versus Mach is the standard projectile table (McCoy,
 * Modern Exterior Ballistics). Atmosphere is 15°C, 1013.25 mbar, 78% RH.
 */

const G1 = [
  [0.0, 0.2629], [0.05, 0.2558], [0.1, 0.2487], [0.15, 0.2413], [0.2, 0.2344],
  [0.25, 0.2278], [0.3, 0.2214], [0.35, 0.2155], [0.4, 0.2104], [0.45, 0.2061],
  [0.5, 0.2032], [0.55, 0.202], [0.6, 0.2034], [0.7, 0.2165], [0.725, 0.223],
  [0.75, 0.2313], [0.775, 0.2417], [0.8, 0.2546], [0.825, 0.2706], [0.85, 0.2901],
  [0.875, 0.3136], [0.9, 0.3415], [0.925, 0.3734], [0.95, 0.4084], [0.975, 0.4448],
  [1.0, 0.4805], [1.025, 0.5136], [1.05, 0.5427], [1.075, 0.5677], [1.1, 0.5883],
  [1.125, 0.6053], [1.15, 0.6191], [1.2, 0.6393], [1.25, 0.6518], [1.3, 0.6589],
  [1.35, 0.6621], [1.4, 0.6625], [1.45, 0.6607], [1.5, 0.6573], [1.55, 0.6528],
  [1.6, 0.6474], [1.65, 0.6413], [1.7, 0.6347], [1.75, 0.628], [1.8, 0.621],
  [1.85, 0.6141], [1.9, 0.6072], [1.95, 0.6003], [2.0, 0.5934], [2.05, 0.5867],
  [2.1, 0.5804], [2.15, 0.5743], [2.2, 0.5685], [2.25, 0.563], [2.3, 0.5577],
  [2.35, 0.5527], [2.4, 0.5481], [2.45, 0.5438], [2.5, 0.5397], [2.6, 0.5325],
  [2.7, 0.5264], [2.8, 0.5211], [2.9, 0.5168], [3.0, 0.5133], [3.1, 0.5105],
  [3.2, 0.5084], [3.3, 0.5067], [3.4, 0.5054], [3.5, 0.504], [3.6, 0.503],
  [3.7, 0.5022], [3.8, 0.5016], [3.9, 0.501], [4.0, 0.5006], [4.2, 0.4998],
  [4.4, 0.4995], [4.6, 0.4992], [4.8, 0.499], [5.0, 0.4988],
];

const T_K = 288.15;
const P_PA = 101325;
const ES_PA = 611.21 * Math.exp((18.678 - (T_K - 273.15) / 234.5) * (T_K - 273.15) / (257.14 + (T_K - 273.15)));
const VAPOR_PA = 0.78 * ES_PA;
const RHO = (P_PA - VAPOR_PA) / (287.058 * T_K) + VAPOR_PA / (461.495 * T_K);
const SOUND = Math.sqrt(1.4 * 287.058 * T_K);
const G = 9.80665;
const BC_TO_SI = 703.0695796391593;
const DRAG_K = (Math.PI / 8) * RHO / BC_TO_SI;
const DT = 0.0004;
const YARD = 0.9144;
const INCH = 0.0254;

function cdG1(mach) {
  if (mach <= G1[0][0]) return G1[0][1];
  const last = G1[G1.length - 1];
  if (mach >= last[0]) return last[1];
  let lo = 0;
  let hi = G1.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (G1[mid][0] <= mach) lo = mid;
    else hi = mid;
  }
  const [m0, c0] = G1[lo];
  const [m1, c1] = G1[hi];
  const t = (mach - m0) / (m1 - m0);
  return c0 + t * (c1 - c0);
}

function accel(vx, vy, bc) {
  const v = Math.hypot(vx, vy) || 1e-9;
  const a = (DRAG_K * v * v * cdG1(v / SOUND)) / bc;
  return [-a * (vx / v), -a * (vy / v) - G];
}

function step(s, bc) {
  const a1 = accel(s.vx, s.vy, bc);
  const k1x = s.vx;
  const k1y = s.vy;
  const a2 = accel(s.vx + a1[0] * DT * 0.5, s.vy + a1[1] * DT * 0.5, bc);
  const k2x = s.vx + a1[0] * DT * 0.5;
  const k2y = s.vy + a1[1] * DT * 0.5;
  const a3 = accel(s.vx + a2[0] * DT * 0.5, s.vy + a2[1] * DT * 0.5, bc);
  const k3x = s.vx + a2[0] * DT * 0.5;
  const k3y = s.vy + a2[1] * DT * 0.5;
  const a4 = accel(s.vx + a3[0] * DT, s.vy + a3[1] * DT, bc);
  const k4x = s.vx + a3[0] * DT;
  const k4y = s.vy + a3[1] * DT;
  return {
    x: s.x + (DT / 6) * (k1x + 2 * k2x + 2 * k3x + k4x),
    y: s.y + (DT / 6) * (k1y + 2 * k2y + 2 * k3y + k4y),
    vx: s.vx + (DT / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]),
    vy: s.vy + (DT / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]),
  };
}

function launch(speedFps, sightIn, angle) {
  const v = speedFps * 0.3048;
  return {
    x: 0,
    y: -sightIn * INCH,
    vx: v * Math.cos(angle),
    vy: v * Math.sin(angle),
  };
}

function mix(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    vx: a.vx + (b.vx - a.vx) * t,
    vy: a.vy + (b.vy - a.vy) * t,
  };
}

/** Height above the line of sight, in inches, at a distance in yards. */
export function heightAt(speedFps, bc, sightIn, angle, yards) {
  const target = yards * YARD;
  let s = launch(speedFps, sightIn, angle);
  let guard = 0;
  while (s.x < target && s.vx > 1 && guard++ < 2_000_000) {
    const n = step(s, bc);
    if (n.x >= target) {
      const t = (target - s.x) / (n.x - s.x || 1);
      return mix(s, n, t).y / INCH;
    }
    s = n;
  }
  return s.y / INCH;
}

function solveAngle(speedFps, bc, sightIn, zeroYd) {
  let lo = -0.03;
  let hi = 0.15;
  const hLo = heightAt(speedFps, bc, sightIn, lo, zeroYd);
  const hHi = heightAt(speedFps, bc, sightIn, hi, zeroYd);
  if (hHi < 0) return { angle: hi, zeroReached: false };
  if (hLo > 0) return { angle: lo, zeroReached: Math.abs(hLo) < 0.25 };
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const h = heightAt(speedFps, bc, sightIn, mid, zeroYd);
    if (h > 0) hi = mid;
    else lo = mid;
  }
  const angle = (lo + hi) / 2;
  const residual = heightAt(speedFps, bc, sightIn, angle, zeroYd);
  return { angle, zeroReached: Math.abs(residual) < 0.2 };
}

function fly(speedFps, bc, sightIn, angle, endYd) {
  const endM = endYd * YARD;
  const samples = [{ yd: 0, inches: -sightIn }];
  let s = launch(speedFps, sightIn, angle);
  let nextM = 1 * YARD;
  let guard = 0;
  while (s.x < endM && s.vx > 1 && guard++ < 2_000_000) {
    const n = step(s, bc);
    while (nextM <= n.x && nextM <= endM + 1e-9) {
      const t = (nextM - s.x) / (n.x - s.x || 1);
      const p = mix(s, n, Math.min(1, Math.max(0, t)));
      samples.push({ yd: p.x / YARD, inches: p.y / INCH });
      nextM += 1 * YARD;
    }
    s = n;
  }
  return samples;
}

function interpolate(samples, yards) {
  if (yards <= samples[0].yd) return samples[0].inches;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];
    if (yards <= next.yd) {
      const span = next.yd - prev.yd || 1;
      const t = (yards - prev.yd) / span;
      return prev.inches + (next.inches - prev.inches) * t;
    }
  }
  return samples[samples.length - 1].inches;
}

function findCrossings(samples) {
  let climbYd = null;
  let fallYd = null;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];
    if (next.yd < 0.5) continue;
    const dy = next.inches - prev.inches;
    if (climbYd == null && prev.inches < 0 && next.inches >= 0 && dy !== 0) {
      climbYd = prev.yd + (next.yd - prev.yd) * ((0 - prev.inches) / dy);
    } else if (climbYd != null && fallYd == null && prev.inches > 0 && next.inches <= 0 && dy !== 0) {
      fallYd = prev.yd + (next.yd - prev.yd) * ((0 - prev.inches) / dy);
      break;
    }
  }
  return { climbYd, fallYd };
}

/**
 * @param {{ speedFps: number, bc: number, sightIn: number, zeroYd: number, distanceYd: number }} input
 * @returns {{
 *   zeroReached: boolean,
 *   samples: {yd: number, inches: number}[],
 *   climbYd: number | null,
 *   fallYd: number | null,
 *   impactIn: number,
 *   reachYd: number,
 * }}
 */
export function solvePoi(input) {
  const speedFps = input.speedFps;
  const bc = input.bc;
  const sightIn = input.sightIn;
  const zeroYd = input.zeroYd;
  const distanceYd = input.distanceYd;
  const { angle, zeroReached } = solveAngle(speedFps, bc, sightIn, zeroYd);
  let endYd = Math.min(1500, Math.max(200, Math.max(distanceYd, zeroYd) * 3));
  let samples = fly(speedFps, bc, sightIn, angle, endYd);
  let crossings = findCrossings(samples);
  if (crossings.fallYd == null && endYd < 1500) {
    endYd = 1500;
    samples = fly(speedFps, bc, sightIn, angle, endYd);
    crossings = findCrossings(samples);
  }
  const impactIn = interpolate(samples, distanceYd);
  const reach = Math.max(distanceYd, crossings.climbYd ?? 0, crossings.fallYd ?? 0, 25);
  return {
    zeroReached,
    samples: samples.filter((point) => point.yd <= reach + 2),
    climbYd: crossings.climbYd,
    fallYd: crossings.fallYd,
    impactIn,
    reachYd: reach,
  };
}
