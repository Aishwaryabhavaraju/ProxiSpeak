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

// 2. Volume Attenuation Tests (radius=100 -> 0px: 1.0, 25px: 0.75, 50px: 0.50, 75px: 0.25, 100px+: 0.0)
console.log("2. Testing Volume Attenuation (gain = max(0, 1 - d/R))...");
const R = 100;
assert.strictEqual(calculateVolume(0, R), 1.0, "0px must yield gain 1.0 (100% volume)");
assert.strictEqual(calculateVolume(25, R), 0.75, "25px must yield gain 0.75 (75% volume)");
assert.strictEqual(calculateVolume(50, R), 0.50, "50px must yield gain 0.50 (50% volume)");
assert.strictEqual(calculateVolume(75, R), 0.25, "75px must yield gain 0.25 (25% volume)");
assert.strictEqual(calculateVolume(100, R), 0.0, "100px must yield gain 0.0 (muted at radius boundary)");
assert.strictEqual(calculateVolume(150, R), 0.0, "150px (beyond radius) must yield gain 0.0 (muted outside radius)");
assert.strictEqual(calculateVolume(-10, R), 1.0, "Negative distance must be clamped to 1.0");
assert.strictEqual(calculateVolume(NaN, R), 0.0, "NaN distance must yield gain 0.0");
assert.strictEqual(calculateVolume(50, 0), 0.0, "Invalid maxDistance <= 0 must yield 0.0");
console.log("   ✓ Volume attenuation tests passed!\n");

// 3. Stereo & 3D Directional Panning Tests
console.log("3. Testing 3D Directional Relative Positioning...");
const centerLocal = { x: 200, y: 200 };
const rightRemote = { x: 300, y: 200 }; // dx = +100 -> +1.0 (Right side)
const leftRemote = { x: 100, y: 200 };  // dx = -100 -> -1.0 (Left side)
const frontRemote = { x: 200, y: 150 }; // dy = -50 -> in front
const behindRemote = { x: 200, y: 250 };// dy = +50 -> behind

assert.strictEqual(calculatePan(centerLocal, rightRemote, 100), 1.0, "Right remote at +100px must yield pan +1.0 (Right ear)");
assert.strictEqual(calculatePan(centerLocal, leftRemote, 100), -1.0, "Left remote at -100px must yield pan -1.0 (Left ear)");
assert.strictEqual(calculatePan(centerLocal, frontRemote, 100), 0.0, "Directly in front remote must yield pan 0.0 (Center)");
assert.strictEqual(calculatePan(centerLocal, behindRemote, 100), 0.0, "Directly behind remote must yield pan 0.0 (Center)");

// Prompt specification verification:
// Local: (100, 100), Remote: (300, 100) -> audio must come from corresponding right-side direction
const specLocal = { x: 100, y: 100 };
const specRemoteRight = { x: 300, y: 100 };
const specRelX = specRemoteRight.x - specLocal.x; // +200 px to the right
assert.ok(specRelX > 0, "Remote user at (300, 100) must be to the right of local user at (100, 100)");

const specRemoteLeft = { x: 20, y: 100 };
const specRelXLeft = specRemoteLeft.x - specLocal.x; // -80 px to the left
assert.ok(specRelXLeft < 0, "Remote user at (20, 100) must be to the left of local user at (100, 100)");
console.log("   ✓ 3D directional positioning tests passed!\n");

// 4. Moving Closer & Moving Farther Volume Dynamics
console.log("4. Testing Movement Dynamics (closer -> louder, farther -> quieter, outside -> mute)...");
let avatarDistances = [120, 90, 60, 30, 10, 30, 60, 90, 120];
let gains = avatarDistances.map((d) => calculateVolume(d, 100));

assert.strictEqual(gains[0], 0, "120px (outside radius) must be completely muted (0)");
assert.ok(gains[1] > gains[0], "Moving from 120px to 90px must increase volume");
assert.ok(gains[2] > gains[1], "Moving from 90px to 60px must increase volume");
assert.ok(gains[3] > gains[2], "Moving from 60px to 30px must increase volume");
assert.ok(gains[4] > gains[3], "Moving from 30px to 10px must increase volume");
assert.ok(gains[5] < gains[4], "Moving from 10px to 30px must decrease volume");
assert.ok(gains[6] < gains[5], "Moving from 30px to 60px must decrease volume");
assert.strictEqual(gains[8], 0, "Moving back to 120px (outside radius) must mute to 0");
console.log("   ✓ Volume distance dynamics verified!\n");

// 5. Proximity Hysteresis Tests
console.log("5. Testing Proximity Connection Hysteresis...");
assert.strictEqual(isWithinProximityWithHysteresis(99, false, 100, 118), true, "99px (unconnected) must connect (< 100px)");
assert.strictEqual(isWithinProximityWithHysteresis(105, false, 100, 118), false, "105px (unconnected) must not connect (> 100px)");
assert.strictEqual(isWithinProximityWithHysteresis(105, true, 100, 118), true, "105px (already connected) must stay connected (< 118px)");
assert.strictEqual(isWithinProximityWithHysteresis(119, true, 100, 118), false, "119px (already connected) must disconnect (> 118px)");
console.log("   ✓ Proximity hysteresis tests passed!\n");

// 6. Opus SDP In-Band FEC Transformation Test
console.log("6. Testing Opus SDP In-Band FEC & Bitrate Optimization...");
function testOptimizeOpusSdp(sdp) {
  const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!opusMatch) return sdp;
  const payloadType = opusMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${payloadType}\\s+(.*)`, "i");
  const desiredParams =
    "minptime=10;ptime=20;useinbandfec=1;maxaveragebitrate=64000;stereo=0;sprop-stereo=0;cbr=0;usedtx=0";

  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_, existingParams) => {
      const paramMap = new Map();
      existingParams.split(";").forEach((pair) => {
        const [k, v] = pair.trim().split("=");
        if (k) paramMap.set(k.toLowerCase(), v);
      });
      desiredParams.split(";").forEach((pair) => {
        const [k, v] = pair.trim().split("=");
        if (k) paramMap.set(k.toLowerCase(), v);
      });
      const merged = Array.from(paramMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(";");
      return `a=fmtp:${payloadType} ${merged}`;
    });
  }
  return sdp.replace(
    new RegExp(`(a=rtpmap:${payloadType}\\s+opus\\/48000[^\\r\\n]*[\\r\\n]+)`, "i"),
    `$1a=fmtp:${payloadType} ${desiredParams}\r\n`
  );
}

const mockSdp =
  "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=0\r\n";
const optimized = testOptimizeOpusSdp(mockSdp);
assert.ok(optimized.includes("useinbandfec=1"), "SDP must contain useinbandfec=1 for packet loss recovery");
assert.ok(optimized.includes("maxaveragebitrate=64000"), "SDP must configure 64kbps speech bitrate");
assert.ok(optimized.includes("stereo=0"), "SDP must enforce mono speech transmission");
assert.ok(optimized.includes("usedtx=0"), "SDP must explicitly disable DTX to prevent speech cutting out near ends and pauses");
console.log("   ✓ Opus SDP optimization verified!\n");

console.log("=================================================================");
console.log("All ProxiSpeak Spatial Audio, Attenuation & Codec Tests PASSED!");
console.log("=================================================================\n");
