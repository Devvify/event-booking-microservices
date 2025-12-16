import express from "express";
import { router } from "./routes.js";

const app = express();
app.use(express.json());

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.use(router);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`event-service listening on ${port}`));
