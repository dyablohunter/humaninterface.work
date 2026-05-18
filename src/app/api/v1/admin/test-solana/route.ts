import { NextRequest, NextResponse } from "next/server";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { requireAdmin } from "@/lib/auth/middleware";
import { assertDevOnly } from "@/lib/dev-only";
import { solanaConnection, getUsdtMint } from "@/lib/solana/client";

/**
 * Read-only Solana visibility. Surfaces the SOL gas balance and USDT token
 * balance of the platform escrow + test AI wallets, so the admin can
 * sanity-check that escrow has both gas and USDT before running a scenario.
 */
export async function GET(req: NextRequest) {
  const denied = assertDevOnly();
  if (denied) return denied;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const escrowAddr = process.env.SOLANA_ESCROW_PUBKEY || null;
  const testAiAddr = process.env.TEST_AI_PUBKEY || null;

  const solBalance = async (addr: string | null): Promise<number | null> => {
    if (!addr) return null;
    try {
      const lamports = await solanaConnection.getBalance(new PublicKey(addr), "confirmed");
      return lamports / LAMPORTS_PER_SOL;
    } catch {
      return null;
    }
  };

  const usdtBalance = async (addr: string | null): Promise<number | null> => {
    if (!addr) return null;
    let mint: PublicKey;
    try {
      mint = getUsdtMint();
    } catch {
      return null;
    }
    try {
      const ata = getAssociatedTokenAddressSync(mint, new PublicKey(addr), true);
      const account = await getAccount(solanaConnection, ata, "confirmed");
      return Number(account.amount) / 1e6;
    } catch {
      return null;
    }
  };

  const [escrowSol, testAiSol, escrowUsdt, testAiUsdt] = await Promise.all([
    solBalance(escrowAddr),
    solBalance(testAiAddr),
    usdtBalance(escrowAddr),
    usdtBalance(testAiAddr),
  ]);

  return NextResponse.json({
    ok: true,
    escrow: { address: escrowAddr, balanceSol: escrowSol, balanceUsdt: escrowUsdt },
    testAi: { address: testAiAddr, balanceSol: testAiSol, balanceUsdt: testAiUsdt },
    rpc: process.env.SOLANA_RPC_URL || null,
    network: process.env.SOLANA_NETWORK || null,
    usdtMint: process.env.USDT_MINT_ADDRESS || null,
  });
}
