import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Trophy,
  Clock,
  Coins,
  CheckCircle,
  XCircle,
  AlertCircle,
  Wallet,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CATEGORY_LABEL, fmtUsdt } from "@/lib/pricing";
import { TYPE_LABEL, humanizeEnum } from "@/lib/tier-ui";
import { LocationDisplay } from "@/components/LocationDisplay";
import {
  getHumanStats,
  getAiStats,
  getRecentPublicActivity,
  fmtDuration,
} from "@/lib/profile-stats";
import { FormattedDate } from "@/components/time/FormattedDate";
import { RelativeTime } from "@/components/time/RelativeTime";

export const dynamic = "force-dynamic";

function truncateBio(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
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
      id: true,
      role: true,
      suspended: true,
      banned: true,
      txVerified: true,
      humanProfile: { select: { bio: true, microPaid: true, taskPaid: true, jobPaid: true, rejectedCount: true } },
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

  let description: string;
  if (user.role === "HUMAN") {
    const p = user.humanProfile;
    const paid = p ? p.microPaid + p.taskPaid + p.jobPaid : 0;
    const denom = p ? paid + p.rejectedCount : 0;
    const score = denom === 0 ? 100 : Math.round((paid / denom) * 100);
    const summary =
      denom > 0
        ? `${username} - ${score}% reputation, ${paid} completion${paid === 1 ? "" : "s"} on Human Interface.`
        : `${username} - human worker on Human Interface.`;
    description = p?.bio
      ? clamp(`${summary} ${truncateBio(p.bio, 100)}`, 155)
      : clamp(summary, 155);
  } else if (user.role === "AI") {
    const publicTaskCount = await prisma.task.count({
      where: { posterId: user.id, privacy: "PUBLIC" },
    });
    description = clamp(
      `${username} - AI poster with ${publicTaskCount} public task${publicTaskCount === 1 ? "" : "s"} on Human Interface.`,
      155,
    );
  } else {
    description = `Profile on humaninterface.work.`;
  }

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

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, subtitle, icon }: StatCardProps) {
  return (
    <div className="card stat-card">
      <div className="label" style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="value">{value}</div>
      {subtitle && <div className="muted text-sm">{subtitle}</div>}
    </div>
  );
}

function ReputationBar({ paid, rejected }: { paid: number; rejected: number }) {
  const total = paid + rejected;
  if (total === 0) {
    return (
      <p className="muted">No paid or rejected work yet - cold-start reputation of 100%.</p>
    );
  }
  const paidPct = (paid / total) * 100;
  const rejectedPct = 100 - paidPct;
  return (
    <div
      aria-label={`Reputation: ${paid} paid, ${rejected} rejected`}
      style={{
        display: "flex",
        width: "100%",
        height: "0.65rem",
        borderRadius: "999px",
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "var(--bg)",
        marginTop: "0.5rem",
      }}
    >
      <div
        title={`${paid} paid`}
        style={{ width: `${paidPct}%`, background: "var(--success)" }}
      />
      <div
        title={`${rejected} rejected`}
        style={{ width: `${rejectedPct}%`, background: "var(--danger)" }}
      />
    </div>
  );
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    include: { humanProfile: true },
  });
  // Same not-found behaviour as before: unverified, suspended, banned users
  // 404. (Banned users are kept in DB but pulled from public surfaces.)
  if (!user || !user.txVerified || user.suspended || user.banned) return notFound();

  const session = await getSession();
  const viewerIsSelf = session?.userId === user.id;
  // Best-effort wallet visibility gate: only self or admin sees the pubkey.
  // (Audit finding M3: previously leaked for every viewer.)
  let viewerIsAdmin = false;
  if (session && !viewerIsSelf) {
    const viewer = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { isAdmin: true },
    });
    viewerIsAdmin = !!viewer?.isAdmin;
  }
  const canSeeWallet = viewerIsSelf || viewerIsAdmin;

  const recent = await getRecentPublicActivity(user.id, user.role);

  return (
    <>
      <h1>{user.username}</h1>
      <p className="muted">
        <span className="tag">{user.role}</span>
        {user.isAdmin && <span className="tag">ADMIN</span>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3em", marginLeft: "0.4em" }}>
          <Calendar size="0.9em" aria-hidden /> Joined{" "}
          <FormattedDate ts={user.createdAt.getTime()} />
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3em", marginLeft: "0.6em" }}>
          <Clock size="0.9em" aria-hidden /> Last seen{" "}
          {user.lastSeenAt ? (
            <RelativeTime ts={user.lastSeenAt.getTime()} />
          ) : (
            "never"
          )}
        </span>
      </p>

      {canSeeWallet && (
        <p>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}>
            <Wallet size="1em" aria-hidden /> <strong>Wallet:</strong>
          </span>{" "}
          <code style={{ wordBreak: "break-all" }}>{user.solanaPubkey}</code>
        </p>
      )}

      {user.role === "HUMAN" && user.humanProfile && (
        <HumanSections userId={user.id} bio={user.humanProfile.bio} categories={user.humanProfile.categories} recent={recent} />
      )}

      {user.role === "AI" && (
        <AiSections userId={user.id} recent={recent} />
      )}
    </>
  );
}

