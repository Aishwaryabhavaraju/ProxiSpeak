const assert = require("node:assert/strict");
const test = require("node:test");
const { getProximityChanges } = require("../utils/proximityTracker");

test("getProximityChanges returns entered users when previous is empty", () => {
  const previousUsers = [];
  const currentUsers = ["bob"];

  const { entered, exited } = getProximityChanges(previousUsers, currentUsers);
  assert.deepEqual(entered, ["bob"]);
  assert.deepEqual(exited, []);
});

test("getProximityChanges returns no changes when user remains in earshot", () => {
  const previousUsers = ["bob"];
  const currentUsers = ["bob"];

  const { entered, exited } = getProximityChanges(previousUsers, currentUsers);
  assert.deepEqual(entered, []);
  assert.deepEqual(exited, []);
});

test("getProximityChanges returns exited users when user leaves earshot", () => {
  const previousUsers = ["bob"];
  const currentUsers = [];

  const { entered, exited } = getProximityChanges(previousUsers, currentUsers);
  assert.deepEqual(entered, []);
  assert.deepEqual(exited, ["bob"]);
});

test("getProximityChanges handles multiple users entering and exiting simultaneously", () => {
  const previousUsers = ["bob", "charlie"];
  const currentUsers = ["bob", "david"];

  const { entered, exited } = getProximityChanges(previousUsers, currentUsers);
  assert.deepEqual(entered, ["david"]);
  assert.deepEqual(exited, ["charlie"]);
});
