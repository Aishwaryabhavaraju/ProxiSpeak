const express = require("express");
const mongoose = require("mongoose");
const Meeting = require("../models/Meeting");

const router = express.Router();

const inMemoryMeetings = [];

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

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      const meeting = {
        _id: "meet_" + Date.now().toString(36),
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
        createdAt: new Date().toISOString(),
      };
      inMemoryMeetings.push(meeting);
      return res.status(201).json({
        success: true,
        message: "Meeting scheduled successfully (in-memory)",
        data: meeting,
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
// URL: GET /api/meetings/upcoming
// --------------------------------------------------
router.get("/upcoming", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      const filtered = inMemoryMeetings
        .filter((m) => m.status !== "cancelled" && m.date >= today)
        .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
      return res.status(200).json({
        success: true,
        count: filtered.length,
        data: filtered,
      });
    }

    const meetings = await Meeting.find({
      status: "scheduled",
      date: { $gte: today },
    })
      .sort({ date: 1, startTime: 1 })
      .limit(50)
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
// GET: Retrieve meetings with query filters
// URL: GET /api/meetings?roomId=...&date=...
// --------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { roomId, date, createdBy } = req.query;

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      let filtered = inMemoryMeetings.filter((m) => m.status !== "cancelled");
      if (roomId) filtered = filtered.filter((m) => m.roomId === String(roomId).trim().toUpperCase());
      if (date) filtered = filtered.filter((m) => m.date === date);
      if (createdBy) filtered = filtered.filter((m) => m.createdBy === String(createdBy).trim());
      return res.status(200).json({
        success: true,
        count: filtered.length,
        data: filtered,
      });
    }

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
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      const meeting = inMemoryMeetings.find((m) => m._id === req.params.id);
      if (!meeting) {
        return res.status(404).json({ success: false, message: "Meeting not found" });
      }
      return res.status(200).json({ success: true, data: meeting });
    }

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
// DELETE: Cancel / remove a meeting
// URL: DELETE /api/meetings/:id
// --------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      const idx = inMemoryMeetings.findIndex((m) => m._id === req.params.id);
      if (idx !== -1) {
        inMemoryMeetings.splice(idx, 1);
      }
      return res.status(200).json({ success: true, message: "Meeting removed" });
    }

    const meeting = await Meeting.findByIdAndDelete(req.params.id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Meeting cancelled successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
