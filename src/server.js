require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth.routes");

const PORT = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/auth-api-tutorial";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Auth API tutorial is running",
    health: "/health"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.use("/api/auth", authRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route không tồn tại",
    error: "NotFound",
    statusCode: 404
  });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Body JSON không hợp lệ",
      error: "BadRequest",
      statusCode: 400
    });
  }

  console.error(error);

  res.status(500).json({
    message: "Internal server error",
    error: "InternalServerError",
    statusCode: 500
  });
});

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

const start = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();
