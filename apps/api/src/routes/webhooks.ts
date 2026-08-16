import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import { env } from "../env.js";
import { createLocalUser } from "../auth/users.js";

interface ClerkUserCreatedEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: { email_address: string }[];
  };
}

export function registerWebhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/clerk", async (request, reply) => {
    const rawBody = request.rawBody;
    if (!rawBody) {
      return reply.code(400).send({ error: "Missing request body" });
    }

    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
    let event: ClerkUserCreatedEvent;
    try {
      event = wh.verify(rawBody, {
        "svix-id": request.headers["svix-id"] as string,
        "svix-timestamp": request.headers["svix-timestamp"] as string,
        "svix-signature": request.headers["svix-signature"] as string,
      }) as ClerkUserCreatedEvent;
    } catch {
      return reply.code(400).send({ error: "Invalid webhook signature" });
    }

    if (event.type === "user.created") {
      const email = event.data.email_addresses?.[0]?.email_address;
      await createLocalUser(event.data.id, email);
    }

    reply.code(200).send({ received: true });
  });
}
