const express = require("express");
const mongoose = require("mongoose");
const OfficeLayout = require("../models/OfficeLayout");

const router = express.Router();

const inMemoryOfficeLayouts = new Map([
  [
    "MAIN-OFFICE",
    {
      roomId: "MAIN-OFFICE",
      roomName: "Main Virtual Office",
      dimensions: { width: 760, height: 480 },
      background: "#111827",
      furniture: [
        { name: "Executive Desk", type: "desk", x: 100, y: 120, width: 90, height: 50, blocksAudio: true, obstacleType: "desk" },
        { name: "Meeting Table", type: "table", x: 380, y: 200, width: 140, height: 80, blocksAudio: true, obstacleType: "table" },
      ],
    },
  ],
]);

// --------------------------------------------------
// POST: Create and save a new office layout
// URL: POST /api/office-layouts
// --------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const {
      roomId,
      roomName,
      dimensions,
      background,
      furniture,
      createdBy,
    } = req.body;

    if (!roomId || !roomName || !dimensions) {
      return res.status(400).json({
        success: false,
        message: "roomId, roomName and dimensions are required",
      });
    }

    const existingRoom = await OfficeLayout.findOne({ roomId });

    if (existingRoom) {
      return res.status(409).json({
        success: false,
        message: "Office layout already exists",
      });
    }

    const officeLayout = await OfficeLayout.create({
      roomId,
      roomName,
      dimensions,
      background,
      furniture: furniture || [],
      createdBy,
    });

    res.status(201).json({
      success: true,
      message: "Office layout saved successfully",
      data: officeLayout,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// GET: Retrieve an office layout
// URL: GET /api/office-layouts/:roomId
// --------------------------------------------------
router.get("/:roomId", async (req, res) => {
  try {
    let officeLayout = null;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      officeLayout = await OfficeLayout.findOne({
        roomId: req.params.roomId,
      });
    } else {
      try {
        officeLayout = await OfficeLayout.findOne({
          roomId: req.params.roomId,
        });
      } catch (_) {
        officeLayout = null;
      }
      if (!officeLayout && inMemoryOfficeLayouts.has(req.params.roomId)) {
        officeLayout = inMemoryOfficeLayouts.get(req.params.roomId);
      }
    }

    if (!officeLayout) {
      return res.status(404).json({
        success: false,
        message: "Office layout not found",
      });
    }

    res.status(200).json({
      success: true,
      data: officeLayout,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// PUT: Update the complete office layout
// URL: PUT /api/office-layouts/:roomId
// --------------------------------------------------
router.put("/:roomId", async (req, res) => {
  try {
    const {
      roomName,
      dimensions,
      background,
      furniture,
    } = req.body;

    const officeLayout = await OfficeLayout.findOneAndUpdate(
      { roomId: req.params.roomId },
      {
        $set: {
          ...(roomName !== undefined && { roomName }),
          ...(dimensions !== undefined && { dimensions }),
          ...(background !== undefined && { background }),
          ...(furniture !== undefined && { furniture }),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!officeLayout) {
      return res.status(404).json({
        success: false,
        message: "Office layout not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Office layout updated successfully",
      data: officeLayout,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// POST: Add furniture to an existing office
// URL: POST /api/office-layouts/:roomId/furniture
// --------------------------------------------------
router.post("/:roomId/furniture", async (req, res) => {
  try {
    const officeLayout = await OfficeLayout.findOne({
      roomId: req.params.roomId,
    });

    if (!officeLayout) {
      return res.status(404).json({
        success: false,
        message: "Office layout not found",
      });
    }

    officeLayout.furniture.push(req.body);
    await officeLayout.save();

    res.status(201).json({
      success: true,
      message: "Furniture added successfully",
      data: officeLayout,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// PATCH: Update a furniture obstacle
// URL: PATCH /api/office-layouts/:roomId/furniture/:furnitureId
// --------------------------------------------------
router.patch("/:roomId/furniture/:furnitureId", async (req, res) => {
  try {
    const { roomId, furnitureId } = req.params;

    if (!mongoose.isValidObjectId(furnitureId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid furniture ID",
      });
    }

    const officeLayout = await OfficeLayout.findOne({
      roomId,
    });

    if (!officeLayout) {
      return res.status(404).json({
        success: false,
        message: "Office layout not found",
      });
    }

    const furniture = officeLayout.furniture.id(furnitureId);

    if (!furniture) {
      return res.status(404).json({
        success: false,
        message: "Furniture not found",
      });
    }

    const allowedFields = [
      "name",
      "type",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "obstacleType",
      "blocksMovement",
      "blocksAudio",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        furniture.set(field, req.body[field]);
      }
    }

    await officeLayout.save();

    res.status(200).json({
      success: true,
      message: "Furniture updated successfully",
      data: officeLayout,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// DELETE: Remove furniture from an office
// URL: DELETE /api/office-layouts/:roomId/furniture/:furnitureId
// --------------------------------------------------
router.delete("/:roomId/furniture/:furnitureId", async (req, res) => {
  try {
    const { roomId, furnitureId } = req.params;

    if (!mongoose.isValidObjectId(furnitureId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid furniture ID",
      });
    }

    const officeLayout = await OfficeLayout.findOne({
      roomId,
    });

    if (!officeLayout) {
      return res.status(404).json({
        success: false,
        message: "Office layout not found",
      });
    }

    const furniture = officeLayout.furniture.id(furnitureId);

    if (!furniture) {
      return res.status(404).json({
        success: false,
        message: "Furniture not found",
      });
    }

    furniture.deleteOne();
    await officeLayout.save();

    res.status(200).json({
      success: true,
      message: "Furniture removed successfully",
      data: officeLayout,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;

