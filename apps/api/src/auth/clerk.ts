import { createClerkClient, verifyToken } from "@clerk/backend";
import { env } from "../env.js";

export const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function verifyBearerToken(authorizationHeader: string | undefined): Promise<string> {
  const token = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7) : undefined;
  if (!token) {
    throw new UnauthorizedError("Missing bearer token");
  }

  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    return payload.sub;
  } catch {
    throw new UnauthorizedError("Invalid session token");
  }
}
