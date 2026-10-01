import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
const pub = new Redis(url);
const sub = new Redis(url);
for (const [label, c] of [["pub", pub], ["sub", sub]] as const) {
  c.on("error", (e: Error) => console.error(`redis ${label}: ${e.message}`));
}

/** 36 ASCII chars; prefixed to every message so instances ignore their own echoes. */
export const INSTANCE_ID = randomUUID();

export type BusKind = "doc" | "aw";
type Handler = (kind: BusKind, payload: Uint8Array) => void;
const handlers = new Map<string, Handler>();

sub.on("messageBuffer", (channel: Buffer, message: Buffer) => {
  const ch = channel.toString();
  const i = ch.indexOf(":");
  const kind = ch.slice(0, i) as BusKind;
  const name = ch.slice(i + 1);
  const handler = handlers.get(name);
  if (!handler) return;
  if (message.subarray(0, 36).toString() === INSTANCE_ID) return;
  handler(kind, new Uint8Array(message.subarray(36)));
});

export async function subscribeDoc(name: string, handler: Handler): Promise<void> {
  handlers.set(name, handler);
  await sub.subscribe(`doc:${name}`, `aw:${name}`);
}

export async function unsubscribeDoc(name: string): Promise<void> {
  handlers.delete(name);
  await sub.unsubscribe(`doc:${name}`, `aw:${name}`);
}

export function publish(kind: BusKind, name: string, payload: Uint8Array): void {
  pub
    .publish(`${kind}:${name}`, Buffer.concat([Buffer.from(INSTANCE_ID), Buffer.from(payload)]))
    .catch((e) => console.error("redis publish failed", e));
}
