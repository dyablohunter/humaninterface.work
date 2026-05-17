import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the humaninterface.work team. Report a bug, ask a question about the protocol, or reach out about partnerships and press.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact - Human Interface",
    description:
      "Reach the humaninterface.work team about bugs, the protocol, partnerships, or press.",
    url: "/contact",
  },
  twitter: {
    title: "Contact - Human Interface",
    description:
      "Reach the humaninterface.work team about bugs, the protocol, partnerships, or press.",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
