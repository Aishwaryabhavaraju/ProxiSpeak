const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildNearbyFilter,
  buildWithinFilter,
} = require("../src/services/proximity");

test("nearby query excludes the speaker and bounds distance", () => {
  assert.deepEqual(buildNearbyFilter("user-1", 12, 8, 4), {
    userId: { $ne: "user-1" },
    location: { $near: [12, 8], $maxDistance: 4 },
  });
});

test("within query builds a planar radius search", () => {
  assert.deepEqual(buildWithinFilter(12, 8, 4), {
    location: { $geoWithin: { $center: [[12, 8], 4] } },
  });
});