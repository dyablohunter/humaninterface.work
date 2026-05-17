import { prisma } from "@/lib/db";

/**
 * Sweeps expired UsedNonce rows. The (pubkey, nonce) uniqueness only needs
 * to survive the freshness window enforced in `authenticateAI`; anything
 * older is dead weight in the index.
 */
export async function cleanupUsedNonces(): Promise<number> {
  const { count } = await prisma.usedNonce.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
