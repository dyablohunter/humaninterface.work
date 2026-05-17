"use client";

import { useEffect } from "react";

const INTERVAL_MS = 60_000;

export function Heartbeat() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await fetch("/api/v1/heartbeat", { method: "POST", credentials: "include" });
      } catch {
        // ignore - heartbeat is fire-and-forget
      }
    };

    const start = () => {
      if (timer) return;
      ping();
      timer = setInterval(ping, INTERVAL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      void cancelled;
    };
  }, []);

  return null;
}
