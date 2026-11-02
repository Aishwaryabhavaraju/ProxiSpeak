const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const OfficeLayout = require("../models/OfficeLayout");
const officeLayoutRoutes = require("../routes/officeLayoutRoutes");

// Helper to simulate Express request/response against route handlers
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// Find route handler in router stack
function getHandler(method, path) {
  const layer = officeLayoutRoutes.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer) {
    throw new Error(`Handler not found for ${method} ${path}`);
  }
  return layer.route.stack[0].handle;
}

test("OfficeLayout Model - Schema Defaults & Validations", () => {
  const doc = new OfficeLayout({
    roomId: "ROOM_TEST_1",
    roomName: "Engineering Bay",
    dimensions: { width: 1000, height: 800 },
    furniture: [
      {
        name: "Main Desk",
        type: "desk",
        x: 10,
        y: 20,
        width: 120,
        height: 60,
      },
    ],
  });

  assert.equal(doc.background, "#111827");
  assert.equal(doc.furniture[0].rotation, 0);
  assert.equal(doc.furniture[0].obstacleType, "solid");
  assert.equal(doc.furniture[0].blocksMovement, true);
  assert.equal(doc.furniture[0].blocksAudio, false);

  // Validate required fields
  const invalidDoc = new OfficeLayout({});
  const validationError = invalidDoc.validateSync();
  assert.ok(validationError.errors.roomId);
  assert.ok(validationError.errors.roomName);
  assert.ok(validationError.errors["dimensions.width"]);
  assert.ok(validationError.errors["dimensions.height"]);
});

test("OfficeLayout Model - Furniture Type Enum Validation", () => {
  const invalidFurnitureDoc = new OfficeLayout({
    roomId: "ROOM_TEST_2",
    roomName: "Test Room",
    dimensions: { width: 500, height: 500 },
    furniture: [
      {
        name: "Invalid Object",
        type: "spaceship", // not in enum
        x: 10,
        y: 10,
        width: 50,
        height: 50,
      },
    ],
  });

  const err = invalidFurnitureDoc.validateSync();
  assert.ok(err.errors["furniture.0.type"]);
});

test("POST /api/office-layouts - Validation and Creation", async () => {
  const postHandler = getHandler("POST", "/");

  // Missing required fields
  const reqMissing = { body: { roomId: "TEST_1" } };
  const resMissing = createMockRes();
  await postHandler(reqMissing, resMissing);
  assert.equal(resMissing.statusCode, 400);
  assert.equal(resMissing.body.success, false);

  // Mock OfficeLayout.findOne to simulate existing room
  const origFindOne = OfficeLayout.findOne;
  const origCreate = OfficeLayout.create;

  try {
    OfficeLayout.findOne = async () => ({ roomId: "TEST_EXISTS" });
    const reqDuplicate = {
      body: {
        roomId: "TEST_EXISTS",
        roomName: "Existing Office",
        dimensions: { width: 1200, height: 800 },
      },
    };
    const resDuplicate = createMockRes();
    await postHandler(reqDuplicate, resDuplicate);
    assert.equal(resDuplicate.statusCode, 409);
    assert.equal(resDuplicate.body.message, "Office layout already exists");

    // Success creation
    OfficeLayout.findOne = async () => null;
    OfficeLayout.create = async (payload) => ({
      ...payload,
      _id: new mongoose.Types.ObjectId(),
    });

    const reqSuccess = {
      body: {
        roomId: "TEST_NEW",
        roomName: "New Office",
        dimensions: { width: 1200, height: 800 },
        background: "#0f172a",
        furniture: [],
        createdBy: "user_42",
      },
    };
    const resSuccess = createMockRes();
    await postHandler(reqSuccess, resSuccess);
    assert.equal(resSuccess.statusCode, 201);
    assert.equal(resSuccess.body.success, true);
    assert.equal(resSuccess.body.data.roomId, "TEST_NEW");
  } finally {
    OfficeLayout.findOne = origFindOne;
    OfficeLayout.create = origCreate;
  }
});

test("GET /api/office-layouts/:roomId - Retrieval", async () => {
  const getHandlerFn = getHandler("GET", "/:roomId");
  const origFindOne = OfficeLayout.findOne;

  try {
    // 404 when not found
    OfficeLayout.findOne = async () => null;
    const reqNotFound = { params: { roomId: "NONEXISTENT" } };
    const resNotFound = createMockRes();
    await getHandlerFn(reqNotFound, resNotFound);
    assert.equal(resNotFound.statusCode, 404);
    assert.equal(resNotFound.body.success, false);

    // 200 when found
    OfficeLayout.findOne = async ({ roomId }) => ({
      roomId,
      roomName: "My Office",
      dimensions: { width: 1000, height: 800 },
    });
    const reqFound = { params: { roomId: "OFFICE_A" } };
    const resFound = createMockRes();
    await getHandlerFn(reqFound, resFound);
    assert.equal(resFound.statusCode, 200);
    assert.equal(resFound.body.success, true);
    assert.equal(resFound.body.data.roomId, "OFFICE_A");
  } finally {
    OfficeLayout.findOne = origFindOne;
  }
});

