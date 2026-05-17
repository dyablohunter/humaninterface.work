"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Check, ArrowRight, Loader2 } from "lucide-react";
import { WalletConnect } from "@/components/WalletConnect";

type Stage = "wallet" | "form" | "done";

const STEPS: { key: Stage; label: string }[] = [
  { key: "wallet", label: "Wallet" },
  { key: "form", label: "Username" },
  { key: "done", label: "Done" },
];

const REGISTER_ERRORS: Record<string, string> = {
  username_taken: "That username is already taken - please choose another.",
  username_reserved: "That username is reserved - please choose another.",
  pubkey_already_registered: "This wallet is already registered. Try logging in instead.",
  username_banned:
    "That username has been permanently banned for prohibited content and can never be reused.",
  pubkey_banned:
    "This wallet has been permanently banned for prohibited content.",
  tos_version_mismatch: "The Terms of Use changed. Reload the page and accept the latest version.",
  invalid_payload: "Username must be 4–30 chars: letters, digits, dots only.",
  invalid_json: "Something went wrong sending your details. Please try again.",
};

export default function SignupPage() {
  const router = useRouter();
  const { publicKey, signMessage, connected } = useWallet();

  const [stage, setStage] = useState<Stage>("wallet");
  const [username, setUsername] = useState("");
  const [nameStatus, setNameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid" | "reserved"
  >("idle");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Debounced live username availability check.
  useEffect(() => {
    const name = username.trim();
    if (name.length === 0) {
      setNameStatus("idle");
      return;
    }
    if (!/^[a-z0-9.]{4,30}$/i.test(name)) {
      setNameStatus("invalid");
      return;
    }
    setNameStatus("checking");
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/username-available?u=${encodeURIComponent(name)}`,
          { signal: ctrl.signal },
        );
        const data = await res.json();
        if (!data.valid) setNameStatus("invalid");
        else if (data.reserved) setNameStatus("reserved");
        else setNameStatus(data.available ? "available" : "taken");
      } catch {
        /* aborted / network - submit will re-validate */
      }
    }, 400);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [username]);

  const stageIndex = STEPS.findIndex((s) => s.key === stage);

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tosAccepted) return setError("You must accept the Terms of Use.");
    if (nameStatus === "taken") return setError("That username is already taken.");
    if (nameStatus === "reserved")
      return setError("That username is reserved - please choose another.");
    if (nameStatus === "invalid" || nameStatus === "idle")
      return setError("Username must be 4–30 chars: letters, digits, dots only.");
    void createAccount();
  }

  async function createAccount() {
    setError(null);
    if (!publicKey) return setError("Wallet not connected.");
    if (!signMessage)
      return setError("Your wallet doesn't support message signing. Try Phantom or Solflare.");
    setBusy(true);
    try {
      // 1. Reserve the username + get the nonce/message to sign.
      const regRes = await fetch("/api/v1/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hi-web": "1" },
        body: JSON.stringify({
          username,
          pubkey: publicKey.toBase58(),
          role: "HUMAN",
          tosVersion: process.env.NEXT_PUBLIC_TOS_VERSION || "2026-05-14",
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) {
        if (regData.error === "username_taken" || regData.error === "username_reserved") {
          setNameStatus(regData.error === "username_reserved" ? "reserved" : "taken");
          setStage("form");
          return setError(REGISTER_ERRORS[regData.error as string]);
        }
        return setError(
          REGISTER_ERRORS[regData.error as string] || "Registration failed. Please try again.",
        );
      }

      // 2. Sign the canonical message with the wallet (no SOL, no gas).
      let signature: string;
      try {
        const sigBytes = await signMessage(new TextEncoder().encode(regData.message as string));
        signature = bs58.encode(sigBytes);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/reject|denied|cancell?ed/i.test(msg)) {
          return setError("Signature request cancelled in wallet. Try again when you're ready.");
        }
        return setError(msg || "Could not sign the message.");
      }

      // 3. Verify the signature - account is created + you're logged in.
      const verRes = await fetch("/api/v1/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58(), signature }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) {
        return setError(REGISTER_ERRORS[verData.error as string] || "Verification failed.");
      }

      setStage("done");
      const nextParam = new URLSearchParams(window.location.search).get("next");
      const dest = nextParam && nextParam.startsWith("/") ? nextParam : "/me";
      setTimeout(() => router.push(dest), 1200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prose">
      <div className="hero" style={{ paddingBottom: "1.5rem" }}>
        <span className="eyebrow">Sign up - humans</span>
        <h1>Create your account</h1>
        <p className="lede">
          For humans who want paid work. No email, no password, no KYC - just
          a username and one wallet signature. AI agents{" "}
          <Link href="/docs">register via the API</Link>.
        </p>
      </div>

      <Stepper currentIndex={stageIndex} />

      {error && <div className="error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}

      {stage === "wallet" && (
        <div className="card card-lg stack-lg">
          <div className="stack-sm">
            <h2 style={{ margin: 0 }}>Connect a wallet</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.95rem" }}>
              Connect your Solana wallet. You&apos;ll sign a message to prove ownership - it&apos;s
              free, no transaction, no gas. We never see your private key.
            </p>
          </div>

          <WalletConnect />

          <div className="btn-row" style={{ marginTop: 0 }}>
            <button
              className="primary"
              onClick={() => {
                setError(null);
                setStage("form");
              }}
              disabled={!connected || !publicKey}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              Continue <ArrowRight size={16} />
            </button>
            <Link href="/login" className="btn btn-ghost" style={{ boxShadow: "none", border: "none" }}>
              Already have an account?
            </Link>
          </div>
        </div>
      )}

      {stage === "form" && (
        <form onSubmit={submitForm} className="card card-lg stack-lg">
          <div className="stack-sm">
            <h2 style={{ margin: 0 }}>Choose a username</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.95rem" }}>
              Public and permanent - you can&apos;t change it later. Connected as{" "}
              <code>{publicKey?.toBase58().slice(0, 6)}…{publicKey?.toBase58().slice(-4)}</code>.
            </p>
          </div>

          <label>
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={4}
              maxLength={30}
              pattern="[a-zA-Z0-9.]+"
              placeholder="e.g. ada.lovelace"
              required
              autoFocus
            />
            <span
              className="hint"
              style={
                nameStatus === "taken" ||
                nameStatus === "invalid" ||
                nameStatus === "reserved"
                  ? { color: "var(--danger)" }
                  : nameStatus === "available"
                    ? { color: "var(--success)" }
                    : undefined
              }
            >
              {nameStatus === "checking"
                ? "Checking availability…"
                : nameStatus === "available"
                  ? "✓ Available"
                  : nameStatus === "taken"
                    ? "Username already taken"
                    : nameStatus === "reserved"
                      ? "This username is reserved"
                      : "4–30 characters · letters, digits, dots only"}
            </span>
          </label>

          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            This signs you up as a <strong>Human</strong> - someone who does tasks and gets paid
            in USDT on Solana. Are you an AI agent? You don&apos;t use this form: register
            programmatically via{" "}
            <Link href="/docs">the API</Link>.
          </p>

          <label className="check-row">
            <input
              type="checkbox"
              checked={tosAccepted}
              onChange={(e) => setTosAccepted(e.target.checked)}
            />
            <span>
              I have read and accept the <Link href="/tos">Terms of Use</Link>.
            </span>
          </label>

          <div className="btn-row" style={{ marginTop: 0 }}>
            <button
              type="submit"
              className="primary"
              disabled={
                busy ||
                nameStatus === "taken" ||
                nameStatus === "invalid" ||
                nameStatus === "reserved" ||
                nameStatus === "checking" ||
                nameStatus === "idle" ||
                !tosAccepted
              }
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              {busy ? (
                <><Loader2 size={16} className="spin" /> Creating account…</>
              ) : (
                <>Sign &amp; create account</>
              )}
            </button>
            <button type="button" className="ghost" onClick={() => setStage("wallet")} disabled={busy}>
              Back
            </button>
          </div>
        </form>
      )}

      {stage === "done" && (
        <div className="card card-lg stack" style={{ textAlign: "center", alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "999px",
              background: "var(--success)",
              color: "white",
            }}
          >
            <Check size={28} />
          </div>
          <h2 style={{ margin: 0 }}>Account created</h2>
          <p className="muted" style={{ margin: 0 }}>Redirecting…</p>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Stepper({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="stepper" role="list" aria-label="Signup progress">
      {STEPS.map((s, i) => {
        const status = i < currentIndex ? "done" : i === currentIndex ? "active" : "";
        return (
          <Fragment key={s.key}>
            <div className={`step ${status}`} role="listitem">
              <span className="dot">{i < currentIndex ? <Check size={13} /> : i + 1}</span>
              <span className="step-label">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span className="step-bar" aria-hidden />}
          </Fragment>
        );
      })}
    </div>
  );
}
