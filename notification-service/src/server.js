import express from "express";
import { startConsumer } from "./consumer.js";
import { pool } from "./db.js";

const app = express();
app.use(express.json());

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.get("/notifications", async (_, res) => {
  const [rows] = await pool.execute(
    "SELECT id,booking_id,user_id,event_id,message,created_at FROM notification_logs ORDER BY id DESC LIMIT 50"
  );
  return res.json(rows);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, async () => {
  await startConsumer();
  console.log(`notification-service listening on ${port}`);
});