test("PUT /api/office-layouts/:roomId - Update Layout", async () => {
  const putHandlerFn = getHandler("PUT", "/:roomId");
  const origFindOneAndUpdate = OfficeLayout.findOneAndUpdate;

  try {
    // 404 when not found
    OfficeLayout.findOneAndUpdate = async () => null;
    const reqNotFound = {
      params: { roomId: "NONEXISTENT" },
      body: { roomName: "New Name" },
    };
    const resNotFound = createMockRes();
    await putHandlerFn(reqNotFound, resNotFound);
    assert.equal(resNotFound.statusCode, 404);

    // 200 when updated
    OfficeLayout.findOneAndUpdate = async (filter, update) => ({
      roomId: filter.roomId,
      roomName: update.$set.roomName,
    });
    const reqFound = {
      params: { roomId: "OFFICE_B" },
      body: { roomName: "Updated Office" },
    };
    const resFound = createMockRes();
    await putHandlerFn(reqFound, resFound);
    assert.equal(resFound.statusCode, 200);
    assert.equal(resFound.body.success, true);
    assert.equal(resFound.body.data.roomName, "Updated Office");
  } finally {
    OfficeLayout.findOneAndUpdate = origFindOneAndUpdate;
  }
});

test("Furniture Subdocument Operations - Add, Patch, Delete", async () => {
  const postFurnitureHandler = getHandler("POST", "/:roomId/furniture");
  const patchFurnitureHandler = getHandler(
    "PATCH",
    "/:roomId/furniture/:furnitureId"
  );
  const deleteFurnitureHandler = getHandler(
    "DELETE",
    "/:roomId/furniture/:furnitureId"
  );

  const origFindOne = OfficeLayout.findOne;

  try {
    // Mock layout document
    const furnitureId = new mongoose.Types.ObjectId();
    const furnitureItem = {
      _id: furnitureId,
      name: "Desk",
      type: "desk",
      x: 100,
      y: 100,
      width: 100,
      height: 60,
      rotation: 0,
      set(key, val) {
        this[key] = val;
      },
      deleteOne() {
        this.deleted = true;
      },
    };

    const mockDoc = {
      roomId: "OFFICE101",
      furniture: {
        items: [furnitureItem],
        push(item) {
          this.items.push(item);
        },
        id(id) {
          return this.items.find((i) => i._id.toString() === id.toString()) || null;
        },
      },
      saved: false,
      async save() {
        this.saved = true;
      },
    };

    OfficeLayout.findOne = async () => mockDoc;

    // 1. POST furniture
    const reqAdd = {
      params: { roomId: "OFFICE101" },
      body: {
        name: "Chair",
        type: "chair",
        x: 150,
        y: 120,
        width: 40,
        height: 40,
      },
    };
    const resAdd = createMockRes();
    await postFurnitureHandler(reqAdd, resAdd);
    assert.equal(resAdd.statusCode, 201);
    assert.equal(resAdd.body.success, true);

    // 2. PATCH invalid furniture ID
    const reqInvalidPatch = {
      params: { roomId: "OFFICE101", furnitureId: "not-an-objectid" },
      body: { rotation: 45 },
    };
    const resInvalidPatch = createMockRes();
    await patchFurnitureHandler(reqInvalidPatch, resInvalidPatch);
    assert.equal(resInvalidPatch.statusCode, 400);

    // 3. PATCH valid furniture item
    const reqPatch = {
      params: { roomId: "OFFICE101", furnitureId: furnitureId.toString() },
      body: { x: 220, rotation: 90 },
    };
    const resPatch = createMockRes();
    await patchFurnitureHandler(reqPatch, resPatch);
    assert.equal(resPatch.statusCode, 200);
    assert.equal(resPatch.body.success, true);
    assert.equal(furnitureItem.x, 220);
    assert.equal(furnitureItem.rotation, 90);

    // 4. DELETE valid furniture item
    const reqDel = {
      params: { roomId: "OFFICE101", furnitureId: furnitureId.toString() },
    };
    const resDel = createMockRes();
    await deleteFurnitureHandler(reqDel, resDel);
    assert.equal(resDel.statusCode, 200);
    assert.equal(resDel.body.success, true);
    assert.equal(furnitureItem.deleted, true);
  } finally {
    OfficeLayout.findOne = origFindOne;
  }
});

