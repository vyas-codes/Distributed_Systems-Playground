
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = "distributed-systems-playground-auth";
const JWT_AUDIENCE = "distributed-systems-playground";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured");
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

// POST /auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      !isValidEmail(email) ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: "Invalid input",
        message:
          "Provide a valid email and a password between 12 and 128 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        error: "Account already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      // Role is assigned by the server, never by the client.
      role: "user",
    });

    return res.status(201).json({
      message: "Account created successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    // Handles concurrent signup requests for the same email.
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Account already exists",
      });
    }

    console.error("Signup failed:", error.message);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    // Use the same response for an unknown email and wrong password.
    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        role: user.role,
      },
      JWT_SECRET,
      {
        algorithm: "HS256",
        subject: user._id.toString(),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: "15m",
      }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      tokenType: "Bearer",
      expiresIn: 900,
    });
  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

module.exports = router;
