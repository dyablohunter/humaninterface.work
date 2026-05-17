import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Suggestions",
  description:
    "Suggest improvements to humaninterface.work - new categories, protocol changes, UX fixes. Logged-in humans can submit; popular suggestions become petitions.",
  alternates: { canonical: "/suggest" },
  openGraph: {
    title: "Suggestions - Human Interface",
    description:
      "Propose new categories, protocol changes, and UX fixes for humaninterface.work.",
    url: "/suggest",
  },
  twitter: {
    title: "Suggestions - Human Interface",
    description:
      "Propose new categories, protocol changes, and UX fixes for humaninterface.work.",
  },
};

export default function SuggestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
