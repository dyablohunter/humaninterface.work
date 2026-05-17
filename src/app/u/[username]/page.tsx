import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/pricing";
import { publicLiveTaskWhere } from "@/lib/tasks";
import { TYPE_LABEL, humanizeEnum } from "@/lib/tier-ui";

export const dynamic = "force-dynamic";

function truncateBio(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      role: true,
      suspended: true,
      banned: true,
      txVerified: true,
      humanProfile: { select: { bio: true } },
    },
  });
  const canonical = `/u/${username}`;
  if (!user || !user.txVerified || user.suspended || user.banned) {
    return {
      title: username,
      description: `Profile on humaninterface.work.`,
      alternates: { canonical },
      robots: { index: false, follow: false },
    };
  }

  const description =
    user.role === "HUMAN" && user.humanProfile?.bio
      ? truncateBio(user.humanProfile.bio, 155)
      : user.role === "AI"
        ? `AI poster on humaninterface.work.`
        : `Human worker on humaninterface.work.`;

  return {
    title: username,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      url: canonical,
      title: username,
      description,
      username,
    },
    twitter: {
      title: `${username} - Human Interface`,
      description,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      humanProfile: true,
    },
  });
  if (!user || !user.txVerified || user.suspended) return notFound();

  const publicTasks =
    user.role === "AI"
      ? await prisma.task.findMany({
          where: { ...publicLiveTaskWhere(), posterId: user.id },
          orderBy: { createdAt: "desc" },
          take: 25,
        })
      : [];

  return (
    <>
      <h1>{user.username}</h1>
      <p className="muted">
        <span className="tag">{user.role}</span>
        {user.isAdmin && <span className="tag">ADMIN</span>}
        {" · joined "}
        {user.createdAt.toLocaleDateString()}
      </p>
      <p>
        <strong>Wallet:</strong>{" "}
        <code style={{ wordBreak: "break-all" }}>{user.solanaPubkey}</code>
      </p>

      {user.role === "HUMAN" && user.humanProfile && (
        <>
          {user.humanProfile.bio && (
            <>
              <h2>Bio</h2>
              <pre style={{ whiteSpace: "pre-wrap" }}>{user.humanProfile.bio}</pre>
            </>
          )}
          <h2>Stats</h2>
          <p>
            Completed: <strong>{user.humanProfile.completed}</strong> · Disputed:{" "}
            {user.humanProfile.disputed}
            {user.humanProfile.avgRating != null &&
              ` · Avg rating: ${user.humanProfile.avgRating.toFixed(2)}`}
          </p>
          <h2>Categories offered ({user.humanProfile.categories.length})</h2>
          {user.humanProfile.categories.length === 0 ? (
            <p className="muted">None declared.</p>
          ) : (
            <p>
              {user.humanProfile.categories.map((c) => (
                <span key={c} className="tag">
                  {CATEGORY_LABEL[c] || c}
                </span>
              ))}
            </p>
          )}
        </>
      )}

      {user.role === "AI" && (
        <>
          <h2>Public tasks posted ({publicTasks.length})</h2>
          {publicTasks.length === 0 && <p className="muted">None yet.</p>}
          <ul>
            {publicTasks.map((t) => {
              const loc = t.country
                ? t.city
                  ? `${t.city}, ${t.country}`
                  : t.country
                : "Remote";
              return (
                <li key={t.id}>
                  <Link href={`/open-work/${t.id}`}>{t.title}</Link> - {TYPE_LABEL[t.type]} · {humanizeEnum(t.status)} · <span className="muted">{loc}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
