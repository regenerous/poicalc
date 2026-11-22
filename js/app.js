import { solvePoi } from "./ballistics.js";
import { FPS_PER_INCH, PRESETS, muzzleFps, presetById } from "./presets.js";
import { VERSION } from "./version.js";

const KEY = "poicalc.setup";
const GRAIN = 0.06479891;
const RING_STEPS = [4, 6, 8, 10, 12, 16, 20, 30, 40, 60, 80, 120, 200, 400];

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  units: "imperial",
  presetId: "fed",
  barrelIn: 16,
  caliber: "5.56 NATO",
  weightGr: 55,
  bc: 0.246,
  speedOverrideFps: null,
  sightIn: 1.93,
  zeroYd: 50,
  distanceYd: 300,
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw);
    return sanitize(data);
  } catch {
    return { ...DEFAULTS };
  }
}

function sanitize(data) {
  const next = { ...DEFAULTS };
  if (data.units === "metric" || data.units === "imperial") next.units = data.units;
  if (PRESETS.some((preset) => preset.id === data.presetId)) next.presetId = data.presetId;
  next.barrelIn = clampNum(data.barrelIn, 2, 32, DEFAULTS.barrelIn);
  next.sightIn = clampNum(data.sightIn, 0, 6, DEFAULTS.sightIn);
  next.zeroYd = clampNum(data.zeroYd, 5, 800, DEFAULTS.zeroYd);
  next.distanceYd = clampNum(data.distanceYd, 5, 1200, DEFAULTS.distanceYd);
  next.weightGr = clampNum(data.weightGr, 15, 500, DEFAULTS.weightGr);
  next.bc = clampNum(data.bc, 0.05, 1.5, DEFAULTS.bc);
  if (typeof data.caliber === "string" && data.caliber.trim()) {
    next.caliber = data.caliber.slice(0, 40);
  }
  if (data.speedOverrideFps == null) next.speedOverrideFps = null;
  else next.speedOverrideFps = clampNum(data.speedOverrideFps, 300, 4500, null);
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
  return metric() ? [5 / 0.9144, 1000 / 0.9144] : [5, 1000];
}

function zeroBounds() {
  return metric() ? [5 / 0.9144, 800 / 0.9144] : [5, 800];
}

