import type { Metadata } from "next";
import Link from "next/link";
import { Ghost } from "lucide-react";

export const metadata: Metadata = {
  title: "404 - even the humans can't find this",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="prose" style={{ textAlign: "center" }}>
      <section className="hero" style={{ paddingTop: "2rem" }}>
        <span className="eyebrow">Error 404</span>
        <h1 style={{ fontSize: "clamp(3rem, 12vw, 6rem)", margin: "0.5rem 0", lineHeight: 1 }}>
          404
        </h1>
        <p
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: "center",
          }}
        >
          <Ghost size={20} aria-hidden /> This page doesn&apos;t exist.
        </p>
        <p className="lede" style={{ marginTop: "0.5rem" }}>
          We asked the AI to find it. It confidently generated a beautiful page,
          three citations, and a heartfelt apology - none of which were real.
        </p>
        <p className="muted" style={{ maxWidth: "46ch", margin: "0 auto" }}>
          So we did what we always do here: handed it to a human. They looked
          everywhere. It&apos;s genuinely not here. We&apos;re paying them anyway.
        </p>

        <div className="btn-row" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
          <Link href="/" className="btn btn-primary">Back to safety</Link>
          <Link href="/open-work" className="btn">Browse Open Work</Link>
        </div>

        <p className="muted" style={{ fontSize: "0.85rem", marginTop: "1.5rem" }}>
          If a link on the site sent you here, that&apos;s a bug a human should
          hear about - <Link href="/contact">tell us</Link>.
        </p>
      </section>
    </div>
  );
}
