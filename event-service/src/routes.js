import express from "express";
import { randomUUID } from "crypto";
import { pool } from "./db.js";
import { redis } from "./redis.js";

export const router = express.Router();
const TTL = Number(process.env.CACHE_TTL || 60);

router.post("/events", async (req, res) => {
  const { title, seats, date } = req.body || {};
  if (!title || !Number.isInteger(seats) || seats <= 0 || !date) {
    return res.status(400).json({ error: "title,seats(int>0),date required" });
  }

  const id = randomUUID();
  const eventDate = new Date(date);
  if (Number.isNaN(eventDate.getTime())) return res.status(400).json({ error: "invalid date" });

  await pool.execute(
    "INSERT INTO events (id,title,total_seats,available_seats,event_date) VALUES (?,?,?,?,?)",
    [id, title, seats, seats, eventDate]
  );

  return res.status(201).json({
    id,
    title,
    total_seats: seats,
    available_seats: seats,
    event_date: eventDate.toISOString()
  });
});

router.get("/events", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // Optional filters
  const q = (req.query.q || "").trim();
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;

  if (from && Number.isNaN(from.getTime())) return res.status(400).json({ error: "invalid from date" });
  if (to && Number.isNaN(to.getTime())) return res.status(400).json({ error: "invalid to date" });

  const where = [];
  const params = [];

  if (q) {
    where.push("title LIKE ?");
    params.push(`%${q}%`);
  }
  if (from) {
    where.push("event_date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("event_date <= ?");
    params.push(to);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `
    SELECT id, title, total_seats, available_seats, event_date, created_at
    FROM events
    ${whereSql}
    ORDER BY event_date ASC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  const items = rows.map((r) => ({
    ...r,
    event_date: new Date(r.event_date).toISOString(),
    created_at: r.created_at ? new Date(r.created_at).toISOString?.() ?? r.created_at : r.created_at
  }));

  return res.json({ items, limit, offset });
});


router.get("/events/:id", async (req, res) => {
  const key = `event:${req.params.id}`;
  const cached = await redis.get(key);
  if (cached) return res.json({ ...JSON.parse(cached), cached: true });

  const [rows] = await pool.execute(
    "SELECT id,title,total_seats,available_seats,event_date FROM events WHERE id=?",
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not found" });

  const payload = {
    ...rows[0],
    event_date: new Date(rows[0].event_date).toISOString()
  };

  await redis.setEx(key, TTL, JSON.stringify(payload));
  return res.json({ ...payload, cached: false });
});

router.patch("/events/:id", async (req, res) => {
  const { title, date } = req.body || {};
  if (!title && !date) return res.status(400).json({ error: "title or date required" });

  const fields = [];
  const vals = [];

  if (title) { fields.push("title=?"); vals.push(title); }
  if (date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "invalid date" });
    fields.push("event_date=?"); vals.push(d);
  }

  vals.push(req.params.id);

  const [result] = await pool.execute(`UPDATE events SET ${fields.join(",")} WHERE id=?`, vals);
  if (result.affectedRows === 0) return res.status(404).json({ error: "not found" });

  await redis.del(`event:${req.params.id}`);
  return res.json({ ok: true, cacheInvalidated: true });
});
