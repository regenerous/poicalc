import { solvePoi } from "./ballistics.js";
import { FPS_PER_INCH, PRESETS, muzzleFps, presetById } from "./presets.js";
import { VERSION } from "./version.js";

const KEY = "poicalc.setup";
const GRAIN = 0.06479891;
const RING_STEPS = [4, 6, 8, 10, 12, 16, 20, 30, 40, 60, 80, 120, 200, 400];
const CUSTOM_LIMIT = 40;
const MAX_YD = 500;

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  units: "imperial",
  theme: "dark",
  presetId: "tula223",
  customId: null,
  customAmmo: [],
  barrelIn: 16,
  caliber: ".223 Rem",
  weightGr: 55,
  bc: 0.255,
  speedOverrideFps: null,
  sightIn: 1.93,
  zeroYd: 50,
  paperYd: 50,
  closeYd: 5,
  farYd: 100,
  plotCustom: false,
  plotMaxYd: 100,
};

let state = loadState();
let formDirty = false;

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, customAmmo: [] };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS, customAmmo: [] };
  }
}

function sanitizeCustom(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (out.length >= CUSTOM_LIMIT) break;
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.slice(0, 40) : "";
    const caliber = typeof item.caliber === "string" ? item.caliber.trim().slice(0, 40) : "";
    if (!id.startsWith("c-") || !caliber || seen.has(id)) continue;
    const weightGr = clampNum(item.weightGr, 15, 500, null);
    const speedFps = clampNum(item.speedFps, 300, 4500, null);
    let bcG1 = null;
    if (!(item.bcG1 == null || item.bcG1 === "")) {
      bcG1 = clampNum(item.bcG1, 0.05, 1.5, null);
      if (bcG1 == null) continue;
    }
    const barrelIn = clampNum(item.barrelIn, 2, 32, DEFAULTS.barrelIn);
    if (weightGr == null || speedFps == null) continue;
    const brand = typeof item.brand === "string" ? item.brand.trim().slice(0, 48) : "";
    const model = typeof item.model === "string" ? item.model.trim().slice(0, 48) : "";
    const upc = typeof item.upc === "string" ? item.upc.replace(/\D/g, "").slice(0, 14) : "";
    seen.add(id);
    out.push({ id, caliber, weightGr, speedFps, bcG1, barrelIn, brand, model, upc });
  }
  return out;
}

function sanitize(data) {
  const next = { ...DEFAULTS, customAmmo: [] };
  if (data.units === "metric" || data.units === "imperial") next.units = data.units;
  next.theme = data.theme === "light" ? "light" : "dark";
  if (PRESETS.some((preset) => preset.id === data.presetId)) next.presetId = data.presetId;
  next.customAmmo = sanitizeCustom(data.customAmmo);
  if (typeof data.customId === "string" && next.customAmmo.some((item) => item.id === data.customId)) {
    next.customId = data.customId;
  }
  next.barrelIn = clampNum(data.barrelIn, 2, 32, DEFAULTS.barrelIn);
  next.sightIn = clampNum(data.sightIn, 0, 6, DEFAULTS.sightIn);
  next.zeroYd = clampNum(data.zeroYd, 5, MAX_YD, DEFAULTS.zeroYd);
  next.paperYd = clampNum(data.paperYd, 5, MAX_YD, next.zeroYd);
  let far = clampNum(data.farYd, 5, MAX_YD, null);
  let close = clampNum(data.closeYd, 5, MAX_YD, null);
  if (far == null) far = clampNum(data.distanceYd, 5, MAX_YD, DEFAULTS.farYd);
  if (close == null) close = DEFAULTS.closeYd;
  if (close === 100 && far === 300) {
    close = DEFAULTS.closeYd;
    far = DEFAULTS.farYd;
  }
  if (close > far) [close, far] = [far, close];
  if (far - close < 1) {
    if (close + 1 <= MAX_YD) far = close + 1;
    else close = far - 1;
  }
  next.closeYd = close;
  next.farYd = far;
  const savedPlotMax =
    data.plotMaxYd == null || data.plotMaxYd === ""
      ? null
      : clampNum(data.plotMaxYd, 5, MAX_YD, null);
  if (data.plotCustom === true || data.plotCustom === false) next.plotCustom = data.plotCustom;
  else next.plotCustom = savedPlotMax != null;
  next.plotMaxYd = savedPlotMax == null ? 100 : savedPlotMax;
  next.weightGr = clampNum(data.weightGr, 15, 500, DEFAULTS.weightGr);
  next.bc = data.bc == null || data.bc === "" ? null : clampNum(data.bc, 0.05, 1.5, null);
  if (typeof data.caliber === "string" && data.caliber.trim()) next.caliber = data.caliber.slice(0, 40);
  if (data.speedOverrideFps == null || next.customId) next.speedOverrideFps = null;
  else next.speedOverrideFps = clampNum(data.speedOverrideFps, 300, 4500, null);
  if (next.customId) {
    const custom = next.customAmmo.find((item) => item.id === next.customId);
    next.caliber = custom.caliber;
    next.weightGr = custom.weightGr;
    next.bc = custom.bcG1;
  } else if (stillOldDefaultLoad(data)) {
    const tula = presetById("tula223");
    next.presetId = tula.id;
    next.caliber = tula.caliber;
    next.weightGr = tula.weightGr;
    next.bc = tula.bcG1;
    next.speedOverrideFps = null;
  }
  return next;
}

function stillOldDefaultLoad(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.customId === "string" && data.customId) return false;
  if (data.presetId !== "fed") return false;
  if (typeof data.caliber === "string" && data.caliber.trim() && data.caliber.trim() !== "5.56 NATO") return false;
  if (!sameSavedNumber(data.weightGr, 55)) return false;
  if (!sameSavedNumber(data.bc, 0.246)) return false;
  return data.speedOverrideFps == null || data.speedOverrideFps === "";
}

function sameSavedNumber(value, expected) {
  if (value == null || value === "") return true;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n - expected) < 0.0005;
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or a full store: the page still calculates */
  }
}

function metric() {
  return state.units === "metric";
}

function distanceBounds() {
  return metric() ? [5 / 0.9144, MAX_YD] : [5, MAX_YD];
}

function zeroBounds() {
  return metric() ? [5 / 0.9144, MAX_YD] : [5, MAX_YD];
}

function gapYd() {
  return metric() ? 1 / 0.9144 : 1;
}

function displayDistance(yards) {
  return Math.round(metric() ? yards * 0.9144 : yards);
}

function yardsFromDisplay(shown) {
  return metric() ? shown / 0.9144 : shown;
}

function separateDistances() {
  const [min, max] = distanceBounds();
  const gap = gapYd();
  let close = clampNum(state.closeYd, min, max, DEFAULTS.closeYd);
  let far = clampNum(state.farYd, min, max, DEFAULTS.farYd);
  if (close > far) [close, far] = [far, close];
  if (far - close < gap) {
    if (close + gap <= max) far = close + gap;
    else close = far - gap;
  }
  state.closeYd = clampNum(close, min, max - gap, close);
  state.farYd = clampNum(far, state.closeYd + gap, max, far);
}

function assignClose(yards) {
  if (yards > state.farYd) {
    const previousFar = state.farYd;
    state.farYd = yards;
    state.closeYd = previousFar;
    separateDistances();
    return;
  }
  const [min, max] = distanceBounds();
  const ceiling = Math.min(max - gapYd(), state.farYd - gapYd());
  state.closeYd = clampNum(yards, min, ceiling, state.closeYd);
}

function assignFar(yards) {
  if (yards < state.closeYd) {
    const previousClose = state.closeYd;
    state.closeYd = yards;
    state.farYd = previousClose;
    separateDistances();
    return;
  }
  const [min, max] = distanceBounds();
  const floor = Math.max(min + gapYd(), state.closeYd + gapYd());
  state.farYd = clampNum(yards, floor, max, state.farYd);
}

function activeCustom() {
  if (!state.customId) return null;
  return state.customAmmo.find((item) => item.id === state.customId) ?? null;
}

