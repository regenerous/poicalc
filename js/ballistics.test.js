import assert from "node:assert/strict";
import test from "node:test";
import { heightAt, solvePoi } from "./ballistics.js";
import { FPS_PER_INCH, muzzleFps, presetById } from "./presets.js";

function drop(speed, bc, sight, zero, yards) {
  const poi = solvePoi({ speedFps: speed, bc, sightIn: sight, zeroYd: zero, distanceYd: yards });
  return poi;
}

test("matches Federal AE193 published drops", () => {
  const at200 = drop(3165, 0.246, 1.5, 100, 200);
  const at300 = drop(3165, 0.246, 1.5, 100, 300);
  assert.ok(Math.abs(at200.impactIn - -3.0) < 0.25, String(at200.impactIn));
  assert.ok(Math.abs(at300.impactIn - -12.1) < 0.3, String(at300.impactIn));
  assert.ok(Math.abs(heightAt(3165, 0.246, 1.5, 0, 0) + 1.5) < 1e-9);
});

test("matches CCI Blazer and American Eagle 9mm drops", () => {
  const cci = drop(1235, 0.133, 1.5, 100, 50);
  const ae = drop(1180, 0.12, 0.9, 25, 100);
  assert.ok(Math.abs(cci.impactIn - 2.9) < 0.2, String(cci.impactIn));
  assert.ok(Math.abs(ae.impactIn - -8.7) < 0.3, String(ae.impactIn));
});

test("a 50 yard rifle zero climbs through, then falls back through", () => {
  const fed = presetById("fed");
  const speed = muzzleFps(fed, 16, null);
  assert.equal(speed, fed.speedFps + FPS_PER_INCH * (16 - fed.barrelIn));
  const poi = solvePoi({
    speedFps: speed,
    bc: fed.bcG1,
    sightIn: 1.93,
    zeroYd: 50,
    distanceYd: 300,
  });
  assert.equal(poi.zeroReached, true);
  assert.ok(poi.climbYd != null && Math.abs(poi.climbYd - 50) < 1, String(poi.climbYd));
  assert.ok(poi.fallYd != null && poi.fallYd > poi.climbYd + 50, String(poi.fallYd));
  assert.ok(poi.impactIn < -1, String(poi.impactIn));
  assert.ok(Math.abs(heightAt(speed, fed.bcG1, 1.93, 0, 0) + 1.93) < 1e-6);
});

test("a typed speed replaces the barrel shift", () => {
  const fed = presetById("fed");
  assert.equal(muzzleFps(fed, 10, 3000), 3000);
});

test("a far zero still has an earlier climb", () => {
  const poi = solvePoi({
    speedFps: 3165,
    bc: 0.246,
    sightIn: 1.5,
    zeroYd: 200,
    distanceYd: 300,
  });
  assert.ok(poi.climbYd != null && poi.climbYd < 80, String(poi.climbYd));
  assert.ok(poi.fallYd != null && Math.abs(poi.fallYd - 200) < 1.5, String(poi.fallYd));
});
