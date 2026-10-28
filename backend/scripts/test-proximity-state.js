const assert = require("node:assert/strict");

const {
  ProximityStateManager,
} = require("../utils/proximityStateManager");

const manager = new ProximityStateManager(100);

// Register two users far apart.
manager.updatePosition("A", [0, 0]);
manager.updatePosition("B", [200, 0]);

// B moves within range of A: one enter transition.
let events = manager.updatePosition("B", [50, 0]);
assert.equal(events.length, 1);
assert.equal(events[0].type, "enter");
assert.equal(manager.isNearby("A", "B"), true);

// A remains in range: no duplicate enter.
events = manager.updatePosition("A", [10, 0]);
assert.equal(events.length, 0);

// B moves outside range: one exit transition.
events = manager.updatePosition("B", [150, 0]);
assert.equal(events.length, 1);
assert.equal(events[0].type, "exit");
assert.equal(manager.isNearby("A", "B"), false);

// Repeated movement outside range: no duplicate exit.
events = manager.updatePosition("B", [180, 0]);
assert.equal(events.length, 0);

// Disconnect cleanup also removes active pairs.
manager.updatePosition("B", [50, 0]);
events = manager.removeUser("B");
assert.equal(events.length, 1);
assert.equal(events[0].type, "exit");
assert.equal(manager.isNearby("A", "B"), false);

console.log("PASS: proximity enter/exit tests");