function usedFps() {
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

function placeLine(inches, yards) {
  const where = `${formatDistanceNumber(yards)} ${distanceUnit()}`;
  if (inches < -0.05) return `Below aim · ${where}`;
  if (inches > 0.05) return `Above aim · ${where}`;
  return `On aim · ${where}`;
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
  return bc.toFixed(3).replace(/0$/, "").replace(/0$/, "");
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

function drawTarget(impactIn) {
  const svg = $("target");
  const size = 208;
  const c = size / 2;
  const margin = 8;
  const outer = c - margin;
  const ring = ringSize(Math.abs(impactIn));
  const frac = Math.max(-1, Math.min(1, impactIn / ring.inches));
  const dotY = c - frac * outer;
  const label = Math.abs(impactIn) < 0.05 ? "" : formatDrop(impactIn);
  const labelOnRight = dotY < size - 28;
  const rings = [1, 0.8, 0.6, 0.4, 0.2]
    .map((scale, index) => {
      const cls = index % 2 === 0 ? "ring-a" : "ring-b";
      return `<circle class="${cls}" cx="${c}" cy="${c}" r="${(scale * outer).toFixed(1)}" stroke-width="1"></circle>`;
    })
    .join("");
  const textX = c + 14;
  const textY = Math.min(size - 8, Math.max(16, dotY + 4));
  svg.setAttribute(
    "aria-label",
    `Target. The impact is ${formatDrop(impactIn)} ${impactIn < -0.05 ? "below" : impactIn > 0.05 ? "above" : "on"} the aim point. The outer ring is ${ring.label} from center.`,
  );
  svg.innerHTML = `
    ${rings}
    <circle class="bull" cx="${c}" cy="${c}" r="${(0.08 * outer).toFixed(1)}"></circle>
    <line class="hair" x1="${c - outer}" y1="${c}" x2="${c + outer}" y2="${c}"></line>
    <line class="hair" x1="${c}" y1="${c - outer}" x2="${c}" y2="${c + outer}"></line>
    <circle class="dot-halo" cx="${c}" cy="${dotY.toFixed(1)}" r="8"></circle>
    <circle class="dot" data-mark="target-dot" cx="${c}" cy="${dotY.toFixed(1)}" r="6"></circle>
    ${
      label && labelOnRight
        ? `<text class="target-label" x="${textX}" y="${textY}">${label}</text>`
        : ""
    }
  `;
  $("target-caption").textContent = `Center is the aim point. Outer ring is ${ring.label}.`;
}

function drawPath(poi) {
  const svg = $("path");
  const width = 356;
  const height = 156;
  const reach = Math.max(poi.reachYd, state.distanceYd, 25);
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
  yMin = Math.min(yMin, poi.impactIn, -state.sightIn);
  yMax = Math.max(yMax, poi.impactIn);
  const span = Math.max(6, (yMax - yMin) * 1.35);
  const mid = (yMax + yMin) / 2;
  yMin = mid - span / 2;
  yMax = mid + span / 2;
  const xOf = (yd) => pad.l + (yd / xMax) * plotW;
  const yOf = (inches) => pad.t + ((yMax - inches) / (yMax - yMin)) * plotH;
  const curve = thinSamples(shown, [poi.climbYd, poi.fallYd, state.distanceYd]).map((point) => ({
    x: xOf(point.yd),
    y: yOf(point.inches),
  }));
  const impactX = xOf(state.distanceYd);
  const impactY = yOf(poi.impactIn);
  const losY = yOf(0);

  const marks = [
    poi.climbYd == null ? null : { kind: "climb", yd: poi.climbYd, verb: "climb" },
    poi.fallYd == null ? null : { kind: "fall", yd: poi.fallYd, verb: "fall" },
  ].filter(Boolean);
  const placed = marks.map((mark) => ({
    ...mark,
    x: xOf(mark.yd),
    y: yOf(0),
    text: `${mark.verb} ${formatDistanceNumber(mark.yd)} ${distanceUnit()}`,
  }));
  if (marksClose && placed.length === 2) {
    placed[0].labelY = 14;
    placed[1].labelY = 28;
  } else {
    for (const mark of placed) mark.labelY = Math.max(16, mark.y - 14);
  }

  const axis = [{ yd: 0, hot: false }];
  if (state.distanceYd < reach - 1) axis.push({ yd: state.distanceYd, hot: true });
  axis.push({ yd: reach, hot: Math.abs(reach - state.distanceYd) < 1 });

  const unit = distanceUnit();
  const bits = [];
  if (poi.climbYd != null) bits.push(`climbs through the line of sight at ${formatDistanceNumber(poi.climbYd)} ${unit}`);
  if (poi.fallYd != null) bits.push(`falls back through it at ${formatDistanceNumber(poi.fallYd)} ${unit}`);
  svg.setAttribute(
    "aria-label",
    `Side view. The bullet ${bits.join(" and ") || "stays off the line of sight"}. At ${formatDistanceNumber(state.distanceYd)} ${unit} the impact is ${formatSignedDrop(poi.impactIn)}.`,
  );

  const markSvg = placed
    .map((mark) => {
      const anchor = mark.x < 70 ? "start" : mark.x > width - 70 ? "end" : "middle";
      const x = anchor === "start" ? mark.x - 8 : anchor === "end" ? mark.x + 8 : mark.x;
      const nearImpact = Math.hypot(mark.x - impactX, mark.y - impactY) < 10;
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
    <line class="drop-line" x1="${impactX.toFixed(1)}" y1="${losY.toFixed(1)}" x2="${impactX.toFixed(1)}" y2="${impactY.toFixed(1)}"></line>
    <circle class="mark-muzzle" cx="${xOf(0).toFixed(1)}" cy="${yOf(-state.sightIn).toFixed(1)}" r="2.5"></circle>
    ${markSvg}
    <circle class="mark-impact" data-mark="impact" cx="${impactX.toFixed(1)}" cy="${impactY.toFixed(1)}" r="4"></circle>
    ${axisSvg}
  `;
}

function detailText(caliber, grains, fps) {
  return `${caliber} · ${formatWeight(grains)} ${weightUnit()} · ${formatSpeed(fps)} ${speedUnit()}`;
}

function renderPresets() {
  const preset = presetById(state.presetId);
  const edited =
    state.caliber !== preset.caliber ||
    Math.abs(state.weightGr - preset.weightGr) > 0.05 ||
    Math.abs(state.bc - preset.bcG1) > 0.0005 ||
    state.speedOverrideFps != null;
  const card = $("preset-selected");
  card.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "selected";
  button.dataset.preset = preset.id;
  button.setAttribute(
    "aria-label",
    `${preset.brand}, ${edited ? "edited" : "in use"}. Activate to restore the catalog load.`,
  );
  const copy = document.createElement("span");
  copy.className = "selected-copy";
  const name = document.createElement("span");
  name.className = "selected-name";
  name.textContent = preset.brand;
  const detail = document.createElement("span");
  detail.className = "selected-detail";
  detail.textContent = detailText(state.caliber, state.weightGr, usedFps());
  copy.append(name, detail);
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = edited ? "Edited" : "In use";
  button.append(copy, badge);
  card.append(button);

  const grid = $("preset-grid");
  grid.replaceChildren();
  for (const other of PRESETS) {
    if (other.id === preset.id) continue;
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "choice";
    choice.dataset.preset = other.id;
    const choiceName = document.createElement("span");
    choiceName.className = "choice-name";
    choiceName.textContent = other.brand;
    const choiceDetail = document.createElement("span");
    choiceDetail.className = "choice-detail";
    const speed = muzzleFps(other, state.barrelIn, null);
    choiceDetail.textContent = detailText(other.short, other.weightGr, speed);
    choice.append(choiceName, choiceDetail);
    grid.append(choice);
  }
}

function render() {
  const [dMin, dMax] = distanceBounds();
  state.distanceYd = clampNum(state.distanceYd, dMin, dMax, state.distanceYd);
  const [zMin, zMax] = zeroBounds();
  state.zeroYd = clampNum(state.zeroYd, zMin, zMax, state.zeroYd);

  const poi = solvePoi({
    speedFps: usedFps(),
    bc: state.bc,
    sightIn: state.sightIn,
    zeroYd: state.zeroYd,
    distanceYd: state.distanceYd,
  });

  $("drop-where").textContent = placeLine(poi.impactIn, state.distanceYd);
  $("drop-value").textContent = formatDrop(poi.impactIn);
  $("unit-imperial").setAttribute("aria-checked", metric() ? "false" : "true");
  $("unit-metric").setAttribute("aria-checked", metric() ? "true" : "false");
  $("unit-hint").textContent = metric() ? "mm, m, m/s, g" : "in, yd, ft/s, gr";
  $("chart-units").textContent = metric() ? "Millimeters vs meters" : "Inches vs yards";
  $("chart-readout").textContent = `${formatSignedDrop(poi.impactIn)} at ${formatDistanceNumber(state.distanceYd)} ${distanceUnit()}`;
  $("zero-note").textContent = `Zero stays ${formatDistanceNumber(state.zeroYd)} ${distanceUnit()}`;
  $("distance-unit").textContent = distanceUnit();
  $("barrel-unit").textContent = lengthUnit();
  $("sight-unit").textContent = lengthUnit();
  $("zero-unit").textContent = distanceUnit();
  $("weight-label").textContent = metric() ? "Weight (g)" : "Weight (gr)";
  $("speed-label").textContent = state.speedOverrideFps == null
    ? `Muzzle speed (${speedUnit()})`
    : `Muzzle speed (${speedUnit()}), typed`;
  $("rule").textContent = `${FPS_PER_INCH} ft/s for each inch of barrel. A typed speed replaces it.`;
  $("use-catalog").hidden = state.speedOverrideFps == null;
  $("version").textContent = VERSION;
  $("dist-dec").disabled = state.distanceYd <= dMin + 1e-6;
  $("dist-inc").disabled = state.distanceYd >= dMax - 1e-6;

  setIfIdle("caliber", state.caliber);
  setIfIdle("weight", formatWeight(state.weightGr));
  setIfIdle("speed", String(Math.round(metric() ? usedFps() * 0.3048 : usedFps())));
  setIfIdle("bc", formatBc(state.bc));
  setIfIdle("distance", formatDistanceNumber(state.distanceYd));
  setIfIdle("barrel", formatBarrel(state.barrelIn));
  setIfIdle("sight", formatSight(state.sightIn));
  setIfIdle("zero", formatDistanceNumber(state.zeroYd));

  drawTarget(poi.impactIn);
  drawPath(poi);
  renderPresets();
}

function setUnits(units) {
  if (state.units === units) return;
  state.units = units;
  save();
  render();
}

function applyPreset(id) {
  const preset = presetById(id);
  state.presetId = preset.id;
  state.caliber = preset.caliber;
  state.weightGr = preset.weightGr;
  state.bc = preset.bcG1;
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

function wire() {
  $("unit-imperial").addEventListener("click", () => setUnits("imperial"));
  $("unit-metric").addEventListener("click", () => setUnits("metric"));
  $("preset-selected").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (button) applyPreset(button.dataset.preset);
  });
  $("preset-grid").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (button) applyPreset(button.dataset.preset);
  });
  $("caliber").addEventListener("input", () => {
    const text = $("caliber").value;
    if (!text.trim() || text.length > 40) return;
    state.caliber = text;
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
    },
  );
  onNumber(
    "speed",
    (n) => (metric() ? n / 0.3048 : n),
    () => [300, 4500],
    (fps) => {
      state.speedOverrideFps = fps;
    },
  );
  onNumber(
    "bc",
    (n) => n,
    () => [0.05, 1.5],
    (bc) => {
      state.bc = bc;
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
  onNumber("distance", (n) => (metric() ? n / 0.9144 : n), distanceBounds, (yards) => {
    state.distanceYd = yards;
  });
  $("dist-dec").addEventListener("click", () => stepDistance(-1));
  $("dist-inc").addEventListener("click", () => stepDistance(1));
  $("use-catalog").addEventListener("click", () => {
    state.speedOverrideFps = null;
    save();
    render();
  });
}

function stepDistance(direction) {
  const shown = metric() ? state.distanceYd * 0.9144 : state.distanceYd;
  const next = shown + direction * 25;
  const yards = metric() ? next / 0.9144 : next;
  const [min, max] = distanceBounds();
  state.distanceYd = clampNum(yards, min, max, state.distanceYd);
  save();
  render();
}

wire();
render();
save();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}
