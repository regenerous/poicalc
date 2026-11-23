import { solvePoi } from "./ballistics.js";
import { FPS_PER_INCH, PRESETS, catalogLines, muzzleFps, presetById } from "./presets.js";
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
  presetId: "fed",
  customId: null,
  customAmmo: [],
  barrelIn: 16,
  caliber: "5.56 NATO",
  weightGr: 55,
  bc: 0.246,
  speedOverrideFps: null,
  sightIn: 1.93,
  zeroYd: 50,
  paperYd: 50,
  closeYd: 5,
  farYd: 100,
};

let state = loadState();
let adding = false;
let picker = { hold: false, menuOpen: false, brand: "", weight: "" };

const LINE_COLOR = {
  Winchester: "#8d6a32",
  Federal: "#1e4d32",
  "American Eagle": "#1d3e66",
  Remington: "#6d2e28",
  CCI: "#243646",
  Tula: "#3e4a28",
  Barnaul: "#4a3824",
};

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
  }
  return next;
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
  return `${abs.toFixed(1)} in`;
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
  return { inches: chosen, label: `${chosen} in` };
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

function drawPath(poi) {
  const svg = $("path");
  const width = 356;
  const height = 156;
  const reach = Math.max(poi.reachYd, state.farYd, state.closeYd, 25);
  const xMax = reach * 1.06;
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
  yMin = Math.min(yMin, closeIn, farIn, -state.sightIn);
  yMax = Math.max(yMax, closeIn, farIn);
  const span = Math.max(6, (yMax - yMin) * 1.35);
  const mid = (yMax + yMin) / 2;
  yMin = mid - span / 2;
  yMax = mid + span / 2;
  const xOf = (yd) => pad.l + (yd / xMax) * plotW;
  const yOf = (inches) => pad.t + ((yMax - inches) / (yMax - yMin)) * plotH;
  const curve = thinSamples(shown, [poi.climbYd, poi.fallYd, state.closeYd, state.farYd]).map((point) => ({
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
  ].filter(Boolean);
  const placed = marks.map((mark) => ({
    ...mark,
    x: xOf(mark.yd),
    y: yOf(0),
    text: formatSignedDrop(0),
  }));
  if (marksClose && placed.length === 2) {
    placed[0].labelY = 14;
    placed[1].labelY = 28;
  } else {
    for (const mark of placed) mark.labelY = Math.max(16, mark.y - 14);
  }

  const axis = [{ yd: 0, hot: false }, { yd: state.closeYd, hot: true }, { yd: state.farYd, hot: true }];
  if (reach > state.farYd + 1) axis.push({ yd: reach, hot: false });

  const unit = distanceUnit();
  const bits = [];
  if (poi.climbYd != null) bits.push(`climbs through the line of sight at ${formatDistanceNumber(poi.climbYd)} ${unit}`);
  if (poi.fallYd != null) bits.push(`falls back through it at ${formatDistanceNumber(poi.fallYd)} ${unit}`);
  svg.setAttribute(
    "aria-label",
    `Side view. The bullet ${bits.join(" and ") || "stays off the line of sight"}. Close target distance at ${formatDistanceNumber(state.closeYd)} ${unit} is ${formatSignedDrop(closeIn)}. Far target distance at ${formatDistanceNumber(state.farYd)} ${unit} is ${formatSignedDrop(farIn)}.`,
  );
  const impactsNear = Math.abs(closeX - farX) < 72;
  const impactLabel = (kind, x, y, inches) => {
    const anchor = x < 70 ? "start" : x > width - 70 ? "end" : "middle";
    const textX = anchor === "start" ? x - 8 : anchor === "end" ? x + 8 : x;
    const lift = impactsNear && kind === "far" ? 28 : 14;
    const textY = Math.max(14, y - lift);
    const cls = kind === "far" ? "cross-label far-label" : "cross-label";
    return `<text class="${cls}" data-distance="${kind}" x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="${anchor}">${formatSignedDrop(inches)}</text>`;
  };

  const markSvg = placed
    .map((mark) => {
      const anchor = mark.x < 70 ? "start" : mark.x > width - 70 ? "end" : "middle";
      const x = anchor === "start" ? mark.x - 8 : anchor === "end" ? mark.x + 8 : mark.x;
      const nearImpact =
        Math.hypot(mark.x - closeX, mark.y - closeY) < 10 || Math.hypot(mark.x - farX, mark.y - farY) < 10;
      const radius = nearImpact ? 7 : 3.5;
      return `
        <circle class="mark-open" data-mark="${mark.kind}" data-crossing="${mark.kind}" cx="${mark.x.toFixed(1)}" cy="${mark.y.toFixed(1)}" r="${radius}"></circle>
        <text class="cross-label" data-crossing="${mark.kind}" x="${x.toFixed(1)}" y="${Math.max(14, mark.labelY).toFixed(1)}" text-anchor="${anchor}">${mark.text}</text>
      `;
    })
    .join("");

  const axisSvg = axis
    .map((tick) => {
      const x = tick.yd === 0 ? pad.l : xOf(tick.yd);
      const anchor = tick.yd === 0 ? "start" : "middle";
      const cls = tick.hot ? "axis-hot" : "axis-label";
      const label = tick.yd === 0 ? "0" : formatDistanceNumber(tick.yd);
      return `<text class="${cls}" x="${x.toFixed(1)}" y="${height - 7}" text-anchor="${anchor}">${label}</text>`;
    })
    .join("");

  svg.innerHTML = `
    <rect class="chart-bg" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10"></rect>
    <line class="los" x1="${xOf(0).toFixed(1)}" y1="${losY.toFixed(1)}" x2="${xOf(xMax).toFixed(1)}" y2="${losY.toFixed(1)}" stroke-width="1.25" stroke-dasharray="4 3"></line>
    <path class="path-line" d="${smoothPath(curve)}"></path>
    <line class="drop-line-close" x1="${closeX.toFixed(1)}" y1="${losY.toFixed(1)}" x2="${closeX.toFixed(1)}" y2="${closeY.toFixed(1)}"></line>
    <line class="drop-line-far" x1="${farX.toFixed(1)}" y1="${losY.toFixed(1)}" x2="${farX.toFixed(1)}" y2="${farY.toFixed(1)}"></line>
    <circle class="mark-muzzle" cx="${xOf(0).toFixed(1)}" cy="${yOf(-state.sightIn).toFixed(1)}" r="2.5"></circle>
    ${markSvg}
    <circle class="mark-far" data-mark="far" data-distance="far" cx="${farX.toFixed(1)}" cy="${farY.toFixed(1)}" r="4.5"></circle>
    <circle class="mark-close" data-mark="close" data-distance="close" cx="${closeX.toFixed(1)}" cy="${closeY.toFixed(1)}" r="4.5"></circle>
    ${impactLabel("close", closeX, closeY, closeIn)}
    ${impactLabel("far", farX, farY, farIn)}
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
  return order.map((key) => map.get(key));
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

function renderAmmo() {
  const root = $("ammo-groups");
  const open = new Set([...root.querySelectorAll("details[open]")].map((node) => node.dataset.key));
  root.replaceChildren();
  for (const group of ammoGroups()) {
    const key = group.label.trim().toLowerCase();
    const block = document.createElement("details");
    block.className = "caliber-group";
    block.dataset.key = key;
    if (open.has(key)) block.open = true;
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
  $("unit-hint").textContent = metric() ? "mm, m, m/s, g" : "in, yd, ft/s, gr";
  $("chart-units").textContent = metric() ? "Millimeters vs meters" : "Inches vs yards";
  $("chart-close").textContent = poi
    ? `${formatSignedDrop(closeIn)} at ${formatDistanceNumber(state.closeYd)} ${unit}`
    : "Type a G1 BC";
  $("chart-far").textContent = poi
    ? `${formatSignedDrop(farIn)} at ${formatDistanceNumber(state.farYd)} ${unit}`
    : "Type a G1 BC";
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
  $("use-catalog").hidden = adding || state.customId != null || state.speedOverrideFps == null;
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
  $("edit-fields").hidden = adding;
  $("add-panel").hidden = !adding;
  const full = state.customAmmo.length >= CUSTOM_LIMIT;
  $("add-ammo").disabled = adding || full;
  $("add-ammo").textContent = full ? "40 loads saved" : "Add a load";
  $("add-save").disabled = !addValid(readAdd());

  const savedCustom = activeCustom();
  setIfIdle("custom-brand", savedCustom?.brand || "");
  setIfIdle("model", savedCustom?.model || "");
  setIfIdle("upc", savedCustom?.upc || "");
  setIfIdle("caliber", state.caliber);
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
  renderPicker();
  const customOpen = adding || picker.brand === "custom";
  $("weight-field").hidden = customOpen;
  $("box-field").hidden = customOpen;
  $("brand-name-field").hidden = adding || picker.brand !== "custom";
  $("model-field").hidden = adding || picker.brand !== "custom";
  $("upc-field").hidden = adding || picker.brand !== "custom";
  renderAmmo();
}

function setUnits(units) {
  if (state.units === units) return;
  const wasMetric = metric();
  state.units = units;
  if (adding && wasMetric !== metric()) convertAddFields(wasMetric);
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
  adding = false;
  picker.hold = false;
  picker.menuOpen = false;
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
  adding = false;
  picker.hold = false;
  picker.menuOpen = false;
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

function startCustom() {
  if (state.customAmmo.length >= CUSTOM_LIMIT) {
    picker.hold = false;
    render();
    return;
  }
  adding = true;
  picker.hold = true;
  picker.brand = "custom";
  picker.weight = "";
  picker.menuOpen = false;
  for (const id of ["add-brand", "add-model", "add-upc", "add-caliber", "add-weight", "add-speed", "add-bc"]) $(id).value = "";
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
  $("brand-pick").addEventListener("change", () => {
    if ($("brand-pick").value === "custom") {
      startCustom();
      return;
    }
    adding = false;
    picker.hold = true;
    picker.brand = $("brand-pick").value;
    picker.weight = "";
    picker.menuOpen = false;
    render();
  });
  $("weight-pick").addEventListener("change", () => {
    picker.hold = true;
    picker.weight = $("weight-pick").value;
    const matches = loadsFor(picker.brand, picker.weight);
    if (matches.length === 1) {
      applyPreset(matches[0].id);
      return;
    }
    picker.menuOpen = matches.length > 1;
    render();
  });
  $("load-pick").addEventListener("click", (event) => {
    event.stopPropagation();
    if (!loadsFor(picker.brand, picker.weight).length) return;
    picker.menuOpen = !picker.menuOpen;
    render();
  });
  $("load-menu").addEventListener("click", (event) => {
    const option = event.target.closest("[data-preset]");
    if (!option) return;
    applyPreset(option.dataset.preset);
  });
  document.addEventListener("click", (event) => {
    if (!picker.menuOpen) return;
    if (event.target.closest("#load-pick") || event.target.closest("#load-menu")) return;
    picker.menuOpen = false;
    render();
  });
  $("add-ammo").addEventListener("click", () => {
    if ($("add-ammo").disabled) return;
    startCustom();
  });
  $("add-cancel").addEventListener("click", () => {
    adding = false;
    picker.hold = false;
    picker.menuOpen = false;
    render();
  });
  for (const id of ["add-brand", "add-model", "add-upc", "add-caliber", "add-weight", "add-speed", "add-bc"]) {
    $(id).addEventListener("input", () => {
      $("add-save").disabled = !addValid(readAdd());
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
  $("caliber").addEventListener("input", () => {
    const text = $("caliber").value;
    if (!text.trim() || text.length > 40) return;
    state.caliber = text;
    const custom = activeCustom();
    if (custom) custom.caliber = text.trim();
    save();
    render();
  });
  $("caliber").addEventListener("blur", () => render());
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
