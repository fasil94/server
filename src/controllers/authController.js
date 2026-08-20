import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: cleanEmail, password: hashed });

    res.status(201).json({
      token: signToken(user._id),
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error("Auth Error:", error); 
    res.status(500).json({ message: "Registration failed" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    
    const cleanEmail = email?.trim().toLowerCase(); 
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !(await bcrypt.compare(password || "", user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({
      token: signToken(user._id),
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error("Login Error:", error); 
    res.status(500).json({ message: "Login failed" });
  }
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    console.error("Me Route Error:", error);
    res.status(500).json({ message: "Server error" });
  }
}

export async function forgotPassword(req, res) {
  try {
    const email = req.body?.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });

    // Do not reveal whether an account exists.
    const generic = { message: "If an account exists for this email, a reset link has been sent." };
    if (!user) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/?resetToken=${rawToken}`;

    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
      console.warn("Password reset email is not configured. Reset URL:", resetUrl);
      return res.json({
        ...generic,
        developmentResetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl
      });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [user.email],
        subject: "Reset your TaskFlow password",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
            <h2>Reset your TaskFlow password</h2>
            <p>We received a request to reset your password.</p>
            <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#1C2E4A;color:#fff;text-decoration:none;border-radius:8px">Reset password</a></p>
            <p>This link expires in 15 minutes.</p>
            <p>If you did not request this, you can safely ignore this email.</p>
          </div>`
      })
    });

    if (!emailResponse.ok) {
      console.error("Reset email error:", await emailResponse.text());
      return res.status(502).json({ message: "Could not send the reset email. Please try again." });
    }

    res.json(generic);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Could not process password reset request." });
  }
}

export async function resetPassword(req, res) {
  try {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");

    if (!token || password.length < 6) {
      return res.status(400).json({ message: "A valid reset token and password of at least 6 characters are required." });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ message: "This reset link is invalid or expired." });

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Could not reset password." });
  }
}
