"use client";

import { useState } from "react";

/**
 * Small "Copy ID" button — copies the given id to the clipboard. Shows a
 * brief "Copied" confirmation, then resets.
 */
export function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Older browsers / blocked clipboard — silent fallback.
    }
  }

  return (
    <button
      type="button"
      className="btn btn-mini"
      onClick={copy}
      title={`Copy task ID: ${id}`}
    >
      {copied ? "Copied" : "Copy ID"}
    </button>
  );
}
