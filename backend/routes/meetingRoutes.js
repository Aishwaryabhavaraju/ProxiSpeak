const express = require("express");
const Meeting = require("../models/Meeting");

const router = express.Router();

// --------------------------------------------------
// POST: Schedule a new meeting
// URL: POST /api/meetings
// --------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      startTime,
      endTime,
      durationMinutes,
      roomId,
      roomName,
      createdBy,
      creatorName,
      invitees,
    } = req.body || {};

    if (!title || !date || !startTime || !endTime || !roomId || !createdBy) {
      return res.status(400).json({
        success: false,
        message: "title, date, startTime, endTime, roomId, and createdBy are required.",
      });
    }

    // Basic date/time validation (e.g. YYYY-MM-DD and HH:MM format)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{1,2}:\d{2}$/;

    if (!dateRegex.test(date) || !timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date or time format. Expected YYYY-MM-DD and HH:MM.",
      });
    }

    const meeting = await Meeting.create({
      title: title.trim(),
      description: description ? description.trim() : "",
      date,
      startTime,
      endTime,
      durationMinutes: durationMinutes ? Number(durationMinutes) : 30,
      roomId: roomId.trim().toUpperCase(),
      roomName: roomName ? roomName.trim() : roomId.trim().toUpperCase(),
      createdBy: createdBy.trim(),
      creatorName: creatorName ? creatorName.trim() : "Host",
      invitees: Array.isArray(invitees) ? invitees : [],
      status: "scheduled",
    });

    res.status(201).json({
      success: true,
      message: "Meeting scheduled successfully",
      data: meeting,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// GET: Retrieve upcoming meetings
// URL: GET /api/meetings?roomId=...&date=...
// --------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { roomId, date, createdBy } = req.query;
    const filter = { status: { $ne: "cancelled" } };

    if (roomId) filter.roomId = String(roomId).trim().toUpperCase();
    if (date) filter.date = date;
    if (createdBy) filter.createdBy = String(createdBy).trim();

    const meetings = await Meeting.find(filter)
      .sort({ date: 1, startTime: 1 })
      .limit(100)
      .lean();

    res.status(200).json({
      success: true,
      count: meetings.length,
      data: meetings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// GET: Retrieve a specific meeting
// URL: GET /api/meetings/:id
// --------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }
    res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// PATCH: Update a scheduled meeting
// URL: PATCH /api/meetings/:id
// --------------------------------------------------
router.patch("/:id", async (req, res) => {
  try {
    const allowed = [
      "title",
      "description",
      "date",
      "startTime",
      "endTime",
      "durationMinutes",
      "invitees",
      "status",
      "roomName",
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[key] = req.body[key];
      }
    }

    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Meeting updated successfully",
      data: meeting,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// DELETE: Cancel or remove a meeting
// URL: DELETE /api/meetings/:id
// --------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "cancelled" } },
      { new: true }
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Meeting cancelled successfully",
      data: meeting,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;

