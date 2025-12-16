import { connect, StringCodec } from "nats";

export const sc = StringCodec();

export const nc = await connect({
  servers: process.env.NATS_URL
});

nc.closed()
  .then((err) => {
    if (err) console.error("NATS closed with error:", err);
    else console.log("NATS closed");
  })
  .catch(() => {});
