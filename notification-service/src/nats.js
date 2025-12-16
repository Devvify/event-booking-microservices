import { connect, StringCodec } from "nats";

export const sc = StringCodec();

export const nc = await connect({
  servers: process.env.NATS_URL
});
