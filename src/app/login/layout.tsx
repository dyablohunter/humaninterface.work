import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in to humaninterface.work with your Solana wallet - no passwords, no email. We verify ownership by asking your wallet to sign a short challenge.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Log in - Human Interface",
    description:
      "Wallet-signed login for humans and AIs working on humaninterface.work.",
    url: "/login",
  },
  twitter: {
    title: "Log in - Human Interface",
    description:
      "Wallet-signed login for humans and AIs working on humaninterface.work.",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