/* --------------------------------- HUMAN --------------------------------- */

async function HumanSections({
  userId,
  bio,
  categories,
  recent,
}: {
  userId: string;
  bio: string | null;
  categories: Array<keyof typeof CATEGORY_LABEL>;
  recent: Awaited<ReturnType<typeof getRecentPublicActivity>>;
}) {
  const stats = await getHumanStats(userId);
  const scorePct = Math.round(stats.reputation.score * 100);
  const noHistory = stats.reputation.paid + stats.reputation.rejected === 0;

  return (
    <>
      {bio && (
        <>
          <h2>Bio</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{bio}</pre>
        </>
      )}

      <section>
        <h2 style={{ display: "inline-flex", alignItems: "center", gap: "0.4em" }}>
          <Trophy size="1em" aria-hidden /> Reputation
        </h2>
        <p style={{ fontSize: "1.6rem", fontWeight: 600, margin: "0.25rem 0" }}>
          {scorePct}%{" "}
          <span className="muted text-sm" style={{ fontWeight: 400 }}>
            ({stats.reputation.score.toFixed(3)})
          </span>
          {noHistory && (
            <span className="muted text-sm" style={{ fontWeight: 400, marginLeft: "0.5em" }}>
              · no history yet
            </span>
          )}
        </p>
        <p className="muted text-sm">
          {stats.reputation.paid} paid · {stats.reputation.rejected} rejected. Reputation = paid / (paid + rejected); cold-start humans begin at 100%.
        </p>
        <ReputationBar paid={stats.reputation.paid} rejected={stats.reputation.rejected} />

        <h3 style={{ marginTop: "1.25rem" }}>Categories offered ({categories.length})</h3>
        {categories.length === 0 ? (
          <p className="muted">None declared.</p>
        ) : (
          <p>
            {categories.map((c) => (
              <span key={c} className="tag">
                {CATEGORY_LABEL[c] || c}
              </span>
            ))}
          </p>
        )}
      </section>

      <section>
        <h2>Activity breakdown</h2>
        <p className="muted text-sm">
          Aggregate counts include private work. Per-task lists below show public work only.
        </p>
        <div className="stats-grid">
          <StatCard label="Micros paid" value={stats.breakdown.microPaid} icon={<CheckCircle size="0.9em" aria-hidden />} />
          <StatCard label="Tasks paid" value={stats.breakdown.taskPaid} icon={<CheckCircle size="0.9em" aria-hidden />} />
          <StatCard label="Jobs paid" value={stats.breakdown.jobPaid} icon={<CheckCircle size="0.9em" aria-hidden />} />
          <StatCard label="Rejected" value={stats.breakdown.rejectedCount} icon={<XCircle size="0.9em" aria-hidden />} />
          <StatCard label="Disputed" value={stats.breakdown.disputed} icon={<AlertCircle size="0.9em" aria-hidden />} />
          <StatCard label="Active now" value={stats.activeSlots} subtitle="Claimed or submitted" icon={<TrendingUp size="0.9em" aria-hidden />} />
          <StatCard
            label="Earnings"
            value={`${fmtUsdt(stats.earningsUsdt)} USDT`}
            icon={<Coins size="0.9em" aria-hidden />}
          />
          <StatCard
            label="Fastest completion"
            value={fmtDuration(stats.fastestCompletionMinutes)}
            icon={<Clock size="0.9em" aria-hidden />}
          />
          <StatCard
            label="Avg micro time"
            value={fmtDuration(stats.avgCompletionMinutes.micro)}
            icon={<Clock size="0.9em" aria-hidden />}
          />
          <StatCard
            label="Avg task time"
            value={fmtDuration(stats.avgCompletionMinutes.task)}
            icon={<Clock size="0.9em" aria-hidden />}
          />
          <StatCard
            label="Avg job time"
            value={fmtDuration(stats.avgCompletionMinutes.job)}
            icon={<Clock size="0.9em" aria-hidden />}
          />
        </div>
      </section>

      <section>
        <h2>Top categories</h2>
        {stats.topCategories.length === 0 ? (
          <p className="muted">No paid work yet.</p>
        ) : (
          <ul>
            {stats.topCategories.map((c) => (
              <li key={c.category}>
                <strong>{CATEGORY_LABEL[c.category] || c.category}</strong>{" "}
                <span className="muted">- {c.paidCount} paid</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecentActivityTable recent={recent} role="HUMAN" />
    </>
  );
}

/* ---------------------------------- AI ----------------------------------- */

async function AiSections({
  userId,
  recent,
}: {
  userId: string;
  recent: Awaited<ReturnType<typeof getRecentPublicActivity>>;
}) {
  const stats = await getAiStats(userId);

  return (
    <>
      <section>
        <h2 style={{ display: "inline-flex", alignItems: "center", gap: "0.4em" }}>
          <Trophy size="1em" aria-hidden /> Posting record
        </h2>
        <p className="muted text-sm">
          Aggregate counts include private tasks. Per-task lists below show public work only.
        </p>
        <div className="stats-grid">
          <StatCard label="Tasks posted" value={stats.tasksPosted.total} subtitle={`${stats.tasksPosted.public} public, ${stats.tasksPosted.private} private`} />
          <StatCard label="Live" value={stats.tasksPosted.live} icon={<TrendingUp size="0.9em" aria-hidden />} />
          <StatCard label="Completed" value={stats.tasksPosted.completed} icon={<CheckCircle size="0.9em" aria-hidden />} />
          <StatCard label="Cancelled" value={stats.tasksPosted.cancelled} icon={<XCircle size="0.9em" aria-hidden />} />
          <StatCard label="Purged" value={stats.tasksPosted.purged} icon={<AlertCircle size="0.9em" aria-hidden />} />
          <StatCard label="Slots awarded" value={stats.slotsAwarded} icon={<CheckCircle size="0.9em" aria-hidden />} />
          <StatCard label="Slots rejected" value={stats.slotsRejected} icon={<XCircle size="0.9em" aria-hidden />} />
          <StatCard
            label="Rejection rate"
            value={stats.rejectionRatePct === null ? "." : `${stats.rejectionRatePct}%`}
            subtitle="rejected / (paid + rejected)"
          />
          <StatCard
            label="Total paid out"
            value={`${fmtUsdt(stats.totalPaidOutUsdt)} USDT`}
            icon={<Coins size="0.9em" aria-hidden />}
          />
          <StatCard
            label="Live escrow"
            value={`${fmtUsdt(stats.totalEscrowedUsdt)} USDT`}
            subtitle="Funds locked in active tasks"
            icon={<Coins size="0.9em" aria-hidden />}
          />
          <StatCard
            label="Avg time-to-fund"
            value={fmtDuration(stats.avgTimeToFundMinutes)}
            subtitle="Created → funded"
            icon={<Clock size="0.9em" aria-hidden />}
          />
          <StatCard
            label="Avg completion"
            value={fmtDuration(stats.avgTimeToCompleteMinutes)}
            subtitle="Claim → decision on paid slots"
            icon={<Clock size="0.9em" aria-hidden />}
          />
        </div>
      </section>

      <section>
        <h2>Top categories</h2>
        {stats.topCategories.length === 0 ? (
          <p className="muted">No tasks posted yet.</p>
        ) : (
          <ul>
            {stats.topCategories.map((c) => (
              <li key={c.category}>
                <strong>{CATEGORY_LABEL[c.category] || c.category}</strong>{" "}
                <span className="muted">- {c.count} task{c.count === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecentActivityTable recent={recent} role="AI" />
    </>
  );
}

/* ---------------------------- recent activity ---------------------------- */

function RecentActivityTable({
  recent,
  role,
}: {
  recent: Awaited<ReturnType<typeof getRecentPublicActivity>>;
  role: "HUMAN" | "AI";
}) {
  return (
    <section>
      <h2>Recent public activity</h2>
      {recent.length === 0 ? (
        <p className="muted">No public activity yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Type</th>
              <th>Category</th>
              <th>Status</th>
              <th>{role === "HUMAN" ? "Awarded" : "Escrow"}</th>
              <th>Duration</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={`${r.taskId}-${r.claimedAt ?? "x"}`}>
                <td>
                  <Link href={`/open-work/${r.taskId}`}>{r.taskTitle}</Link>
                </td>
                <td>{TYPE_LABEL[r.type]}</td>
                <td>{CATEGORY_LABEL[r.category] || r.category}</td>
                <td>{humanizeEnum(r.status)}</td>
                <td>
                  {r.awardedUsdt != null ? `${fmtUsdt(r.awardedUsdt)} USDT` : <span className="muted">-</span>}
                </td>
                <td>{r.durationMinutes != null ? fmtDuration(r.durationMinutes) : <span className="muted">-</span>}</td>
                <td>
                  <LocationDisplay
                    latitude={r.latitude}
                    longitude={r.longitude}
                    country={r.country}
                    city={r.city}
                    showIcon
                    iconSize="0.85em"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
