const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Avatar = require("../models/Avatar");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "proxispeak-secure-jwt-key-2026";
const JWT_EXPIRES_IN = "7d";

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Authentication Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authorization required" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, username, email, password, confirmPassword } = req.body || {};

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, username, email, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // Check existing email or username
    const existingUser = await User.findOne({
      $or: [{ email: cleanEmail }, { username: cleanUsername }],
    });

    if (existingUser) {
      if (existingUser.email === cleanEmail) {
        return res.status(400).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }
      return res.status(400).json({
        success: false,
        message: "Username is already taken.",
      });
    }

    const hashedPassword = await User.hashPassword(password);

    const newUser = await User.create({
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
    });

    // Ensure corresponding Avatar document exists in MongoDB
    await Avatar.findOneAndUpdate(
      { userId: cleanUsername },
      {
        $setOnInsert: {
          userId: cleanUsername,
          username: newUser.name,
          position: [200 + Math.floor(Math.random() * 100), 160 + Math.floor(Math.random() * 80)],
          isOnline: true,
        },
      },
      { upsert: true, new: true }
    );

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: newUser._id.toString(),
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        avatarColor: newUser.avatarColor,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
      error: error.message,
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide your email/username and password.",
      });
    }

    const identifier = email.trim().toLowerCase();

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // Update avatar online status
    await Avatar.findOneAndUpdate(
      { userId: user.username },
      { $set: { isOnline: true } },
      { upsert: true }
    );

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
      error: error.message,
    });
  }
});

// GET /api/auth/me
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
});

module.exports = {
  authRouter: router,
  verifyToken,
};

