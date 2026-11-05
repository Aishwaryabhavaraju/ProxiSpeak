import assert from "node:assert";
import { calculateDistance } from "./distance.js";
import {
  calculateVolume,
  calculatePan,
  isWithinProximityWithHysteresis,
} from "./audioCalculations.js";

console.log("=== Running ProxiSpeak Spatial Audio & Attenuation Unit Tests ===\n");

// 1. Distance Calculation Tests
console.log("1. Testing Euclidean Distance Calculation...");
const p1 = { x: 100, y: 100 };
const p2 = { x: 130, y: 140 }; // 30^2 + 40^2 = 900 + 1600 = 2500 -> sqrt = 50
assert.strictEqual(calculateDistance(p1, p2), 50, "Distance between (100,100) and (130,140) must be 50");
assert.strictEqual(calculateDistance(p1, p1), 0, "Distance to self must be 0");
assert.strictEqual(calculateDistance(null, p2), Infinity, "Null user must return Infinity");
assert.strictEqual(calculateDistance(p1, { x: NaN, y: 100 }), Infinity, "NaN coordinate must return Infinity");
console.log("   ✓ Euclidean distance tests passed!\n");

// 2. Volume Attenuation Tests (prompt specifications: radius=100 -> 0px: 1.0, 25px: 0.75, 50px: 0.50, 75px: 0.25, 100px+: 0.0)
console.log("2. Testing Volume Attenuation (gain = max(0, 1 - d/R))...");
const R = 100;
assert.strictEqual(calculateVolume(0, R), 1.0, "0px must yield gain 1.0");
assert.strictEqual(calculateVolume(25, R), 0.75, "25px must yield gain 0.75");
assert.strictEqual(calculateVolume(50, R), 0.50, "50px must yield gain 0.50");
assert.strictEqual(calculateVolume(75, R), 0.25, "75px must yield gain 0.25");
assert.strictEqual(calculateVolume(100, R), 0.0, "100px must yield gain 0.0");
assert.strictEqual(calculateVolume(150, R), 0.0, "150px (beyond radius) must yield gain 0.0");
assert.strictEqual(calculateVolume(-10, R), 1.0, "Negative distance must be clamped to 1.0");
assert.strictEqual(calculateVolume(NaN, R), 0.0, "NaN distance must yield gain 0.0");
assert.strictEqual(calculateVolume(50, 0), 0.0, "Invalid maxDistance <= 0 must yield 0.0");
console.log("   ✓ Volume attenuation tests passed!\n");

// 3. Stereo Panning Tests (-1 left, 0 centre, +1 right)
console.log("3. Testing Stereo Panning (clamp(-1, +1, dx / R))...");
const centerLocal = { x: 200, y: 200 };
const rightRemote = { x: 300, y: 200 }; // dx = +100 -> +1.0
const leftRemote = { x: 100, y: 200 };  // dx = -100 -> -1.0
const midRight = { x: 250, y: 200 };    // dx = +50  -> +0.5
const midLeft = { x: 150, y: 200 };     // dx = -50  -> -0.5
const sameX = { x: 200, y: 250 };       // dx = 0    -> 0.0

assert.strictEqual(calculatePan(centerLocal, rightRemote, 100), 1.0, "Right remote at +100px must yield pan +1.0");
assert.strictEqual(calculatePan(centerLocal, leftRemote, 100), -1.0, "Left remote at -100px must yield pan -1.0");
assert.strictEqual(calculatePan(centerLocal, midRight, 100), 0.5, "Mid-right remote at +50px must yield pan +0.5");
assert.strictEqual(calculatePan(centerLocal, midLeft, 100), -0.5, "Mid-left remote at -50px must yield pan -0.5");
assert.strictEqual(calculatePan(centerLocal, sameX, 100), 0.0, "Vertically aligned remote must yield pan 0.0 (center)");

// Clamping test beyond radius
const farRight = { x: 450, y: 200 }; // dx = +250
assert.strictEqual(calculatePan(centerLocal, farRight, 100), 1.0, "dx > maxDistance must clamp to +1.0");
const farLeft = { x: 0, y: 200 };    // dx = -200
assert.strictEqual(calculatePan(centerLocal, farLeft, 100), -1.0, "dx < -maxDistance must clamp to -1.0");
assert.strictEqual(calculatePan(null, farRight, 100), 0.0, "Null user must yield center pan (0.0)");
console.log("   ✓ Stereo panning tests passed!\n");

// 4. Proximity Hysteresis Tests (entry: 100px, exit: 118px)
console.log("4. Testing Proximity Connection Hysteresis...");
assert.strictEqual(isWithinProximityWithHysteresis(99, false, 100, 118), true, "99px (unconnected) must connect (< 100px)");
assert.strictEqual(isWithinProximityWithHysteresis(105, false, 100, 118), false, "105px (unconnected) must not connect (> 100px)");
assert.strictEqual(isWithinProximityWithHysteresis(105, true, 100, 118), true, "105px (already connected) must stay connected (< 118px)");
assert.strictEqual(isWithinProximityWithHysteresis(119, true, 100, 118), false, "119px (already connected) must disconnect (> 118px)");
console.log("   ✓ Proximity hysteresis tests passed!\n");

console.log("All Spatial Audio & Attenuation tests completed successfully!");
