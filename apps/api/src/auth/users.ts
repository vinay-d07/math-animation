import { prisma } from "@manim-saas/db";
import { grantSignupCredits } from "@manim-saas/db/credits";
import { clerkClient } from "./clerk.js";

/**
 * Resolves a Clerk user id to a local User, creating it (with its starter
 * credit grant) on first sight. The Clerk webhook does the same on signup —
 * this lazy path exists so auth works even when the webhook isn't reachable
 * (e.g. local dev without a public URL for Clerk to call).
 */
export async function ensureUser(clerkId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) {
    return existing.id;
  }

  return createLocalUser(clerkId);
}

export async function createLocalUser(clerkId: string, email?: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) {
    return existing.id;
  }

  const resolvedEmail = email ?? (await lookupEmail(clerkId));

  const user = await prisma.user.create({
    data: { clerkId, email: resolvedEmail },
  });
  await grantSignupCredits(user.id);
  return user.id;
}

async function lookupEmail(clerkId: string): Promise<string> {
  const clerkUser = await clerkClient.users.getUser(clerkId);
  return clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@unknown.local`;
}
