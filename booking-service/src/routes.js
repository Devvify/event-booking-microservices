import express from "express";
import { randomUUID } from "crypto";
import { pool } from "./db.js";
import { nc, sc } from "./nats.js";

export const router = express.Router();

/**
 * POST /bookings
 * body: { userId, eventId }
 *
 * Race-condition safety:
 * - BEGIN
 * - SELECT ... FOR UPDATE (locks the event row)
 * - decrement available_seats if > 0
 * - insert booking
 * - COMMIT
 * - publish booking.confirmed
 */
router.post("/bookings", async (req, res) => {
  const { userId, eventId } = req.body || {};
  if (!userId || !eventId) return res.status(400).json({ error: "userId,eventId required" });

  const conn = await pool.getConnection();
  const bookingId = randomUUID();

  try {
    await conn.beginTransaction();

    // Optional: Validate user exists (cheap, avoids nonsense bookings)
    const [u] = await conn.execute("SELECT id FROM users WHERE id=? LIMIT 1", [userId]);
    if (!u.length) {
      await conn.rollback();
      return res.status(404).json({ error: "user not found" });
    }

    // Lock event row to prevent overselling
    const [rows] = await conn.execute(
      "SELECT available_seats FROM events WHERE id=? FOR UPDATE",
      [eventId]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "event not found" });
    }

    if (rows[0].available_seats <= 0) {
      await conn.rollback();
      return res.status(409).json({ error: "sold out" });
    }

    await conn.execute(
      "UPDATE events SET available_seats = available_seats - 1 WHERE id=?",
      [eventId]
    );

    await conn.execute(
      "INSERT INTO bookings (id,user_id,event_id) VALUES (?,?,?)",
      [bookingId, userId, eventId]
    );

    await conn.commit();

    // Publish async event
    nc.publish(
      "booking.confirmed",
      sc.encode(JSON.stringify({ bookingId, userId, eventId, ts: new Date().toISOString() }))
    );

    return res.status(201).json({ bookingId, userId, eventId });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error("Booking error:", e);
    return res.status(500).json({ error: "internal error" });
  } finally {
    conn.release();
  }
});
