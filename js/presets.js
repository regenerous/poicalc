/**
 * Catalog loads. Speeds, weights, and G1 ballistic coefficients are the
 * maker's published figures. Nothing here is estimated.
 *
 * Barrel rule: catalog speed shifts by FPS_PER_INCH for each inch the
 * barrel differs from that load's reference barrel. A typed speed replaces it.
 */
export const FPS_PER_INCH = 25;

export const PRESETS = [
  {
    id: "fed",
    brand: "Federal",
    short: "5.56",
    caliber: "5.56 NATO",
    weightGr: 55,
    speedFps: 3165,
    bcG1: 0.246,
    barrelIn: 20,
    // Federal American Eagle AE193, federalpremium.com: 55 gr FMJ-BT,
    // 3165 ft/s, G1 BC 0.246. Reference barrel 20 in from Federal's XM193
    // specification sheet (3165 ft/s, 20 in 5.56 test barrel).
  },
  {
    id: "wwb",
    brand: "Winchester White Box",
    short: ".223",
    caliber: ".223 Rem",
    weightGr: 55,
    speedFps: 3240,
    bcG1: 0.255,
    barrelIn: 24,
    // Winchester USA223R1, winchesterle.com: 55 gr FMJ, 3240 ft/s, G1 BC 0.255.
    // Reference barrel 24 in: SAAMI Z299.4 standard centerfire rifle test barrel.
    // Winchester does not print a barrel length for this load.
  },
  {
    id: "ae",
    brand: "American Eagle",
    short: "9mm",
    caliber: "9mm Luger",
    weightGr: 115,
    speedFps: 1180,
    bcG1: 0.12,
    barrelIn: 4,
    // Federal American Eagle AE9DP, federalpremium.com: 115 gr FMJ, 1180 ft/s,
    // test barrel 4 in. G1 BC 0.12 from Federal's AE9DP law-enforcement listing
    // (le.vistaoutdoor.com handgun details, id 94); its velocity table matches AE9DP.
  },
  {
    id: "cci",
    brand: "CCI Blazer",
    short: ".22 LR",
    caliber: ".22 LR",
    weightGr: 40,
    speedFps: 1235,
    bcG1: 0.133,
    barrelIn: 24,
    // CCI Blazer Rimfire, cci-ammunition.com part 21: 40 gr LRN, 1235 ft/s, G1 BC 0.133.
    // Reference barrel 24 in: SAAMI Z299.1 standard rimfire rifle test barrel.
    // CCI does not print a barrel length for this load.
  },
  {
    id: "tula",
    brand: "Tula",
    short: "7.62",
    caliber: "7.62×39",
    weightGr: 122,
    speedFps: 2329,
    bcG1: 0.303,
    barrelIn: 20,
    // Tulammo 7.62x39 hunting cartridge, tulammo.ru: FMJ G1 BC 0.303,
    // V25 = 710 m/s (2329 ft/s). FMJ mass 7.8–8.1 g; the 122 gr FMJ is that bullet.
    // Reference barrel 20 in: SAAMI Z299.4 exception for 7.62x39.
    // Tulammo does not print a barrel length.
  },
];

export function presetById(id) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}

/** Muzzle speed in ft/s. A finite override replaces the barrel shift. */
export function muzzleFps(preset, barrelIn, overrideFps) {
  if (overrideFps != null && Number.isFinite(overrideFps)) return overrideFps;
  const shifted = preset.speedFps + FPS_PER_INCH * (barrelIn - preset.barrelIn);
  return Math.min(4500, Math.max(300, shifted));
}
