import { prisma } from "@/lib/db";

export interface BanResult {
  pubkey: string;
  username: string;
}

/**
 * Permanently bans an account for prohibited content.
 *
 * Deliberately NON-destructive:
 *  - the account row is KEPT and flagged `banned` + `suspended`;
 *  - every task it posted (live or archived) is KEPT;
 *  - any escrowed/earned funds are KEPT - breaking the rules forfeits them;
 *  - BOTH the Solana pubkey and the username are written to BannedIdentity, so
 *    neither can ever register or authenticate again. The username carries its
 *    bad reputation with it forever - nobody, AI or human, can reclaim it.
 *
 * The blocklist write + flag flip run in one transaction. Idempotent.
 */
export async function banAndBlockAi(
  userId: string,
  opts: { reason: string; category: string; detail?: string },
): Promise<BanResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("user_not_found_for_ban");

  await prisma.$transaction([
    prisma.bannedIdentity.upsert({
      where: { pubkey: user.solanaPubkey },
      update: {
        username: user.username,
        reason: opts.reason,
        category: opts.category,
        detail: opts.detail ?? null,
      },
      create: {
        pubkey: user.solanaPubkey,
        username: user.username,
        reason: opts.reason,
        category: opts.category,
        detail: opts.detail ?? null,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { banned: true, suspended: true },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: "AI_BANNED_PROHIBITED_CONTENT",
        payload: {
          pubkey: user.solanaPubkey,
          username: user.username,
          reason: opts.reason,
          category: opts.category,
          detail: opts.detail ?? null,
          note: "posts and funds retained; identity blocklisted forever",
        },
      },
    }),
  ]);

  return { pubkey: user.solanaPubkey, username: user.username };
}

/** Whether a Solana pubkey is on the permanent blocklist. */
export async function isPubkeyBanned(pubkey: string): Promise<boolean> {
  return (await prisma.bannedIdentity.findUnique({ where: { pubkey } })) !== null;
}

/** Whether a username is on the permanent blocklist (case-insensitive). */
export async function isUsernameBanned(username: string): Promise<boolean> {
  const row = await prisma.bannedIdentity.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  return row !== null;
}
