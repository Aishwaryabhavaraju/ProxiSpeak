const assert = require("assert");

const {
  calculateDistance,
  isWithinEarshot,
  EARSHOT_RADIUS,
} = require("../utils/earshot");

const tests = [
  {
    name: "Same position",
    a: [100, 100],
    b: [100, 100],
    expected: true,
  },
  {
    name: "Inside earshot",
    a: [100, 100],
    b: [150, 100],
    expected: true,
  },
  {
    name: "Exactly at 100 pixels",
    a: [100, 100],
    b: [200, 100],
    expected: true,
  },
  {
    name: "Outside earshot",
    a: [100, 100],
    b: [201, 100],
    expected: false,
  },
  {
    name: "Diagonal distance",
    a: [0, 0],
    b: [60, 80],
    expected: true,
  },
];

console.log("PROXIMITY BOUNDARY TESTS");

let passed = 0;

for (const test of tests) {
  const distance = calculateDistance(test.a, test.b);
  const actual = isWithinEarshot(test.a, test.b);

  try {
    assert.strictEqual(actual, test.expected);
    console.log(`PASS: ${test.name} (${distance}px)`);
    passed++;
  } catch {
    console.log(`FAIL: ${test.name} (${distance}px)`);
  }
}

console.log(`\n${passed}/${tests.length} tests passed.`);
console.log(`Configured earshot radius: ${EARSHOT_RADIUS}px`);

if (passed !== tests.length) {
  process.exitCode = 1;
}

