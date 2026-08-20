import dotenv from "dotenv";
dotenv.config(); 

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

// app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || true }));
app.use(cors({
  origin: [
    'https://client-dagemawi12234-pixels-projects.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  age: Number
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

app.get("/", (_req, res) => res.json({ message: "Task Dashboard API is running" }));

app.use("/auth", authRoutes);
app.use("/tasks", taskRoutes);
app.use("/ai", aiRoutes);

app.post("/users", async (req, res) => {
  try {
    const newUser = new User(req.body);
    await newUser.save();
    res.status(201).json({ message: "User registered successfully!", data: newUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

connectDB().then(() => {
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
});