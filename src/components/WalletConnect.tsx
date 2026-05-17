"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { Wallet, Check, LogOut } from "lucide-react";

function short(addr: string, n = 4) {
  return addr.length > n * 2 + 3 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr;
}

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="card" aria-busy="true" style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--muted)" }}>
        <Wallet size={18} /> Loading wallet…
      </div>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Check size={18} color="var(--success)" aria-hidden />
          <div className="stack-sm">
            <strong style={{ fontSize: "0.92rem" }}>Wallet connected</strong>
            <code style={{ fontSize: "0.82rem" }}>{short(publicKey.toBase58(), 6)}</code>
          </div>
        </div>
        <button className="ghost" onClick={() => disconnect()} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <LogOut size={16} /> Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--fg-soft)" }}>
        <Wallet size={18} aria-hidden />
        <span>No wallet connected.</span>
      </div>
      <WalletMultiButton />
    </div>
  );
}
