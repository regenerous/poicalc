/**
 * Catalog loads. Speeds, weights, and G1 ballistic coefficients are the
 * maker's published figures. Nothing here is estimated.
 *
 * A load whose maker publishes muzzle speed but no G1 coefficient is
 * included with bcG1 set to null. The field stays empty until the user types one.
 * Do not copy another load's coefficient into that field.
 *
 * Barrel rule: catalog speed shifts by FPS_PER_INCH for each inch the
 * barrel differs from that load's reference barrel. A typed speed replaces it.
 */
export const FPS_PER_INCH = 25;

export const PRESETS = [
  {
    id: "fed",
    brand: "Federal",
    line: "Federal",
    brandAliases: ["Federal", "American Eagle"],
    models: ["AE193", "AE193C"],
    // gtins on the Federal product pages for 11-AE193 and 11-AE193C.
    upcs: ["604544703917", "604544705829"],
    short: "5.56",
    caliber: "5.56 NATO",
    weightGr: 55,
    speedFps: 3165,
    bcG1: 0.246,
    barrelIn: 20,
    // Federal American Eagle AE193, federalpremium.com/rifle/american-eagle/american-eagle-rifle/11-AE193.html:
    // 55 gr FMJ, 3165 ft/s, ballistic coefficient .246. Test barrel 20 in from Federal's XM193 spec.
  },
  {
    id: "q3131",
    brand: "Winchester White Box",
    line: "Winchester",
    brandAliases: ["Winchester", "Winchester White Box", "USA"],
    models: ["Q3131"],
    upcs: [],
    short: "5.56",
    caliber: "5.56 NATO",
    weightGr: 55,
    speedFps: 3270,
    bcG1: 0.267,
    barrelIn: 20,
    // Winchester USA Q3131, winchester.com/Products/Ammunition/Rifle (USA rifle listing):
    // 5.56mm 55 gr FMJ, muzzle 3270 ft/s, ballistic coefficient 0.267.
    // This is not USA223R1 (0.255) and not WM193K (0.246).
    // Winchester does not print a test barrel; 20 in is the SAAMI Z299.4 5.56 barrel.
  },
  {
    id: "wwb",
    brand: "Winchester White Box",
    line: "Winchester",
    brandAliases: ["Winchester", "Winchester White Box", "USA"],
    models: ["USA223R1"],
    upcs: [],
    short: ".223",
    caliber: ".223 Rem",
    weightGr: 55,
    speedFps: 3240,
    bcG1: 0.255,
    barrelIn: 24,
    // Winchester USA223R1, winchesterle.com/catalog/winchester-usa-white-box/usa223r1
    // and winchester.com/Products/Ammunition/Rifle/USA/USA223R1:
    // .223 Rem 55 gr FMJ, 3240 ft/s, ballistic coefficient 0.255.
    // Winchester does not print a test barrel; 24 in is the SAAMI Z299.4 .223 barrel.
  },
  {
    id: "tula223",
    brand: "Tula",
    line: "Tula",
    brandAliases: ["Tula", "Tulammo"],
    models: ["TA223550"],
    upcs: [],
    short: ".223",
    caliber: ".223 Rem",
    weightGr: 55,
    speedFps: 3084,
    bcG1: 0.255,
    barrelIn: 24,
    // Tula steel-case .223 FMJ, tulammo.ru steel-case page
    // 223-rem-5-56x45-s-puley-fmj-55-gr-3-6-g-s-bimetallicheskoy-obolochkoy-i-stalnoy-gilzoy:
    // steel case, FMJ 55 gr (3.5–3.75 g), G1 ≈ 0.255, muzzle V0 ≈ 940 m/s (3084 ft/s).
    // The same page lists V25 not less than 900 m/s. This 0.255 is Tulammo's figure, not USA223R1.
    // TA223550 is the model on US 55 gr steel-case boxes. Tulammo does not print a test barrel; 24 in is SAAMI .223.
  },
  {
    id: "barnaul223",
    brand: "Barnaul",
    line: "Barnaul",
    brandAliases: ["Barnaul"],
    models: ["BRN223REMFMJBT55"],
    upcs: [],
    short: ".223",
    caliber: ".223 Rem",
    weightGr: 55,
    speedFps: 3133,
    bcG1: 0.225,
    barrelIn: 23.6,
    // Barnaul steel-case .223 FMJBT. JSC Barnaul Cartridge Plant catalog, barnaulpatron.ru/pdf/catalog.pdf:
    // 223 Rem FMJBT 55 gr (3.56 g), G1 0.225, V0 955 m/s (3133 ft/s), ballistic barrel 600 mm (23.6 in).
    // BRN223REMFMJBT55 is the model on the imported box. The importer page lists a different speed; this uses the factory catalog.
  },
  {
    id: "ae223",
    brand: "Federal",
    line: "Federal",
    brandAliases: ["Federal", "American Eagle"],
    models: ["AE223", "AE223C"],
    // gtins on the Federal product pages for 11-AE223 and 11-AE223C.
    upcs: ["029465084820", "604544707823"],
    short: ".223",
    caliber: ".223 Rem",
    weightGr: 55,
    speedFps: 3240,
    bcG1: 0.269,
    barrelIn: 24,
    // Federal American Eagle AE223, federalpremium.com/rifle/american-eagle/american-eagle-rifle/11-AE223.html:
    // .223 Rem 55 gr FMJ, 3240 ft/s, ballistic coefficient .269.
    // Test barrel 24 in: le.vistaoutdoor.com rifle details, Federal part AE223.
  },
  {
    id: "rem223",
    brand: "Remington",
    line: "Remington",
    brandAliases: ["Remington", "UMC"],
    models: ["23683", "L223R3"],
    // gtin on remington.com part 23683. L223R3 has no separate UPC on that page.
    upcs: ["047700398105"],
    short: ".223",
    caliber: ".223 Rem",
    weightGr: 55,
    speedFps: 3240,
    bcG1: 0.202,
    barrelIn: 24,
    // Remington UMC .223 Rem 55 gr FMJ, remington.com/rifle/umc-rifle/29-23683.html, part 23683:
    // 3240 ft/s, ballistic coefficient .202. Remington prints "Ballistic Coefficient" (the same field used as G1 elsewhere in this catalog).
    // L223R3 is the older index for the same 55 gr FMJ figure. Remington does not print a test barrel; 24 in is SAAMI .223.
  },
  {
    id: "ae",
    brand: "American Eagle",
    line: "American Eagle",
    brandAliases: ["American Eagle", "Federal"],
    models: ["AE9DP"],
    // gtin on federalpremium.com part 11-AE9DP.
    upcs: ["029465088224"],
    short: "9mm",
    caliber: "9mm Luger",
    weightGr: 115,
    speedFps: 1180,
    bcG1: 0.12,
    barrelIn: 4,
    // Federal American Eagle AE9DP, federalpremium.com/handgun/american-eagle/american-eagle-handgun/11-AE9DP.html:
    // 9mm Luger 115 gr FMJ, 1180 ft/s, test barrel 4 in.
    // G1 0.12 from Federal's law-enforcement listing, le.vistaoutdoor.com handgun details id 94.
    // This is the Federal 9mm 115 gr brass FMJ; it is not listed again under a second name.
  },
  {
    id: "blazer9",
    brand: "CCI Blazer",
    line: "CCI",
    brandAliases: ["CCI", "CCI Blazer", "Blazer"],
    models: ["5200"],
    // gtin on cci-ammunition.com part 6-5200.
    upcs: ["076683052001"],
    short: "9mm",
    caliber: "9mm Luger",
    weightGr: 115,
    speedFps: 1145,
    bcG1: null,
    barrelIn: 4,
    // CCI Blazer Brass 5200, cci-ammunition.com/handgun/blazer/blazer-brass/6-5200.html:
    // 9mm Luger 115 gr FMJ, 1145 ft/s. Test barrel 4 in on CCI's compare page and catalog.
    // CCI does not publish a G1 ballistic coefficient for this load.
  },
  {
    id: "ae9ap",
    brand: "Federal",
    line: "Federal",
    brandAliases: ["Federal", "American Eagle"],
    models: ["AE9AP"],
    // gtin on federalpremium.com part 11-AE9AP.
    upcs: ["029465088569"],
    short: "9mm",
    caliber: "9mm Luger",
    weightGr: 124,
    speedFps: 1150,
    bcG1: 0.15,
    barrelIn: 4,
    // Federal American Eagle AE9AP, federalpremium.com/handgun/american-eagle/american-eagle-handgun/11-AE9AP.html:
    // 9mm Luger 124 gr FMJ, 1150 ft/s, test barrel 4 in.
    // Ballistic coefficient 0.15 on Federal's law-enforcement listing, le.vistaoutdoor.com handgun details id 93.
  },
  {
    id: "ae9fp",
    brand: "Federal",
    line: "Federal",
    brandAliases: ["Federal", "American Eagle"],
    models: ["AE9FP"],
    // gtin on federalpremium.com part 11-AE9FP.
    upcs: ["029465089207"],
    short: "9mm",
    caliber: "9mm Luger",
    weightGr: 147,
    speedFps: 1000,
    bcG1: 0.2,
    barrelIn: 4,
    // Federal American Eagle AE9FP. Speed and 4 in test barrel:
    // federalpremium.com/handgun/american-eagle/american-eagle-handgun/11-AE9FP.html, 147 gr FMJ, 1000 ft/s.
    // Ballistic coefficient 0.2: le.vistaoutdoor.com handgun details id 95 (Federal part AE9FP).
  },
  {
    id: "rem9",
    brand: "Remington",
    line: "Remington",
    brandAliases: ["Remington", "UMC"],
    models: ["23728", "L9MM3"],
    // gtin on remington.com part 23728. L9MM3 has no separate UPC on that page.
    upcs: ["047700069807"],
    short: "9mm",
    caliber: "9mm Luger",
    weightGr: 115,
    speedFps: 1145,
    bcG1: null,
    barrelIn: 4,
    // Remington UMC L9MM3, order 23728, remington.com/handgun/umc-handgun/29-23728.html:
    // 9mm Luger 115 gr FMJ, 1145 ft/s. That page does not publish a ballistic coefficient.
    // Remington does not print a test barrel; 4 in is the SAAMI Z299.3 9mm barrel.
  },
  {
    id: "wwb9",
    brand: "Winchester White Box",
    line: "Winchester",
    brandAliases: ["Winchester", "Winchester White Box", "USA"],
    models: ["USA9MMVP"],
    upcs: [],
    short: "9mm",
    caliber: "9mm Luger",
    weightGr: 115,
    speedFps: 1190,
    bcG1: null,
    barrelIn: 4,
    // Winchester USA White Box USA9MMVP, winchester.com/Products/Ammunition/Handgun (USA handgun listing):
    // 9mm Luger 115 gr FMJ, muzzle 1190 ft/s. Winchester does not publish a ballistic coefficient.
    // The product page has no ballistics table. Winchester does not print a test barrel; 4 in is SAAMI 9mm.
  },
  {
    id: "cci",
    brand: "CCI Blazer",
    line: "CCI",
    brandAliases: ["CCI", "CCI Blazer", "Blazer"],
    models: ["21", "0021"],
    // gtin on cci-ammunition.com part 6-21.
    upcs: ["076683000217"],
    short: ".22",
    caliber: ".22 LR",
    weightGr: 40,
    speedFps: 1235,
    bcG1: 0.133,
    barrelIn: 24,
    // CCI Blazer .22 LR part 21, cci-ammunition.com/rimfire/cci/blazer-22/6-21.html:
    // 40 gr lead round nose, 1235 ft/s, ballistic coefficient .133.
    // CCI does not print a test barrel; 24 in is the SAAMI Z299.1 rimfire barrel.
  },
  {
    id: "minimag",
    brand: "CCI Mini-Mag",
    line: "CCI",
    brandAliases: ["CCI", "CCI Mini-Mag", "Mini-Mag"],
    models: ["30", "0030"],
    // gtin on cci-ammunition.com part 6-30.
    upcs: ["076683000309"],
    short: ".22",
    caliber: ".22 LR",
    weightGr: 40,
    speedFps: 1235,
    bcG1: 0.13,
    barrelIn: 24,
    // CCI Target Mini-Mag part 30, cci-ammunition.com/rimfire/cci/target-mini-mag/6-30.html:
    // 22 LR 40 gr copper-plated round nose, 1235 ft/s, ballistic coefficient .130.
    // Not the 36 gr hollow point. CCI does not print a test barrel; 24 in is the SAAMI rimfire barrel.
  },
  {
    id: "tula",
    brand: "Tula",
    line: "Tula",
    brandAliases: ["Tula", "Tulammo"],
    models: [],
    upcs: [],
    short: "7.62x39",
    caliber: "7.62×39",
    weightGr: 122,
    speedFps: 2329,
    bcG1: 0.303,
    barrelIn: 20,
    // Tula 7.62x39 FMJ, tulammo.ru/en/production/vintovochnye-patrony/patron-7-62kh39/:
    // B.C. (G1) = 0.303, V25 = 710 m/s (2329 ft/s). Mass 7.8–8.1 g; this uses 122 gr.
    // UL076240 is the model on US steel-case boxes. Tulammo does not print a test barrel; 20 in is the SAAMI 7.62x39 barrel.
  },
];