function usedFps() {
  const custom = activeCustom();
  if (custom) return muzzleFps(custom, state.barrelIn, null);
  return muzzleFps(presetById(state.presetId), state.barrelIn, state.speedOverrideFps);
}

function formatDistanceNumber(yards) {
  const n = metric() ? yards * 0.9144 : yards;
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function distanceUnit() {
  return metric() ? "m" : "yd";
}

function formatDrop(inches) {
  const abs = Math.abs(inches);
  if (metric()) {
    const mm = abs * 25.4;
    return mm >= 10 ? `${Math.round(mm)} mm` : `${mm.toFixed(1)} mm`;
  }
  return `${abs.toFixed(1)} inches`;
}

function formatSignedDrop(inches) {
  if (Math.abs(inches) < 0.05) return formatDrop(0);
  return `${inches < 0 ? "−" : "+"}${formatDrop(inches)}`;
}

function formatSpeed(fps) {
  const n = metric() ? fps * 0.3048 : fps;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function speedUnit() {
  return metric() ? "m/s" : "ft/s";
}

function formatWeight(grains) {
  if (metric()) return (grains * GRAIN).toFixed(1);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(grains));
}

function weightUnit() {
  return metric() ? "g" : "gr";
}

function formatBarrel(inches) {
  if (metric()) return String(Math.round(inches * 25.4));
  const n = Math.round(inches * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatSight(inches) {
  if (metric()) return (inches * 25.4).toFixed(1);
  const text = inches.toFixed(2);
  return text.replace(/0$/, "").replace(/\.0$/, "");
}

function formatBc(bc) {
  if (bc == null || !Number.isFinite(bc)) return "";
  return bc.toFixed(3).replace(/0$/, "").replace(/0$/, "");
}

function bcDiffers(left, right) {
  if (left == null && right == null) return false;
  if (left == null || right == null) return true;
  return Math.abs(left - right) > 0.0005;
}

function lengthUnit() {
  return metric() ? "mm" : "in";
}

function setIfIdle(id, value) {
  const el = $(id);
  if (document.activeElement === el) return;
  el.value = value;
}

function ringSize(absInches) {
  if (metric()) {
    const steps = [100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 12000];
    const need = Math.max(absInches * 25.4 * 1.2, 100);
    const chosen = steps.find((step) => step >= need) ?? steps[steps.length - 1];
    return { inches: chosen / 25.4, label: `${new Intl.NumberFormat("en-US").format(chosen)} mm` };
  }
  const need = Math.max(absInches * 1.2, 2);
  const chosen = RING_STEPS.find((step) => step >= need) ?? RING_STEPS[RING_STEPS.length - 1];
  return { inches: chosen, label: `${chosen} inches` };
}

function smoothPath(points) {
  const first = points[0];
  if (!first) return "";
  const parts = [`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    parts.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    );
  }
  return parts.join(" ");
}

function inchesAt(samples, yards) {
  if (!samples.length) return 0;
  if (yards <= samples[0].yd) return samples[0].inches;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];
    if (yards <= next.yd) {
      const t = (yards - prev.yd) / (next.yd - prev.yd || 1);
      return prev.inches + (next.inches - prev.inches) * t;
    }
  }
  return samples[samples.length - 1].inches;
}

function thinSamples(samples, yards) {
  const step = Math.max(1, Math.ceil(samples.length / 70));
  const out = [];
  for (let i = 0; i < samples.length; i += step) out.push(samples[i]);
  const last = samples[samples.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  for (const yd of yards) {
    if (yd == null) continue;
    out.push({ yd, inches: inchesAt(samples, yd) });
  }
  out.sort((a, b) => a.yd - b.yd);
  const unique = [];
  for (const point of out) {
    const prev = unique[unique.length - 1];
    if (prev && Math.abs(prev.yd - point.yd) < 0.05) unique[unique.length - 1] = point;
    else unique.push(point);
  }
  return unique;
}

function aimWord(inches) {
  if (inches < -0.05) return "below aim";
  if (inches > 0.05) return "above aim";
  return "on aim";
}

function paperOffsetText(inches, sameDistance) {
  if (sameDistance) return "On aim";
  if (!Number.isFinite(inches)) return "Type a G1 BC";
  if (Math.abs(inches) < 0.05) return "On aim";
  return `${formatDrop(inches)} ${inches < 0 ? "low" : "high"}`;
}

function inchesOnPath(poi, yards) {
  const last = poi.samples[poi.samples.length - 1];
  if (last && yards <= last.yd + 0.2) return inchesAt(poi.samples, yards);
  return solvePoi({
    speedFps: usedFps(),
    bc: state.bc,
    sightIn: state.sightIn,
    zeroYd: state.zeroYd,
    distanceYd: yards,
  }).impactIn;
}

function drawTarget(closeIn, farIn) {
  const svg = $("target");
  const size = 208;
  const c = size / 2;
  const margin = 8;
  const outer = c - margin;
  const ring = ringSize(Math.max(Math.abs(closeIn), Math.abs(farIn), 0.1));
  const yOf = (inches) => c - Math.max(-1, Math.min(1, inches / ring.inches)) * outer;
  const closeY = yOf(closeIn);
  const farY = yOf(farIn);
  const overlap = Math.abs(closeY - farY) < 14;
  const closeX = overlap ? c + 12 : c;
  const farX = overlap ? c - 12 : c;
  const unit = distanceUnit();
  const closeText = `${formatDistanceNumber(state.closeYd)} ${unit}`;
  const farText = `${formatDistanceNumber(state.farYd)} ${unit}`;
  const splitSides = Math.abs(closeY - farY) < 22;
  const label = (text, x, y, kind, side) => {
    const anchor = side === "left" ? "end" : "start";
    const textY = Math.min(size - 6, Math.max(14, y - 10));
    const cls = kind === "far" ? "target-label far-label" : "target-label";
    return `<text class="${cls}" data-distance="${kind}" x="${x.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="${anchor}">${text}</text>`;
  };
  const rings = [1, 0.8, 0.6, 0.4, 0.2]
    .map((scale, index) => {
      const cls = index % 2 === 0 ? "ring-a" : "ring-b";
      return `<circle class="${cls}" cx="${c}" cy="${c}" r="${(scale * outer).toFixed(1)}" stroke-width="1"></circle>`;
    })
    .join("");
  svg.setAttribute(
    "aria-label",
    `Target. Close target distance at ${closeText} is ${formatDrop(closeIn)} ${aimWord(closeIn)}. Far target distance at ${farText} is ${formatDrop(farIn)} ${aimWord(farIn)}. The outer ring is ${ring.label} from center.`,
  );
  svg.innerHTML = `
    ${rings}
    <circle class="bull" cx="${c}" cy="${c}" r="${(0.08 * outer).toFixed(1)}"></circle>
    <line class="hair" x1="${c - outer}" y1="${c}" x2="${c + outer}" y2="${c}"></line>
    <line class="hair" x1="${c}" y1="${c - outer}" x2="${c}" y2="${c + outer}"></line>
    <circle class="dot-halo" cx="${farX}" cy="${farY.toFixed(1)}" r="8"></circle>
    <circle class="dot-far" data-mark="target-far" data-distance="far" cx="${farX}" cy="${farY.toFixed(1)}" r="6"></circle>
    <circle class="dot-halo" cx="${closeX}" cy="${closeY.toFixed(1)}" r="8"></circle>
    <circle class="dot-close" data-mark="target-close" data-distance="close" cx="${closeX}" cy="${closeY.toFixed(1)}" r="6"></circle>
    ${label(formatSignedDrop(farIn), splitSides ? farX - 12 : farX + 12, farY, "far", splitSides ? "left" : "right")}
    ${label(formatSignedDrop(closeIn), closeX + 12, closeY, "close", "right")}
  `;
  $("target-caption").textContent = `Center is the aim point. Outer ring is ${ring.label}.`;
}

function plotReach(poi) {
  return Math.max(poi ? poi.reachYd : 0, state.farYd, state.closeYd, 25);
}

function plotXMax(poi) {
  if (!state.plotCustom || state.plotMaxYd == null) return plotReach(poi) * 1.06;
  return state.plotMaxYd;
}

function extremaInRange(poi) {
  const xMax = plotXMax(poi);
  const shown = poi.samples.filter((point) => point.yd <= xMax);
  const inRange = shown.length ? shown : poi.samples;
  let low = inRange[0];
  let high = inRange[0];
  for (const point of inRange) {
    if (point.inches < low.inches) low = point;
    if (point.inches > high.inches) high = point;
  }
  return low && high ? { min: low, max: high } : null;
}

function onAimInches(inches) {
  return Math.abs(inches) < 0.05;
}

function drawPath(poi) {
  const svg = $("path");
  const width = 356;
  const height = 156;
  const xMax = plotXMax(poi);
  const onAxis = (yd) => yd <= xMax + 0.05;
  const xOfYard = (yd) => 12 + (yd / xMax) * (width - 24);
  const marksClose =
    poi.climbYd != null && poi.fallYd != null && Math.abs(xOfYard(poi.climbYd) - xOfYard(poi.fallYd)) < 108;
  const pad = { l: 12, r: 12, t: marksClose ? 46 : 30, b: 22 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const shown = poi.samples.filter((point) => point.yd <= xMax);
  let yMin = 0;
  let yMax = 0;
  for (const point of shown) {
    yMin = Math.min(yMin, point.inches);
    yMax = Math.max(yMax, point.inches);
  }
  const closeIn = inchesAt(poi.samples, state.closeYd);
  const farIn = inchesAt(poi.samples, state.farYd);
  yMin = Math.min(yMin, -state.sightIn);
  if (onAxis(state.closeYd)) {
    yMin = Math.min(yMin, closeIn);
    yMax = Math.max(yMax, closeIn);
  }
  if (onAxis(state.farYd)) {
    yMin = Math.min(yMin, farIn);
    yMax = Math.max(yMax, farIn);
  }
  const span = Math.max(6, (yMax - yMin) * 1.35);
  const mid = (yMax + yMin) / 2;
  yMin = mid - span / 2;
  yMax = mid + span / 2;
  const xOf = (yd) => pad.l + (yd / xMax) * plotW;
  const yOf = (inches) => pad.t + ((yMax - inches) / (yMax - yMin)) * plotH;
  const ends = extremaInRange(poi);
  const curve = thinSamples(
    shown,
    [poi.climbYd, poi.fallYd, state.closeYd, state.farYd, ends?.min.yd, ends?.max.yd].filter((yd) => onAxis(yd)),
  ).map((point) => ({
    x: xOf(point.yd),
    y: yOf(point.inches),
  }));
  const closeX = xOf(state.closeYd);
  const closeY = yOf(closeIn);
  const farX = xOf(state.farYd);
  const farY = yOf(farIn);
  const losY = yOf(0);

  const marks = [
    poi.climbYd == null ? null : { kind: "climb", yd: poi.climbYd, verb: "climb" },
    poi.fallYd == null ? null : { kind: "fall", yd: poi.fallYd, verb: "fall" },
  ].filter((mark) => mark && onAxis(mark.yd));
  const placed = marks.map((mark) => {
    const nearImpact =
      Math.hypot(xOf(mark.yd) - closeX, yOf(0) - closeY) < 10 ||
      Math.hypot(xOf(mark.yd) - farX, yOf(0) - farY) < 10;
    return {
      ...mark,
      x: xOf(mark.yd),
      y: yOf(0),
      r: nearImpact ? 7 : 3.5,
    };
  });
  const extrema = [];
  if (ends) {
    const seen = new Set();
    for (const item of [
      { kind: "min", yd: ends.min.yd, inches: ends.min.inches },
      { kind: "max", yd: ends.max.yd, inches: ends.max.inches },
    ]) {
      if (!onAxis(item.yd)) continue;
      const key = item.yd.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      const x = xOf(item.yd);
      const y = yOf(item.inches);
      const crowded =
        Math.hypot(x - closeX, y - closeY) < 10 ||
        Math.hypot(x - farX, y - farY) < 10 ||
        placed.some((mark) => Math.hypot(x - mark.x, y - mark.y) < 10);
      if (crowded) continue;
      extrema.push({ ...item, x, y, r: 3.5 });
    }
  }

  const marked = [
    onAxis(state.closeYd)
      ? { kind: "close", role: "close", yd: state.closeYd, inches: closeIn, x: closeX, y: closeY, r: 4.5 }
      : null,
    onAxis(state.farYd)
      ? { kind: "far", role: "far", yd: state.farYd, inches: farIn, x: farX, y: farY, r: 4.5 }
      : null,
    ...placed.map((mark) => ({ kind: mark.kind, role: "", yd: mark.yd, inches: 0, x: mark.x, y: mark.y, r: mark.r })),
    ...extrema.map((mark) => ({ kind: mark.kind, role: "", yd: mark.yd, inches: mark.inches, x: mark.x, y: mark.y, r: mark.r })),
  ].filter(Boolean);
  const axisY = height - pad.b;

  const unit = distanceUnit();
  const bits = [];
  if (poi.climbYd != null) bits.push(`climbs through the line of sight at ${formatDistanceNumber(poi.climbYd)} ${unit}`);
  if (poi.fallYd != null) bits.push(`falls back through it at ${formatDistanceNumber(poi.fallYd)} ${unit}`);
  svg.setAttribute(
    "aria-label",
    `Side view. The bullet ${bits.join(" and ") || "stays off the line of sight"}. Close target distance at ${formatDistanceNumber(state.closeYd)} ${unit} is ${formatSignedDrop(closeIn)}. Far target distance at ${formatDistanceNumber(state.farYd)} ${unit} is ${formatSignedDrop(farIn)}.`,
  );

  const dots = [
    { x: xOf(0), y: yOf(-state.sightIn), r: 4 },
    ...marked.map((mark) => ({ x: mark.x, y: mark.y, r: mark.r + 1 })),
  ];
  const textWidth = (text) => text.length * 5.7 + 2;
  const boxFor = (x, y, wide, anchor) => {
    const left = anchor === "start" ? x : anchor === "end" ? x - wide : x - wide / 2;
    return { left, right: left + wide, top: y - 9, bottom: y + 2 };
  };
  const overlaps = (a, b) => a.left < b.right + 3 && a.right > b.left - 3 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
  const hitsDot = (box) =>
    dots.some((dot) => {
      const nx = Math.max(box.left, Math.min(dot.x, box.right));
      const ny = Math.max(box.top, Math.min(dot.y, box.bottom));
      return (nx - dot.x) ** 2 + (ny - dot.y) ** 2 <= (dot.r + 2) ** 2;
    });
  const gapTo = (box, x, y) => {
    const px = Math.max(box.left, Math.min(x, box.right));
    const py = Math.max(box.top, Math.min(y, box.bottom));
    return Math.hypot(x - px, y - py);
  };
  const hitsCurve = (box, label) => {
    const pad = 1;
    for (let i = 0; i < curve.length; i += 1) {
      const point = curve[i];
      if (Math.hypot(point.x - label.x, point.y - label.y) <= label.r + 2) continue;
      if (
        point.x >= box.left - pad &&
        point.x <= box.right + pad &&
        point.y >= box.top - pad &&
        point.y <= box.bottom + pad
      ) {
        return true;
      }
    }
    return false;
  };
  const hitsLine = (box) => box.top < losY + 4 && box.bottom > losY - 4;
  const placeOffsetLabel = (label, taken) => {
    const wide = textWidth(label.text);
    const low = label.inches < -0.05;
    const beside = label.r + 4;
    const yMid = label.y + 4;
    const candidates = [];
    const add = (x, y, anchor) => candidates.push([x, y, anchor]);
    if (low) {
      add(label.x + beside, yMid, "start");
      add(label.x - beside, yMid, "end");
      for (const row of [8, 20, 32]) add(label.x + 2, label.y + beside + row, "start");
    } else {
      add(label.x, label.y - beside - 8, "middle");
      add(label.x + beside, label.y - beside - 6, "start");
      add(label.x - beside, label.y - beside - 6, "end");
      add(label.x + beside, yMid, "start");
      add(label.x - beside, yMid, "end");
      add(label.x + 2, label.y + beside + 8, "start");
    }
    const accept = (x, y, anchor, limit) => {
      const box = boxFor(x, y, wide, anchor);
      if (box.top < 3 || box.bottom > height - 16 || box.left < 2 || box.right > width - 2) return null;
      const gap = gapTo(box, label.x, label.y);
      if (gap > limit) return null;
      const closerToOther = dots.some(
        (dot) => Math.hypot(dot.x - label.x, dot.y - label.y) > 2 && gapTo(box, dot.x, dot.y) + 2 < gap,
      );
      if (closerToOther || hitsLine(box) || hitsDot(box) || hitsCurve(box, label)) return null;
      if (taken.some((item) => overlaps(box, item))) return null;
      return { x, y, anchor, box };
    };
    for (const [x, y, anchor] of candidates) {
      const spot = accept(x, y, anchor, label.r + 16);
      if (spot) return spot;
    }
    for (const row of [8, 20, 32]) {
      const y = low ? label.y + beside + row : label.y - beside - row;
      const spot = accept(label.x + 2, y, "start", label.r + 28);
      if (spot) return spot;
    }
    const y = low ? label.y + beside + 8 : label.y - beside - 8;
    return { x: label.x + beside, y, anchor: "start", box: boxFor(label.x + beside, y, wide, "start") };
  };
  const offsetLabels = marked
    .filter((mark) => !onAimInches(mark.inches))
    .map((mark) => ({
      kind: mark.kind,
      cls: mark.role === "far" ? "cross-label far-label" : "cross-label",
      text: formatSignedDrop(mark.inches),
      x: mark.x,
      y: mark.y,
      r: mark.r,
      inches: mark.inches,
      attr: mark.kind === "min" || mark.kind === "max" ? "data-extreme" : "data-distance",
    }))
    .sort((a, b) => b.x - a.x);
  const taken = [];
  const placedLabels = offsetLabels.map((label) => {
    const spot = placeOffsetLabel(label, taken);
    taken.push(spot.box);
    return { label, spot };
  });
  const labelSvg = placedLabels
    .map(({ label, spot }) => `<text class="${label.cls}" ${label.attr}="${label.kind}" x="${spot.x.toFixed(1)}" y="${spot.y.toFixed(1)}" text-anchor="${spot.anchor}">${label.text}</text>`)
    .join("");
  const leaderSvg = placedLabels
    .map(({ label, spot }) => {
      const box = spot.box;
      const px = Math.max(box.left, Math.min(label.x, box.right));
      const py = Math.max(box.top, Math.min(label.y, box.bottom));
      const dx = label.x - px;
      const dy = label.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist < 1 || dist > 18) return "";
      const stop = label.r + 1.5;
      const x2 = label.x - (dx / dist) * Math.min(stop, dist - 0.5);
      const y2 = label.y - (dy / dist) * Math.min(stop, dist - 0.5);
      return `<line class="leader" data-leader="${label.kind}" x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"></line>`;
    })
    .join("");
  const aimText = "Aim Point";
  const aimWide = textWidth(aimText);
  const aimCandidates = [
    { x: width - 10, y: losY - 2, anchor: "end" },
    { x: pad.l + 4, y: losY - 2, anchor: "start" },
    { x: width - 10, y: losY + 14, anchor: "end" },
    { x: pad.l + 4, y: losY + 14, anchor: "start" },
    { x: Math.min(width - 12, farX + 28), y: losY - 2, anchor: "start" },
    { x: Math.max(12, closeX - 28), y: losY - 2, anchor: "end" },
  ];
  let aimSpot = { x: width - 10, y: Math.max(12, losY - 2), anchor: "end" };
  for (const candidate of aimCandidates) {
    const box = boxFor(candidate.x, candidate.y, aimWide, candidate.anchor);
    if (box.top < 3 || box.bottom > height - 16 || box.left < 2 || box.right > width - 2) continue;
    if (hitsDot(box) || taken.some((item) => overlaps(box, item))) continue;
    aimSpot = candidate;
    break;
  }
  const aimSvg = `<text class="aim-label" data-aim="line" x="${aimSpot.x.toFixed(1)}" y="${aimSpot.y.toFixed(1)}" text-anchor="${aimSpot.anchor}">${aimText}</text>`;

  const markSvg = [
    ...placed.map(
      (mark) =>
        `<circle class="mark-open" data-mark="${mark.kind}" data-crossing="${mark.kind}" cx="${mark.x.toFixed(1)}" cy="${mark.y.toFixed(1)}" r="${mark.r}"></circle>`,
    ),
    ...extrema.map(
      (mark) =>
        `<circle class="mark-open" data-mark="${mark.kind}" data-extreme="${mark.kind}" cx="${mark.x.toFixed(1)}" cy="${mark.y.toFixed(1)}" r="${mark.r}"></circle>`,
    ),
  ].join("");

  const rawTicks = [{ yd: 0, x: pad.l, role: "", kind: "zero" }];
  for (const mark of marked) rawTicks.push({ yd: mark.yd, x: mark.x, role: mark.role, kind: mark.kind });
  if (state.plotCustom && state.plotMaxYd != null) {
    const endX = xOf(xMax);
    const crowded = rawTicks.some((tick) => Math.abs(tick.x - endX) < 36);
    if (!crowded) rawTicks.push({ yd: xMax, x: endX, role: "", kind: "end" });
  }
  rawTicks.sort((a, b) => a.x - b.x);
  const ticks = [];
  for (const tick of rawTicks) {
    const prev = ticks[ticks.length - 1];
    if (prev && Math.abs(prev.x - tick.x) < 3) {
      if (!prev.role && tick.role) {
        prev.role = tick.role;
        prev.kind = tick.kind;
      }
      continue;
    }
    ticks.push({ ...tick });
  }
  const axisPlaced = [];
  const axisSvg = ticks
    .map((tick) => {
      const label = Math.abs(tick.yd) < 0.05 ? "0" : formatDistanceNumber(tick.yd);
      const wide = textWidth(label);
      let anchor = tick.kind === "zero" ? "start" : "middle";
      let x = tick.kind === "zero" ? pad.l : tick.x;
      let box = boxFor(x, height - 7, wide, anchor);
      const clash = () => axisPlaced.some((item) => overlaps(box, item));
      if (clash()) {
        anchor = "start";
        x = Math.min(width - 2, tick.x + 3);
        box = boxFor(x, height - 7, wide, anchor);
      }
      if (box.right > width - 2) {
        anchor = "end";
        x = width - 2;
        box = boxFor(x, height - 7, wide, anchor);
      }
      if (box.left < 2) {
        anchor = "start";
        x = 2;
        box = boxFor(x, height - 7, wide, anchor);
      }
      axisPlaced.push(box);
      const cls = tick.role === "far" ? "axis-far" : tick.role === "close" ? "axis-close" : "axis-label";
      const crossing = tick.kind === "climb" || tick.kind === "fall" ? ` data-crossing="${tick.kind}"` : "";
      return `<text class="${cls}" data-tick="${tick.kind}"${crossing} x="${x.toFixed(1)}" y="${height - 7}" text-anchor="${anchor}">${label}</text>`;
    })
    .join("");
  const tickLines = marked
    .map((mark) => {
      const y1 = Math.min(axisY - 1, mark.y + mark.r);
      if (axisY - y1 < 2) return "";
      const cls = mark.role === "far" ? "tick-line tick-line-far" : mark.role === "close" ? "tick-line tick-line-close" : "tick-line";
      return `<line class="${cls}" data-tick-line="${mark.kind}" x1="${mark.x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${mark.x.toFixed(1)}" y2="${axisY.toFixed(1)}"></line>`;
    })
    .join("");

  svg.innerHTML = `
    <rect class="chart-bg" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10"></rect>
    <line class="los" x1="${xOf(0).toFixed(1)}" y1="${losY.toFixed(1)}" x2="${xOf(xMax).toFixed(1)}" y2="${losY.toFixed(1)}" stroke-width="1.25" stroke-dasharray="4 3"></line>
    <path class="path-line" d="${smoothPath(curve)}"></path>
    ${tickLines}
    <circle class="mark-muzzle" cx="${xOf(0).toFixed(1)}" cy="${yOf(-state.sightIn).toFixed(1)}" r="2.5"></circle>
    ${markSvg}
    ${onAxis(state.farYd) ? `<circle class="mark-far" data-mark="far" data-distance="far" cx="${farX.toFixed(1)}" cy="${farY.toFixed(1)}" r="4.5"></circle>` : ""}
    ${onAxis(state.closeYd) ? `<circle class="mark-close" data-mark="close" data-distance="close" cx="${closeX.toFixed(1)}" cy="${closeY.toFixed(1)}" r="4.5"></circle>` : ""}
    ${leaderSvg}
    ${labelSvg}
    ${aimSvg}
    ${axisSvg}
  `;
}

function detailText(grains, fps, model) {
  const load = `${formatWeight(grains)} ${weightUnit()} · ${formatSpeed(fps)} ${speedUnit()}`;
  return model ? `${model} · ${load}` : load;
}

function xmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function publishedIds(preset) {
  const models = preset.models || [];
  const upcs = preset.upcs || [];
  const rows = [];
  if (models[0] || upcs[0]) rows.push({ model: models[0] || "", upc: upcs[0] || "" });
  for (let i = 1; i < Math.max(models.length, upcs.length); i += 1) {
    if (upcs[i]) rows.push({ model: models[i] || "", upc: upcs[i] });
  }
  return rows.length ? rows : [{ model: "", upc: "" }];
}

function loadsFor(brand, weight) {
  const grains = Number(weight);
  if (!brand || !Number.isFinite(grains)) return [];
  return PRESETS.filter((preset) => preset.line === brand && preset.weightGr === grains);
}

function boxSvg(preset) {
  const color = LINE_COLOR[preset.line] || "#3a3632";
  const label = xmlText(preset.line);
  const caliber = xmlText(preset.caliber);
  const weight = xmlText(`${preset.weightGr} gr`);
  return `<svg viewBox="0 0 160 104" role="img" aria-label="${label} ${caliber}">
    <rect x="2" y="6" width="156" height="92" rx="8" fill="${color}"/>
    <rect x="2" y="6" width="16" height="92" rx="8" fill="rgba(255,255,255,0.16)"/>
    <rect x="14" y="6" width="8" height="92" fill="${color}"/>
    <text x="30" y="34" fill="#fffdf8" font-size="14" font-family="sans-serif" font-weight="700">${label}</text>
    <text x="30" y="54" fill="#fffdf8" font-size="12" font-family="sans-serif">${caliber}</text>
    <text x="30" y="76" fill="#f3eadc" font-size="12" font-family="sans-serif">${weight}</text>
  </svg>`;
}

function customSvg(caliber) {
  const name = xmlText(caliber || "Custom");
  return `<svg viewBox="0 0 160 104" role="img" aria-label="Custom load">
    <rect x="2" y="6" width="156" height="92" rx="8" fill="#3a3632"/>
    <rect x="2" y="6" width="156" height="92" rx="8" fill="none" stroke="#c2bbb2" stroke-dasharray="5 4"/>
    <text x="18" y="42" fill="#fffdf8" font-size="14" font-family="sans-serif" font-weight="700">Custom</text>
    <text x="18" y="64" fill="#f3eadc" font-size="12" font-family="sans-serif">${name}</text>
  </svg>`;
}

function emptySvg() {
  return `<svg viewBox="0 0 160 104" role="img" aria-label="No box chosen">
    <rect x="2" y="6" width="156" height="92" rx="8" fill="none" stroke="#8f887f" stroke-dasharray="5 4"/>
  </svg>`;
}

function idLine(model, upc) {
  const line = document.createElement("span");
  line.className = "load-id-line";
  const modelEl = document.createElement("span");
  modelEl.className = "load-model";
  modelEl.textContent = model;
  const label = document.createElement("span");
  label.className = "load-upc-label";
  label.textContent = "UPC";
  const upcEl = document.createElement("span");
  upcEl.className = "load-upc";
  upcEl.textContent = upc || "";
  line.append(modelEl, label, upcEl);
  return line;
}

function faceCopy(preset) {
  const ids = document.createElement("span");
  ids.className = "load-ids";
  for (const row of publishedIds(preset)) {
    const model = row.model ? `${row.model} · ${preset.caliber}` : preset.caliber;
    ids.append(idLine(model, row.upc));
  }
  return ids;
}

function paintChoice(parent, preset, custom) {
  const art = document.createElement("span");
  art.className = "box-art";
  if (preset) {
    art.innerHTML = boxSvg(preset);
    parent.append(art, faceCopy(preset));
    return;
  }
  if (custom) {
    art.innerHTML = customSvg(custom.caliber);
    const ids = document.createElement("span");
    ids.className = "load-ids";
    ids.append(idLine(custom.model || custom.brand || custom.caliber || "Custom", custom.upc || ""));
    parent.append(art, ids);
    return;
  }
  art.innerHTML = emptySvg();
  const note = document.createElement("span");
  note.className = "load-placeholder";
  note.textContent = "Choose a box";
  parent.append(art, note);
}

function fillSelect(el, options, value) {
  const sig = `${value}::${options.map((option) => `${option.value}=${option.label}`).join("|")}`;
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.replaceChildren();
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    el.append(node);
  }
  el.value = value;
}

function renderPicker() {
  if (!picker.hold) {
    if (adding || state.customId) {
      picker.brand = "custom";
      picker.weight = "";
    } else {
      const current = presetById(state.presetId);
      picker.brand = current.line;
      picker.weight = String(current.weightGr);
    }
  }
  fillSelect(
    $("brand-pick"),
    [{ value: "custom", label: "Custom" }, ...catalogLines().map((name) => ({ value: name, label: name }))],
    picker.brand,
  );
  const weights = [...new Set(PRESETS.filter((preset) => preset.line === picker.brand).map((preset) => preset.weightGr))].sort(
    (a, b) => a - b,
  );
  fillSelect(
    $("weight-pick"),
    [
      { value: "", label: "Choose a weight" },
      ...weights.map((grains) => ({ value: String(grains), label: `${formatWeight(grains)} ${weightUnit()}` })),
    ],
    picker.weight,
  );
  $("weight-pick").disabled = !picker.brand;
  const matches = loadsFor(picker.brand, picker.weight);
  $("load-pick").disabled = matches.length === 0;
  const selected =
    !state.customId && !picker.hold && matches.some((preset) => preset.id === state.presetId)
      ? presetById(state.presetId)
      : null;
  const custom = state.customId && !picker.hold ? activeCustom() : null;
  const face = $("load-pick");
  face.replaceChildren();
  paintChoice(face, selected, custom);
  const menu = $("load-menu");
  menu.replaceChildren();
  for (const preset of matches) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = preset.id === selected?.id ? "load-option is-selected" : "load-option";
    option.role = "option";
    option.dataset.preset = preset.id;
    option.setAttribute("aria-selected", preset.id === selected?.id ? "true" : "false");
    paintChoice(option, preset, null);
    menu.append(option);
  }
  const showMenu = picker.menuOpen && matches.length > 0;
  menu.hidden = !showMenu;
  face.setAttribute("aria-expanded", showMenu ? "true" : "false");
}

const CALIBER_ORDER = [".22 lr", "9mm luger", ".223 rem", "5.56 nato", "7.62×39"];
let ammoOpen = null;

function ammoGroups() {
  const order = [];
  const map = new Map();
  const bucket = (caliber) => {
    const key = caliber.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { label: caliber.trim(), presets: [], customs: [] });
      order.push(key);
    }
    return map.get(key);
  };
  for (const preset of PRESETS) bucket(preset.caliber).presets.push(preset);
  for (const custom of state.customAmmo) bucket(custom.caliber).customs.push(custom);
  return order
    .map((key) => map.get(key))
    .sort((a, b) => {
      const rank = (label) => {
        const index = CALIBER_ORDER.indexOf(label.trim().toLowerCase());
        return index === -1 ? CALIBER_ORDER.length : index;
      };
      const bySize = rank(a.label) - rank(b.label);
      return bySize || a.label.localeCompare(b.label);
    });
}

