const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateDistance,
  isWithinEarshot,
  EARSHOT_RADIUS,
} = require("../utils/earshot");
const OfficeLayout = require("../models/OfficeLayout");
const {
  checkSoundObstruction,
} = require("../services/soundObstructionService");

test("Day 27: Proximity Boundary Validation Suite", () => {
  assert.equal(EARSHOT_RADIUS, 100);

  // 1. Same position
  assert.equal(calculateDistance([100, 100], [100, 100]), 0);
  assert.equal(isWithinEarshot([100, 100], [100, 100]), true);

  // 2. Inside earshot (50px)
  assert.equal(calculateDistance([100, 100], [150, 100]), 50);
  assert.equal(isWithinEarshot([100, 100], [150, 100]), true);

  // 3. Exactly at 100 pixels
  assert.equal(calculateDistance([100, 100], [200, 100]), 100);
  assert.equal(isWithinEarshot([100, 100], [200, 100]), true);

  // 4. Just outside earshot (101px)
  assert.equal(calculateDistance([100, 100], [201, 100]), 101);
  assert.equal(isWithinEarshot([100, 100], [201, 100]), false);

  // 5. Diagonal exact boundary (3-4-5 triangle scaled: 60, 80 -> 100)
  assert.equal(calculateDistance([0, 0], [60, 80]), 100);
  assert.equal(isWithinEarshot([0, 0], [60, 80]), true);
});

test("Day 27: Sound Obstruction Validation Logic", async () => {
  const origFindOne = OfficeLayout.findOne;
  try {
    OfficeLayout.findOne = () => ({
      select() {
        return {
          async lean() {
            return {
              furniture: [
                {
                  _id: "obs_wall_1",
                  name: "Test Sound Wall",
                  type: "wall",
                  x: 100,
                  y: 100,
                  width: 40,
                  height: 100,
                  obstacleType: "solid",
                  blocksMovement: true,
                  blocksAudio: true,
                },
              ],
            };
          },
        };
      },
    });

    const result = await checkSoundObstruction(
      "DAY27_ROOM",
      { x: 50, y: 150 },
      { x: 200, y: 150 }
    );

    assert.equal(result.isObstructed, true);
    assert.equal(result.hasLineOfSight, false);
    assert.equal(result.obstructions.length, 1);
    assert.equal(result.obstructions[0].name, "Test Sound Wall");
  } finally {
    OfficeLayout.findOne = origFindOne;
  }
});

