import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError, verifyBearerToken } from "./clerk.js";
import { ensureUser } from "./users.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const clerkId = await verifyBearerToken(request.headers.authorization);
    request.userId = await ensureUser(clerkId);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return reply.code(401).send({ error: err.message });
    }
    throw err;
  }
}
