const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveMongoUri } = require("../src/server");

test("resolveMongoUri uses the environment override when present", () => {
  const previous = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://example.com/custom-db";

  try {
    assert.equal(resolveMongoUri(), "mongodb://example.com/custom-db");
  } finally {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  }
});

test("resolveMongoUri falls back to the local MongoDB default", () => {
  const previous = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;

  try {
    assert.equal(resolveMongoUri(), "mongodb://127.0.0.1:27017/proxispeak");
  } finally {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  }
});
