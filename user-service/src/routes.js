import express from "express";
import { randomUUID } from "crypto";
import { pool } from "./db.js";

export const router = express.Router();

// Create a new user
router.post("/users", async (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "name,email required" });

  const id = randomUUID();

  try {
    await pool.execute("INSERT INTO users (id,name,email) VALUES (?,?,?)", [id, name, email]);
    return res.status(201).json({ id, name, email });
  } catch (e) {
    if (String(e?.code) === "ER_DUP_ENTRY") return res.status(409).json({ error: "email already exists" });
    return res.status(500).json({ error: "internal error" });
  }
});

// Get user by ID
router.get("/users/:id", async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT id,name,email,created_at FROM users WHERE id=?",
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not found" });
  return res.json(rows[0]);
});

// Get all users with pagination
router.get("/users", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const [rows] = await pool.execute(
    "SELECT id,name,email,created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );

  const items = rows.map((r) => ({
    ...r,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : null
  }));

  res.json({ items, limit, offset });
});