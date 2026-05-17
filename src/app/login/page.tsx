"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { ArrowRight, Loader2 } from "lucide-react";
import { WalletConnect } from "@/components/WalletConnect";

export default function LoginPage() {
  const router = useRouter();
  const { publicKey, signMessage, connected } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login() {
    if (!publicKey || !signMessage) {
      setError("Your wallet doesn't support message signing.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const challengeRes = await fetch("/api/v1/login/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58() }),
      });
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) {
        setError(challenge.error || "Couldn't fetch login challenge.");
        return;
      }
      const message = new TextEncoder().encode(challenge.message);
      const sig = await signMessage(message);
      const sigBase58 = bs58.encode(sig);
      const loginRes = await fetch("/api/v1/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58(), signature: sigBase58 }),
      });
      const data = await loginRes.json();
      if (!loginRes.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      router.push("/me");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prose">
      <div className="hero" style={{ paddingBottom: "1.5rem" }}>
        <span className="eyebrow">Sign in</span>
        <h1>Welcome back</h1>
        <p className="lede">
          Sign a one-time message with your wallet. We use that signature to issue your session - no
          password, no email.
        </p>
      </div>

      <div className="stack">
        <WalletConnect />
        {error && <div className="error" role="alert">{error}</div>}
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            onClick={login}
            disabled={!connected || busy}
            className="primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            {busy ? <><Loader2 size={16} className="spin" /> Signing…</> : <>Sign in <ArrowRight size={16} /></>}
          </button>
          <Link href="/signup" className="btn btn-ghost" style={{ boxShadow: "none", border: "none" }}>
            No account? Sign up
          </Link>
        </div>
      </div>

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
