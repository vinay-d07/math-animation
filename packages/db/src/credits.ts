import { prisma, CreditReason } from "./client.js";

export const SIGNUP_GRANT_CREDITS = 500;

export const CREDIT_COSTS = {
  PREVIEW_RENDER: 2,
  FINAL_RENDER: 10,
  AI_EDIT: 5,
  STORYBOARD_PLAN: 5,
  SCENE_RENDER: 2,
} as const;

export class InsufficientCreditsError extends Error {
  constructor(public readonly balance: number, public readonly required: number) {
    super(`Insufficient credits: have ${balance}, need ${required}`);
    this.name = "InsufficientCreditsError";
  }
}

export async function grantSignupCredits(userId: string) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.creditAccount.create({
      data: { userId, balance: SIGNUP_GRANT_CREDITS },
    });
    await tx.creditTransaction.create({
      data: { accountId: account.id, amount: SIGNUP_GRANT_CREDITS, reason: CreditReason.GRANT },
    });
    return account;
  });
}

export async function getBalance(userId: string): Promise<number> {
  const account = await prisma.creditAccount.findUnique({ where: { userId } });
  return account?.balance ?? 0;
}

export async function deductCredits(
  userId: string,
  amount: number,
  reason: CreditReason,
  jobId?: string
) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.creditAccount.findUnique({ where: { userId } });
    if (!account || account.balance < amount) {
      throw new InsufficientCreditsError(account?.balance ?? 0, amount);
    }

    const updated = await tx.creditAccount.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    await tx.creditTransaction.create({
      data: { accountId: account.id, amount: -amount, reason, jobId },
    });

    return updated;
  });
}
