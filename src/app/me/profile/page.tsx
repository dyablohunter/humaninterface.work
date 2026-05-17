import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CATEGORY_META } from "@/lib/pricing";
import { ProfileEditor } from "@/components/ProfileEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit profile",
  description: "Edit your humaninterface.work profile, bio, and category offerings.",
  alternates: { canonical: "/me/profile" },
  robots: { index: false, follow: false },
};

export default async function ProfileEditPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "HUMAN") redirect("/me");

  const profile = await prisma.humanProfile.findUnique({
    where: { userId: session.userId },
  });
  if (!profile) redirect("/me");

  const catalog = Object.values(CATEGORY_META).map((c) => ({
    code: c.code,
    label: c.label,
    group: c.group,
  }));

  return (
    <>
      <p>
        <Link href="/me" className="btn">← Back to dashboard</Link>
      </p>
      <h1>Edit profile</h1>
      <ProfileEditor
        initialBio={profile.bio ?? ""}
        initialCategories={profile.categories}
        catalog={catalog}
      />
    </>
  );
}