const LINE_ORDER = ["Winchester", "Federal", "American Eagle", "Remington", "CCI", "Tula", "Barnaul"];

export function presetById(id) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}

export function catalogLines() {
  const found = [];
  for (const preset of PRESETS) {
    if (preset.line && !found.includes(preset.line)) found.push(preset.line);
  }
  return [
    ...LINE_ORDER.filter((name) => found.includes(name)),
    ...found.filter((name) => !LINE_ORDER.includes(name)),
  ];
}

function boxCode(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function brandNames(preset) {
  return [preset.brand, ...(preset.brandAliases || [])];
}

/** Match a box by model number, then brand. Returns null when nothing in the catalog matches. */
export function findBox(brand, model) {
  const code = boxCode(model);
  if (!code) return null;
  const hits = PRESETS.filter((preset) => (preset.models || []).some((item) => boxCode(item) === code));
  if (!hits.length) return null;
  const typed = boxCode(brand);
  if (!typed) return hits.length === 1 ? hits[0] : null;
  const branded = hits.filter((preset) =>
    brandNames(preset).some((name) => {
      const normalized = boxCode(name);
      return normalized === typed || normalized.includes(typed) || (typed.length >= 3 && typed.includes(normalized));
    })
  );
  return branded[0] || null;
}

/**
 * Catalog speed at a barrel length. A typed muzzle speed replaces the shift.
 * Shift is 25 ft/s per inch away from the load's reference barrel.
 */
export function muzzleFps(preset, barrelIn, overrideFps) {
  if (Number.isFinite(overrideFps)) return overrideFps;
  const shifted = preset.speedFps + FPS_PER_INCH * (barrelIn - preset.barrelIn);
  return Math.min(4500, Math.max(300, shifted));
}
