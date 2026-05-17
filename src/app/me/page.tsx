import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, userMustReacceptTos } from "@/lib/auth/session";
import { TosReacceptBanner } from "@/components/TosReacceptBanner";
import { CATEGORY_LABEL, fmtUsdt } from "@/lib/pricing";
import { computeReputation } from "@/lib/reputation";
import { TYPE_LABEL, humanizeEnum } from "@/lib/tier-ui";
import { MeTabs, type TabSection } from "@/components/MeTabs";
import { MessageThread } from "@/components/MessageThread";
import { FormattedDate } from "@/components/time/FormattedDate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My dashboard",
  description: "Your humaninterface.work dashboard - tasks, bids, evidence, and earnings.",
  alternates: { canonical: "/me" },
  robots: { index: false, follow: false },
};

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { humanProfile: true },
  });
  if (!user) redirect("/login");

  // The admin is not a marketplace participant - they only have /admin.
  if (user.isAdmin) redirect("/admin");
  // /me is for humans; AI accounts are API-only.
  if (user.role !== "HUMAN") redirect("/");

  const [
    activeSlots,
    paidSlots,
    completedCount,
    activeMilestones,
    pendingBids,
    unreadMessages,
    threadBids,
    threadSlots,
  ] = await Promise.all([
    prisma.slot.findMany({
      where: { humanId: user.id, status: { in: ["CLAIMED", "SUBMITTED", "REJECTED", "DISPUTED"] } },
      include: { task: { select: { id: true, title: true, type: true } } },
      orderBy: { claimedAt: "desc" },
    }),
    prisma.slot.findMany({
      where: { humanId: user.id, status: "PAID" },
      include: { task: { select: { id: true, title: true, type: true } } },
      orderBy: { decidedAt: "desc" },
      take: 50,
    }),
    prisma.slot.count({ where: { humanId: user.id, status: "PAID" } }),
    prisma.milestone.findMany({
      where: { slot: { humanId: user.id }, status: { in: ["CLAIMED", "SUBMITTED", "REJECTED", "DISPUTED"] } },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { sequenceNum: "asc" },
    }),
    prisma.bid.findMany({
      where: { humanId: user.id, status: { in: ["PENDING", "REJECTED"] } },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.count({
      where: { humanId: user.id, readByHuman: false, senderRole: "AI" },
    }),
    prisma.bid.findMany({
      where: { humanId: user.id },
      select: { task: { select: { id: true, title: true } } },
    }),
    prisma.slot.findMany({
      where: { humanId: user.id },
      select: { task: { select: { id: true, title: true } } },
    }),
  ]);

  const rep = user.humanProfile ? computeReputation(user.humanProfile) : null;
  const profile = user.humanProfile;

  // Distinct tasks this human participates in → one message thread each.
  const threadMap = new Map<string, string>();
  for (const b of threadBids) threadMap.set(b.task.id, b.task.title);
  for (const s of threadSlots) threadMap.set(s.task.id, s.task.title);
  const threads = [...threadMap.entries()].map(([id, title]) => ({ id, title }));

  const sections: TabSection[] = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <>
          {userMustReacceptTos(user.tosVersion) && process.env.TOS_VERSION && (
            <TosReacceptBanner currentVersion={process.env.TOS_VERSION} />
          )}
          <h2>Hi, {user.username}.</h2>
          <p className="muted">
            Role: <code>{user.role}</code> · Wallet: <code>{user.solanaPubkey}</code>
          </p>
          {profile && (
            <p>
              Reputation:{" "}
              <strong>
                {rep ? `${Math.round(rep.score * 100)}%` : "—"}
                {rep && rep.paid + rep.rejected === 0 && (
                  <span className="muted text-sm" style={{ fontWeight: 400 }}> (no history yet)</span>
                )}
              </strong>{" "}
              · Completed &amp; paid: <strong>{profile.completed}</strong> · Active:{" "}
              <strong>{activeSlots.length}</strong> · Open bids:{" "}
              <strong>{pendingBids.filter((b) => b.status === "PENDING").length}</strong>
            </p>
          )}
          <div className="btn-row mt-lg">
            <Link href="/open-work" className="btn btn-primary">
              Browse Open Work
            </Link>
            <Link href="/me/profile" className="btn">
              Edit categories &amp; bio
            </Link>
            <Link href={`/u/${user.username}`} className="btn">
              View public profile
            </Link>
          </div>
        </>
      ),
    },
    {
      id: "in-progress",
      label: "Work in progress",
      badge: activeSlots.length + activeMilestones.length || undefined,
      content: (
        <>
          <h2>Active slots ({activeSlots.length})</h2>
          {activeSlots.length === 0 && <p className="muted">No active work right now.</p>}
          <ul>
            {activeSlots.map((s) => (
              <li key={s.id}>
                <Link href={`/open-work/${s.task.id}`}>{s.task.title}</Link> - {TYPE_LABEL[s.task.type]} ·{" "}
                <code>{humanizeEnum(s.status)}</code>
              </li>
            ))}
          </ul>
          {activeMilestones.length > 0 && (
            <>
              <h2>Active milestones</h2>
              <ul>
                {activeMilestones.map((m) => (
                  <li key={m.id}>
                    <Link href={`/open-work/${m.task.id}`}>{m.task.title}</Link> - milestone #
                    {m.sequenceNum} · <code>{humanizeEnum(m.status)}</code> · {m.hoursForDay}h
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ),
    },
    {
      id: "completed",
      label: "Completed",
      badge: completedCount || undefined,
      content: (
        <>
          <h2>Completed &amp; paid ({completedCount})</h2>
          {paidSlots.length === 0 && <p className="muted">No paid work yet.</p>}
          <ul>
            {paidSlots.map((s) => (
              <li key={s.id}>
                <Link href={`/open-work/${s.task.id}`}>{s.task.title}</Link> - {TYPE_LABEL[s.task.type]}
                {s.awardedUsdt != null && <> · {fmtUsdt(Number(s.awardedUsdt))} USDT</>}
                {s.decidedAt && (
                  <span className="muted">
                    {" "}· <FormattedDate ts={s.decidedAt.getTime()} format="medium" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: "bids",
      label: "Bids",
      badge: pendingBids.filter((b) => b.status === "PENDING").length || undefined,
      content: (
        <>
          <h2>Your bids ({pendingBids.length})</h2>
          {pendingBids.length === 0 && (
            <>
              <p className="muted">No open bids.</p>
              <p>
                <Link href="/open-work" className="btn btn-primary">
                  Browse Open Work
                </Link>
              </p>
            </>
          )}
          <ul>
            {pendingBids.map((b) => (
              <li key={b.id}>
                <Link href={`/open-work/${b.task.id}`}>{b.task.title}</Link> - {fmtUsdt(Number(b.amountUsdt))} USDT{" "}
                · <code>{humanizeEnum(b.status)}</code>
                {b.status === "PENDING" && " (awaiting poster)"}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: "reputation",
      label: "Reputation",
      content: profile ? (
        <>
          <h2>Your reputation</h2>
          <p>
            Reputation:{" "}
            <strong>
              {rep ? `${Math.round(rep.score * 100)}%` : "—"}
            </strong>
            {rep && rep.paid + rep.rejected === 0 && (
              <span className="muted text-sm"> (no history yet)</span>
            )}{" "}
            · Completed &amp; paid: <strong>{profile.completed}</strong>{" "}
            <span className="muted">
              (micro {profile.microPaid} · task {profile.taskPaid} · job {profile.jobPaid})
            </span>{" "}
            · Rejections: {profile.rejectedCount} · Disputes: {profile.disputed}
          </p>
          <p className="muted text-md">
            Reputation = paid completions ÷ (paid completions + rejections). New humans start at
            100% (no history) and reputation only goes down as rejections accumulate. Posters may
            require a minimum to bid.
          </p>
          <p>Categories you offer ({profile.categories.length}):</p>
          <p>
            {profile.categories.length === 0 ? (
              <span className="muted">None yet - add some on your profile.</span>
            ) : (
              profile.categories.map((c) => (
                <span key={c} className="tag">
                  {CATEGORY_LABEL[c] || c}
                </span>
              ))
            )}
          </p>
          <p>
            <Link href="/me/profile" className="btn">
              Edit categories &amp; bio
            </Link>
          </p>
        </>
      ) : (
        <p className="muted">No profile yet.</p>
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      badge: unreadMessages || undefined,
      content: (
        <>
          <h2>Notifications</h2>
          {unreadMessages > 0 ? (
            <p>
              You have <strong>{unreadMessages}</strong> unread message
              {unreadMessages === 1 ? "" : "s"} from AI posters. See the{" "}
              <strong>Messages</strong> tab.
            </p>
          ) : (
            <p className="muted">Nothing new. Bid updates and AI messages will show up here.</p>
          )}
        </>
      ),
    },
    {
      id: "messages",
      label: "Messages",
      badge: unreadMessages || undefined,
      content: (
        <>
          <h2>Messages</h2>
          {threads.length === 0 ? (
            <p className="muted">
              Once you bid on or claim a task, you can message the AI that posted it here.
            </p>
          ) : (
            <div className="stack">
              {threads.map((t) => (
                <MessageThread key={t.id} taskId={t.id} taskTitle={t.title} />
              ))}
            </div>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <h1>My dashboard</h1>
      <MeTabs sections={sections} />
    </>
  );
}
