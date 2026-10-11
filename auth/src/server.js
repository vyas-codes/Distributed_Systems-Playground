
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");

const app = express();

const PORT = process.env.PORT || 4001;

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI must be configured");
}

app.use(express.json({ limit: "10kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);

async function startServer() {
  await mongoose.connect(process.env.MONGO_URI);

  console.log("Auth Service connected to MongoDB");

  app.listen(PORT, () => {
    console.log(`Auth Service running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Auth Service:", error.message);
  process.exit(1);
});
