import { nc, sc } from "./nats.js";
import { pool } from "./db.js";

export async function startConsumer() {
  const sub = nc.subscribe("booking.confirmed");

  (async () => {
    for await (const msg of sub) {
      const payload = JSON.parse(sc.decode(msg.data));
      const message = `Booking confirmed: ${payload.bookingId}`;

      await pool.execute(
        "INSERT INTO notification_logs (booking_id,user_id,event_id,message) VALUES (?,?,?,?)",
        [payload.bookingId, payload.userId, payload.eventId, message]
      );

      console.log("[notification-service]", message);
    }
  })().catch((e) => console.error("Consumer loop error:", e));
}
