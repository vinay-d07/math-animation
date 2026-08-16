import type { FastifyReply } from "fastify";
import { env } from "../env.js";

export interface SSEChannel {
  send(event: string, data: unknown): void;
  close(): void;
}

export function openSSE(reply: FastifyReply): SSEChannel {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": env.FRONTEND_ORIGIN,
    Vary: "Origin",
  });

  return {
    send(event, data) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      reply.raw.end();
    },
  };
}
