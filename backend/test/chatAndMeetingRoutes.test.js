const assert = require("node:assert/strict");
const test = require("node:test");
const ChatMessage = require("../models/ChatMessage");
const Meeting = require("../models/Meeting");
const chatRoutes = require("../routes/chatRoutes");
const meetingRoutes = require("../routes/meetingRoutes");

// Helper to simulate Express res object
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
function getHandler(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer) {
    throw new Error(`Handler not found for ${method} ${path}`);
  }
  return layer.route.stack[0].handle;
}

test("ChatMessage Model - Schema Defaults & Validations", () => {
  const msg = new ChatMessage({
    messageId: "MSG_TEST_01",
    type: "room",
    roomId: "MAIN-OFFICE",
    senderId: "user_alice",
    senderUsername: "Alice",
    text: "Hello team! 🚀",
  });

  assert.equal(msg.messageId, "MSG_TEST_01");
  assert.equal(msg.type, "room");
  assert.equal(msg.roomId, "MAIN-OFFICE");
  assert.equal(msg.senderUsername, "Alice");
  assert.equal(msg.text, "Hello team! 🚀");
  assert.equal(msg.read, false);
});

test("Meeting Model - Schema Defaults & Validations", () => {
  const meeting = new Meeting({
    title: "Sprint Planning",
    description: "Bi-weekly sprint planning",
    date: "2026-11-10",
    startTime: "10:00",
    endTime: "11:00",
    durationMinutes: 60,
    roomId: "MAIN-OFFICE",
    createdBy: "alice",
    creatorName: "Alice",
    status: "scheduled",
  });

  assert.equal(meeting.title, "Sprint Planning");
  assert.equal(meeting.date, "2026-11-10");
  assert.equal(meeting.startTime, "10:00");
  assert.equal(meeting.endTime, "11:00");
  assert.equal(meeting.durationMinutes, 60);
  assert.equal(meeting.status, "scheduled");
});

test("POST /api/chat/message - Validation Failure with missing text", async () => {
  const handler = getHandler(chatRoutes, "POST", "/message");
  const req = {
    body: {
      senderId: "user1",
      senderUsername: "User 1",
      text: "", // missing
    },
  };
  const res = createMockRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test("POST /api/meetings - Validation Failure with invalid date format", async () => {
  const handler = getHandler(meetingRoutes, "POST", "/");
  const req = {
    body: {
      title: "Design Review",
      date: "invalid-date",
      startTime: "10:00",
      endTime: "11:00",
      roomId: "MAIN-OFFICE",
      createdBy: "bob",
    },
  };
  const res = createMockRes();

  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