function choiceButton({ name, detail, badge, selected, presetId, customId, label }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = selected ? "choice is-selected" : "choice";
  button.setAttribute("aria-pressed", selected ? "true" : "false");
  button.setAttribute("aria-label", label);
  if (presetId) button.dataset.preset = presetId;
  if (customId) button.dataset.custom = customId;
  const copy = document.createElement("span");
  copy.className = "choice-copy";
  const nameEl = document.createElement("span");
  nameEl.className = "choice-name";
  nameEl.textContent = name;
  const detailEl = document.createElement("span");
  detailEl.className = "choice-detail";
  detailEl.textContent = detail;
  copy.append(nameEl, detailEl);
  button.append(copy);
  if (badge) {
    const badgeEl = document.createElement("span");
    badgeEl.className = "badge";
    badgeEl.textContent = badge;
    button.append(badgeEl);
  }
  return button;
}

function activeCaliberKey() {
  if (state.customId) {
    const custom = state.customAmmo.find((item) => item.id === state.customId);
    if (custom) return custom.caliber.trim().toLowerCase();
  }
  return (state.caliber || presetById(state.presetId).caliber).trim().toLowerCase();
}

function renderAmmo() {
  const root = $("ammo-groups");
  if (ammoOpen == null) ammoOpen = new Set([activeCaliberKey()]);
  else ammoOpen = new Set([...root.querySelectorAll("details[open]")].map((node) => node.dataset.key));
  root.replaceChildren();
  for (const group of ammoGroups()) {
    const key = group.label.trim().toLowerCase();
    const block = document.createElement("details");
    block.className = "caliber-group";
    block.dataset.key = key;
    if (ammoOpen.has(key)) block.open = true;
    const heading = document.createElement("summary");
    heading.textContent = group.label;
    const list = document.createElement("div");
    list.className = "caliber-loads";
    for (const preset of group.presets) {
      const selected = !state.customId && preset.id === state.presetId;
      const edited =
        selected &&
        (state.caliber !== preset.caliber ||
          Math.abs(state.weightGr - preset.weightGr) > 0.05 ||
          bcDiffers(state.bc, preset.bcG1) ||
          state.speedOverrideFps != null);
      const grains = selected ? state.weightGr : preset.weightGr;
      const fps = selected ? usedFps() : muzzleFps(preset, state.barrelIn, null);
      list.append(
        choiceButton({
          name: preset.brand,
          detail: detailText(grains, fps, preset.models?.[0]),
          badge: selected ? (edited ? "Edited" : "In use") : "",
          selected,
          presetId: preset.id,
          label: selected
            ? `${preset.brand}, ${edited ? "edited" : "in use"}. Activate to restore the catalog load.`
            : `${preset.brand}, ${group.label}`,
        }),
      );
    }
    for (const custom of group.customs) {
      const selected = custom.id === state.customId;
      const fps = selected ? usedFps() : muzzleFps(custom, state.barrelIn, null);
      const grains = selected ? state.weightGr : custom.weightGr;
      list.append(
        choiceButton({
          name: custom.brand || "Custom",
          detail: detailText(grains, fps, custom.model),
          badge: selected ? "In use" : "",
          selected,
          customId: custom.id,
          label: `${custom.brand || "Custom"} ${group.label}, ${detailText(grains, fps)}`,
        }),
      );
    }
    block.append(heading, list);
    root.append(block);
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = state.theme === "light" ? "#e6e2da" : "#0e0d0c";
  $("theme-dark").setAttribute("aria-checked", state.theme === "dark" ? "true" : "false");
  $("theme-light").setAttribute("aria-checked", state.theme === "light" ? "true" : "false");
}

function readAdd() {
  const caliber = $("add-caliber").value.trim();
  const weightRaw = Number(String($("add-weight").value).replace(/,/g, "").trim());
  const speedRaw = Number(String($("add-speed").value).replace(/,/g, "").trim());
  const bcText = String($("add-bc").value).replace(/,/g, "").trim();
  return {
    brand: $("add-brand").value.trim().slice(0, 48),
    model: $("add-model").value.trim().slice(0, 48),
    upc: $("add-upc").value.replace(/\D/g, "").slice(0, 14),
    caliber,
    weightGr: metric() ? weightRaw / GRAIN : weightRaw,
    speedFps: metric() ? speedRaw / 0.3048 : speedRaw,
    bc: bcText === "" ? null : Number(bcText),
  };
}

function addValid(value) {
  const bcOk = value.bc == null || (Number.isFinite(value.bc) && value.bc >= 0.05 && value.bc <= 1.5);
  return (
    value.caliber.length > 0 &&
    value.caliber.length <= 40 &&
    value.weightGr >= 15 &&
    value.weightGr <= 500 &&
    value.speedFps >= 300 &&
    value.speedFps <= 4500 &&
    bcOk
  );
}

function syncSlider(id, yards, minYd, maxYd) {
  const el = $(id);
  let min = displayDistance(minYd);
  let max = displayDistance(maxYd);
  if (max < min) max = min;
  const value = Math.min(max, Math.max(min, displayDistance(yards)));
  el.min = String(min);
  el.max = String(max);
  el.step = "1";
  if (document.activeElement !== el) el.value = String(value);
}

function render() {
  const [dMin, dMax] = distanceBounds();
  const [zMin, zMax] = zeroBounds();
  state.zeroYd = clampNum(state.zeroYd, zMin, zMax, state.zeroYd);
  state.paperYd = clampNum(state.paperYd, zMin, zMax, state.zeroYd);
  separateDistances();

  const ready = state.bc != null && state.bc >= 0.05 && state.bc <= 1.5;
  const poi = ready
    ? solvePoi({
        speedFps: usedFps(),
        bc: state.bc,
        sightIn: state.sightIn,
        zeroYd: state.zeroYd,
        distanceYd: state.farYd,
      })
    : null;
  const closeIn = poi ? inchesAt(poi.samples, state.closeYd) : null;
  const farIn = poi ? inchesAt(poi.samples, state.farYd) : null;
  const paperIn = poi ? inchesOnPath(poi, state.paperYd) : null;
  const paperSame = displayDistance(state.paperYd) === displayDistance(state.zeroYd);
  const unit = distanceUnit();

  applyTheme();
  $("unit-imperial").setAttribute("aria-checked", metric() ? "false" : "true");
  $("unit-metric").setAttribute("aria-checked", metric() ? "true" : "false");
  $("unit-hint").textContent = metric() ? "mm, m, m/s, g" : "inches, yd, ft/s, gr";
  $("chart-close").textContent = poi
    ? `${formatDistanceNumber(state.closeYd)} ${unit}: ${formatSignedDrop(closeIn)}`
    : "Type a G1 BC";
  $("chart-far").textContent = poi
    ? `${formatDistanceNumber(state.farYd)} ${unit}: ${formatSignedDrop(farIn)}`
    : "Type a G1 BC";
  const ends = poi ? extremaInRange(poi) : null;
  $("chart-min").hidden = !ends;
  $("chart-max").hidden = !ends;
  $("chart-spread").hidden = !ends;
  $("chart-min").textContent = ends ? `Min: ${formatSignedDrop(ends.min.inches)}` : "";
  $("chart-max").textContent = ends ? `Max: ${formatSignedDrop(ends.max.inches)}` : "";
  $("chart-spread").textContent = ends
    ? `Max − Min: ${formatDrop(ends.max.inches - ends.min.inches)}`
    : "";
  $("close-unit").textContent = unit;
  $("far-unit").textContent = unit;
  $("barrel-unit").textContent = lengthUnit();
  $("sight-unit").textContent = lengthUnit();
  $("zero-unit").textContent = unit;
  $("paper-unit").textContent = unit;
  $("paper-offset").textContent = paperOffsetText(paperIn, paperSame);
  const weightLabel = metric() ? "Weight (g)" : "Grain";
  const speedLabel = `Muzzle speed (${speedUnit()})`;
  $("weight-label").textContent = weightLabel;
  $("add-weight-label").textContent = weightLabel;
  $("speed-label").textContent =
    state.speedOverrideFps == null ? speedLabel : `${speedLabel}, typed`;
  $("add-speed-label").textContent = speedLabel;
  $("rule").textContent = `${FPS_PER_INCH} ft/s for each inch of barrel. A typed speed replaces it.`;
  $("use-catalog").hidden = state.customId != null || state.speedOverrideFps == null;
  $("version").textContent = VERSION;
  const closeShown = displayDistance(state.closeYd);
  const farShown = displayDistance(state.farYd);
  const zeroShown = displayDistance(state.zeroYd);
  const paperShown = displayDistance(state.paperYd);
  const dMinShown = displayDistance(dMin);
  const dMaxShown = displayDistance(dMax);
  const zMinShown = displayDistance(zMin);
  const zMaxShown = displayDistance(zMax);
  $("close-dec").disabled = closeShown <= dMinShown;
  $("close-inc").disabled = closeShown >= farShown - 1;
  $("far-dec").disabled = farShown <= closeShown + 1;
  $("far-inc").disabled = farShown >= dMaxShown;
  $("zero-dec").disabled = zeroShown <= zMinShown;
  $("zero-inc").disabled = zeroShown >= zMaxShown;
  $("paper-dec").disabled = paperShown <= zMinShown;
  $("paper-inc").disabled = paperShown >= zMaxShown;
  syncSlider("zero-slider", state.zeroYd, zMin, zMax);
  syncSlider("paper-slider", state.paperYd, zMin, zMax);
  syncSlider("close-slider", state.closeYd, dMin, state.farYd - gapYd());
  syncSlider("far-slider", state.farYd, state.closeYd + gapYd(), dMax);
  const full = state.customAmmo.length >= CUSTOM_LIMIT;
  $("add-ammo").disabled = full;
  $("add-ammo").textContent = full ? "40 loads saved" : "Add a load";
  $("add-save").disabled = !formDirty || !addValid(readAdd());
  if (!formDirty) fillCustomForm();

  const savedCustom = activeCustom();
  setIfIdle("custom-brand", savedCustom?.brand || "");
  setIfIdle("model", savedCustom?.model || "");
  setIfIdle("upc", savedCustom?.upc || "");
  setIfIdle("weight", formatWeight(state.weightGr));
  setIfIdle("speed", String(Math.round(metric() ? usedFps() * 0.3048 : usedFps())));
  setIfIdle("bc", formatBc(state.bc));
  $("bc").placeholder = state.bc == null ? "Type G1 BC" : "";
  setIfIdle("close", formatDistanceNumber(state.closeYd));
  setIfIdle("far", formatDistanceNumber(state.farYd));
  setIfIdle("barrel", formatBarrel(state.barrelIn));
  setIfIdle("sight", formatSight(state.sightIn));
  setIfIdle("zero", formatDistanceNumber(state.zeroYd));
  setIfIdle("paper", formatDistanceNumber(state.paperYd));
  const plotCustom = state.plotCustom === true;
  $("plot-auto").setAttribute("aria-checked", plotCustom ? "false" : "true");
  $("plot-custom").setAttribute("aria-checked", plotCustom ? "true" : "false");
  $("plot-max-field").hidden = !plotCustom;
  $("plot-unit").textContent = unit;
  setIfIdle("plot-max", state.plotMaxYd == null ? "" : formatDistanceNumber(state.plotMaxYd));

  if (poi) {
    drawTarget(closeIn, farIn);
    drawPath(poi);
  } else {
    const target = $("target");
    const path = $("path");
    target.innerHTML = "";
    path.innerHTML = "";
    target.setAttribute("aria-label", "Type a G1 BC to plot the impact.");
    path.setAttribute("aria-label", "Type a G1 BC to plot the path.");
    $("target-caption").textContent = "This load has no published G1 BC. Type one to plot the path.";
  }
  const showCustom = state.customId != null;
  $("brand-name-field").hidden = !showCustom;
  $("model-field").hidden = !showCustom;
  $("upc-field").hidden = !showCustom;
  renderAmmo();
}

function fillCustomForm() {
  const custom = activeCustom();
  if (!custom) return;
  setIfIdle("add-brand", custom.brand || "");
  setIfIdle("add-model", custom.model || "");
  setIfIdle("add-upc", custom.upc || "");
  setIfIdle("add-caliber", custom.caliber || "");
  setIfIdle("add-weight", formatWeight(custom.weightGr));
  setIfIdle("add-speed", String(Math.round(metric() ? muzzleFps(custom, state.barrelIn, null) * 0.3048 : muzzleFps(custom, state.barrelIn, null))));
  setIfIdle("add-bc", formatBc(custom.bcG1));
}

function setUnits(units) {
  if (state.units === units) return;
  const wasMetric = metric();
  state.units = units;
  if (wasMetric !== metric()) convertAddFields(wasMetric);
  save();
  render();
}

function convertAddFields(wasMetric) {
  const weight = Number(String($("add-weight").value).replace(/,/g, "").trim());
  const speed = Number(String($("add-speed").value).replace(/,/g, "").trim());
  if (Number.isFinite(weight)) {
    const grains = wasMetric ? weight / GRAIN : weight;
    $("add-weight").value = metric() ? (grains * GRAIN).toFixed(1) : String(Math.round(grains));
  }
  if (Number.isFinite(speed)) {
    const fps = wasMetric ? speed / 0.3048 : speed;
    $("add-speed").value = String(Math.round(metric() ? fps * 0.3048 : fps));
  }
}

function setTheme(theme) {
  if (state.theme === theme) return;
  state.theme = theme;
  save();
  render();
}

function applyPreset(id) {
  const preset = presetById(id);
  state.customId = null;
  state.presetId = preset.id;
  state.caliber = preset.caliber;
  state.weightGr = preset.weightGr;
  state.bc = preset.bcG1;
  state.speedOverrideFps = null;
  save();
  render();
}

function applyCustom(id) {
  const custom = state.customAmmo.find((item) => item.id === id);
  if (!custom) return;
  formDirty = false;
  state.customId = custom.id;
  state.caliber = custom.caliber;
  state.weightGr = custom.weightGr;
  state.bc = custom.bcG1;
  state.speedOverrideFps = null;
  save();
  render();
}

function onNumber(id, convert, bounds, assign) {
  const el = $(id);
  el.addEventListener("input", () => {
    const n = Number(String(el.value).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return;
    const imperial = convert(n);
    if (imperial < bounds()[0] || imperial > bounds()[1]) return;
    assign(imperial);
    save();
    render();
  });
  el.addEventListener("blur", () => render());
}

function selectWholeValue(input) {
  const selectAll = () => {
    const end = input.value.length;
    try {
      input.setSelectionRange(0, end);
    } catch {
      input.select();
    }
  };
  input.addEventListener("focus", selectAll);
  input.addEventListener("mouseup", (event) => {
    event.preventDefault();
    selectAll();
  });
}

function stepShown(currentYd, direction, minYd, maxYd) {
  const shown = displayDistance(currentYd);
  const min = displayDistance(minYd);
  const max = Math.max(min, displayDistance(maxYd));
  const next = Math.min(max, Math.max(min, shown + direction * 5));
  return yardsFromDisplay(next);
}

function onSlider(id, assign) {
  $(id).addEventListener("input", () => {
    const n = Number($(id).value);
    if (!Number.isFinite(n)) return;
    assign(yardsFromDisplay(n));
    save();
    render();
  });
}

function wireTips() {
  const tip = document.createElement("p");
  tip.className = "tip";
  tip.hidden = true;
  let open = null;
  const close = () => {
    tip.hidden = true;
    if (open) open.setAttribute("aria-expanded", "false");
    open = null;
  };
  document.addEventListener("click", (event) => {
    const title = event.target.closest(".tip-title");
    if (!title) return;
    event.preventDefault();
    if (open === title) {
      close();
      return;
    }
    close();
    tip.textContent = title.dataset.tip || "";
    const play = title.closest(".play-control");
    if (play) play.querySelector(".play-line").insertAdjacentElement("afterend", tip);
    else title.insertAdjacentElement("afterend", tip);
    tip.hidden = false;
    title.setAttribute("aria-expanded", "true");
    open = title;
  });
}

function clearCustomForm() {
  for (const id of ["add-brand", "add-model", "add-upc", "add-caliber", "add-weight", "add-speed", "add-bc"]) $(id).value = "";
}

function startCustom() {
  if (state.customAmmo.length >= CUSTOM_LIMIT) return;
  formDirty = true;
  clearCustomForm();
  render();
  $("add-brand").focus();
}

function wire() {
  wireTips();
  for (const input of document.querySelectorAll("input:not([type=range])")) selectWholeValue(input);
  $("unit-imperial").addEventListener("click", () => setUnits("imperial"));
  $("unit-metric").addEventListener("click", () => setUnits("metric"));
  $("theme-dark").addEventListener("click", () => setTheme("dark"));
  $("theme-light").addEventListener("click", () => setTheme("light"));
  $("ammo-groups").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset], [data-custom]");
    if (!button || !$("ammo-groups").contains(button)) return;
    if (button.dataset.custom) applyCustom(button.dataset.custom);
    else applyPreset(button.dataset.preset);
  });
  $("add-ammo").addEventListener("click", () => {
    if ($("add-ammo").disabled) return;
    startCustom();
  });
  $("add-cancel").addEventListener("click", () => {
    formDirty = false;
    clearCustomForm();
    render();
  });
  for (const id of ["add-brand", "add-model", "add-upc", "add-caliber", "add-weight", "add-speed", "add-bc"]) {
    $(id).addEventListener("input", () => {
      formDirty = true;
      $("add-save").disabled = !formDirty || !addValid(readAdd());
    });
  }
  $("add-save").addEventListener("click", () => {
    const value = readAdd();
    if (!addValid(value) || state.customAmmo.length >= CUSTOM_LIMIT) return;
    const entry = {
      id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      brand: value.brand,
      model: value.model,
      upc: value.upc,
      caliber: value.caliber,
      weightGr: value.weightGr,
      speedFps: value.speedFps,
      barrelIn: state.barrelIn,
      bcG1: value.bc,
    };
    state.customAmmo.push(entry);
    formDirty = false;
    applyCustom(entry.id);
  });
  $("custom-brand").addEventListener("input", () => {
    const custom = activeCustom();
    if (!custom) return;
    custom.brand = $("custom-brand").value.slice(0, 48);
    save();
    render();
  });
  $("custom-brand").addEventListener("blur", () => {
    const custom = activeCustom();
    if (!custom) return;
    custom.brand = $("custom-brand").value.trim().slice(0, 48);
    save();
    render();
  });
  $("model").addEventListener("input", () => {
    const custom = activeCustom();
    if (!custom) return;
    custom.model = $("model").value.slice(0, 48);
    save();
    render();
  });
  $("model").addEventListener("blur", () => {
    const custom = activeCustom();
    if (!custom) return;
    custom.model = $("model").value.trim().slice(0, 48);
    save();
    render();
  });
  $("upc").addEventListener("input", () => {
    const custom = activeCustom();
    if (!custom) return;
    custom.upc = $("upc").value.replace(/\D/g, "").slice(0, 14);
    save();
    render();
  });
  $("upc").addEventListener("blur", () => render());
  onNumber(
    "weight",
    (n) => (metric() ? n / GRAIN : n),
    () => [15, 500],
    (grains) => {
      state.weightGr = grains;
      const custom = activeCustom();
      if (custom) custom.weightGr = grains;
    },
  );
  onNumber(
    "speed",
    (n) => (metric() ? n / 0.3048 : n),
    () => [300, 4500],
    (fps) => {
      const custom = activeCustom();
      if (custom) {
        custom.speedFps = fps;
        custom.barrelIn = state.barrelIn;
        state.speedOverrideFps = null;
      } else state.speedOverrideFps = fps;
    },
  );
  onNumber(
    "bc",
    (n) => n,
    () => [0.05, 1.5],
    (bc) => {
      state.bc = bc;
      const custom = activeCustom();
      if (custom) custom.bcG1 = bc;
    },
  );
  onNumber(
    "barrel",
    (n) => (metric() ? n / 25.4 : n),
    () => [2, 32],
    (inches) => {
      state.barrelIn = inches;
    },
  );
  onNumber(
    "sight",
    (n) => (metric() ? n / 25.4 : n),
    () => [0, 6],
    (inches) => {
      state.sightIn = inches;
    },
  );
  onNumber("zero", (n) => (metric() ? n / 0.9144 : n), zeroBounds, (yards) => {
    state.zeroYd = yards;
  });
  onNumber("paper", (n) => (metric() ? n / 0.9144 : n), zeroBounds, (yards) => {
    state.paperYd = yards;
  });
  onNumber("close", (n) => (metric() ? n / 0.9144 : n), distanceBounds, assignClose);
  onNumber("far", (n) => (metric() ? n / 0.9144 : n), distanceBounds, assignFar);
  onNumber("plot-max", (n) => (metric() ? n / 0.9144 : n), () => [5, MAX_YD], (yards) => {
    state.plotCustom = true;
    state.plotMaxYd = yards;
  });
  $("plot-auto").addEventListener("click", () => {
    if (!state.plotCustom) return;
    state.plotCustom = false;
    save();
    render();
  });
  $("plot-custom").addEventListener("click", () => {
    if (state.plotCustom) return;
    state.plotCustom = true;
    if (state.plotMaxYd == null) state.plotMaxYd = 100;
    save();
    render();
  });
  $("zero-dec").addEventListener("click", () => {
    const [min, max] = zeroBounds();
    state.zeroYd = stepShown(state.zeroYd, -1, min, max);
    save();
    render();
  });
  $("zero-inc").addEventListener("click", () => {
    const [min, max] = zeroBounds();
    state.zeroYd = stepShown(state.zeroYd, 1, min, max);
    save();
    render();
  });
  $("paper-dec").addEventListener("click", () => {
    const [min, max] = zeroBounds();
    state.paperYd = stepShown(state.paperYd, -1, min, max);
    save();
    render();
  });
  $("paper-inc").addEventListener("click", () => {
    const [min, max] = zeroBounds();
    state.paperYd = stepShown(state.paperYd, 1, min, max);
    save();
    render();
  });
  $("close-dec").addEventListener("click", () => {
    const [min] = distanceBounds();
    state.closeYd = stepShown(state.closeYd, -1, min, state.farYd - gapYd());
    save();
    render();
  });
  $("close-inc").addEventListener("click", () => {
    const [min] = distanceBounds();
    state.closeYd = stepShown(state.closeYd, 1, min, state.farYd - gapYd());
    save();
    render();
  });
  $("far-dec").addEventListener("click", () => {
    const [, max] = distanceBounds();
    state.farYd = stepShown(state.farYd, -1, state.closeYd + gapYd(), max);
    save();
    render();
  });
  $("far-inc").addEventListener("click", () => {
    const [, max] = distanceBounds();
    state.farYd = stepShown(state.farYd, 1, state.closeYd + gapYd(), max);
    save();
    render();
  });
  onSlider("zero-slider", (yards) => {
    const [min, max] = zeroBounds();
    state.zeroYd = clampNum(yards, min, max, state.zeroYd);
  });
  onSlider("paper-slider", (yards) => {
    const [min, max] = zeroBounds();
    state.paperYd = clampNum(yards, min, max, state.paperYd);
  });
  onSlider("close-slider", (yards) => {
    const [min] = distanceBounds();
    const ceiling = state.farYd - gapYd();
    state.closeYd = clampNum(yards, min, ceiling, state.closeYd);
  });
  onSlider("far-slider", (yards) => {
    const [, max] = distanceBounds();
    const floor = state.closeYd + gapYd();
    state.farYd = clampNum(yards, floor, max, state.farYd);
  });
  $("use-catalog").addEventListener("click", () => {
    state.speedOverrideFps = null;
    save();
    render();
  });
}

wire();
render();
save();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}
