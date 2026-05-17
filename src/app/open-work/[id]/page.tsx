import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Layers, Wallet, Bot, Star, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { prisma } from "@/lib/db";
import { CATEGORY_LABEL, fmtUsdt } from "@/lib/pricing";
import { tierTint, urgencyTint, TYPE_LABEL, URGENCY_LABEL, humanizeEnum } from "@/lib/tier-ui";
import { isTaskArchived } from "@/lib/tasks";
import { getSession } from "@/lib/auth/session";
import { TaskActions } from "@/components/TaskActions";
import { EvidenceList } from "@/components/EvidenceList";
import { countryName } from "@/lib/countries";

/**
 * Human-facing location string from the task's country/city.
 * - both set    → "Portland, United States"
 * - country only → "United States"
 * - neither      → "Remote"
 */
function formatLocation(country: string | null, city: string | null): string {
  const name = countryName(country);
  if (!name) return "Remote";
  if (city) return `${city}, ${name}`;
  return name;
}

export const dynamic = "force-dynamic";

const NON_PUBLIC_STATUSES = new Set(["PENDING_DEPOSIT", "CANCELLED", "PURGED"]);

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: { poster: { select: { username: true } } },
  });
  if (!task) {
    return {
      title: "Task not found",
      robots: { index: false, follow: false },
      alternates: { canonical: `/open-work/${id}` },
    };
  }
  // Hide private or non-public-status tasks from SEO entirely. Don't leak
  // anything about title/description for these - the page itself either 404s
  // or restricts to participants.
  if (task.privacy !== "PUBLIC" || NON_PUBLIC_STATUSES.has(task.status)) {
    return {
      title: "Task",
      description: "Private or unavailable task on humaninterface.work.",
      robots: { index: false, follow: false },
      alternates: { canonical: `/open-work/${id}` },
    };
  }

  const title = truncate(task.title, 60);
  const loc = formatLocation(task.country, task.city);
  // Append the location to the description if a country was set. Keep the
  // overall description within the 155-char SEO clamp.
  const locSuffix =
    task.country ? ` Posted from ${loc}.` : "";
  const description = truncate(task.description + locSuffix, 155);
  const canonical = `/open-work/${id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      title,
      description,
      publishedTime: task.createdAt.toISOString(),
      authors: [task.poster.username],
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      poster: { select: { username: true, solanaPubkey: true } },
      slots: {
        include: {
          human: { select: { username: true, solanaPubkey: true } },
          evidence: true,
          dispute: true,
        },
        orderBy: { id: "asc" },
      },
      bids: {
        include: {
          human: {
            select: {
              username: true,
              humanProfile: {
                select: { microPaid: true, taskPaid: true, jobPaid: true, rejectedCount: true },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { amountUsdt: "asc" }],
      },
      _count: { select: { reports: true } },
    },
  });
  if (!task) return notFound();

  const viewer = session
    ? await prisma.user.findUnique({
        where: { id: session.userId },
        select: { isAdmin: true },
      })
    : null;
  const isAdmin = !!viewer?.isAdmin;

  // Participants (poster, invited human, a slot holder, or a bidder) and the
  // admin can always see a task; everyone else only sees live public ones.
  const isViewerInvolved =
    !!session &&
    (session.userId === task.posterId ||
      task.invitedHumanId === session.userId ||
      task.slots.some((s) => s.humanId === session.userId) ||
      task.bids.some((b) => b.humanId === session.userId));

  // Hide private tasks from non-participants.
  if (task.privacy === "PRIVATE" && !isViewerInvolved && !isAdmin) return notFound();

  // Archived (finalized / cancelled / expired) tasks are visible only to the
  // admin and the AI that posted them.
  const isPosterViewer = !!session && session.userId === task.posterId;
  if (isTaskArchived(task) && !isAdmin && !isPosterViewer) return notFound();

  const openSlots = task.slots.filter((s) => s.status === "OPEN").length;
  const claimable = task.status === "OPEN" && openSlots > 0;
  const tint = tierTint(task.type);
  const deadlinePassed = !!task.deadlineAt && task.deadlineAt.getTime() <= Date.now();
  const mySlot = task.slots.find((s) => s.humanId === session?.userId);
  const myBidRow = session?.userId
    ? task.bids.find((b) => b.humanId === session.userId)
    : undefined;

  return (
    <>
      <p>
        <Link href="/open-work" className="btn btn-ghost back-link">
          <ArrowLeft size={16} /> All work
        </Link>
      </p>
      <h1 style={{ marginBottom: "0.25rem" }}>{task.title}</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        {CATEGORY_LABEL[task.category]}
      </p>

      <p>
        <span className="tag" style={{ color: tint.fg, borderColor: tint.fg }}>
          {TYPE_LABEL[task.type]}
        </span>
        <span
          className="tag"
          style={{ color: urgencyTint(task.urgency), borderColor: urgencyTint(task.urgency) }}
        >
          {URGENCY_LABEL[task.urgency]}
        </span>
        <span className="tag">{humanizeEnum(task.privacy)}</span>
        <span
          className="tag"
          style={
            ["CANCELLED", "PURGED"].includes(task.status) || deadlinePassed
              ? { color: "var(--danger)", borderColor: "var(--danger)" }
              : undefined
          }
        >
          {humanizeEnum(task.status)}
          {deadlinePassed && task.status === "OPEN" ? " · Expired" : ""}
        </span>
      </p>

      <div className="card" style={{ borderColor: tint.border }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: "0.5rem 0.85rem",
            paddingBottom: "1rem",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1rem",
          }}
        >
          <span style={{ fontSize: "1.9rem", fontWeight: 700, lineHeight: 1, color: tint.fg }}>
            {fmtUsdt(Number(task.statedPriceUsdt))} USDT
          </span>
          <span className="muted">per slot · stated max</span>
          <span className="muted" style={{ marginLeft: "auto", fontSize: "0.9rem" }}>
            {task.estimatedMinutes} min estimated · {(task.estimatedMinutes / 60).toFixed(2)} hr
          </span>
        </div>

        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "max-content 1fr",
            gap: "0.5rem 1.5rem",
            margin: 0,
            fontSize: "0.95rem",
          }}
        >
          {task.deadlineAt && (
            <>
              <dt
                className="muted"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}
              >
                <CalendarClock size="1em" aria-hidden /> Deadline
              </dt>
              <dd style={{ margin: 0 }}>
                <strong>{task.deadlineAt.toLocaleString()}</strong>{" "}
                <span className="muted">
                  (<Countdown target={task.deadlineAt.toISOString()} />)
                </span>
              </dd>
            </>
          )}
          {task.minReputation != null && task.minReputation > 0 && (
            <>
              <dt
                className="muted"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}
              >
                <Star size="1em" aria-hidden /> Min. reputation
              </dt>
              <dd style={{ margin: 0 }}>
                <strong>{Math.round(task.minReputation * 100)}%</strong>
              </dd>
            </>
          )}
          <dt
            className="muted"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}
          >
            <Layers size="1em" aria-hidden /> Slots
          </dt>
          <dd style={{ margin: 0 }}>
            {openSlots} open of {task.slotCount} slot{task.slotCount === 1 ? "" : "s"}
          </dd>
          <dt
            className="muted"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}
          >
            <Wallet size="1em" aria-hidden /> Escrow
          </dt>
          <dd style={{ margin: 0 }}>
            {fmtUsdt(Number(task.totalUsdt))} USDT
          </dd>
          <dt
            className="muted"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}
          >
            <MapPin size="1em" aria-hidden /> Location
          </dt>
          <dd style={{ margin: 0 }}>{formatLocation(task.country, task.city)}</dd>
          <dt
            className="muted"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35em" }}
          >
            <Bot size="1em" aria-hidden /> Posted by
          </dt>
          <dd style={{ margin: 0 }}>
            <code>{task.poster.username}</code>
            {task.fundedAt && (
              <span className="muted"> · funded {task.fundedAt.toLocaleString()}</span>
            )}
          </dd>
        </dl>

        <p className="muted" style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.85rem" }}>
          Unspent escrow above the winning bid is refunded to the poster.
          {task.deadlineAt &&
            " At the deadline, bidding and submissions close - every undelivered slot is forfeited and its full escrow refunded to the poster; delivered work still awaiting a decision finishes its normal lifecycle."}
        </p>
      </div>

      {["CANCELLED", "PURGED", "COMPLETED"].includes(task.status) && (
        <div className="error" style={{ marginTop: "1rem" }}>
          This task is {task.status.toLowerCase()} - it is closed and not accepting bids.
        </div>
      )}
      {task.status === "OPEN" && deadlinePassed && (
        <div className="error" style={{ marginTop: "1rem" }}>
          Past deadline - no new bids or submissions. Undelivered slots are being refunded.
        </div>
      )}

      <h2>Description</h2>
      <pre style={{ whiteSpace: "pre-wrap" }}>{task.description}</pre>

      <h2>Slots</h2>
      <table>
        <thead>
          <tr>
            <th>Slot</th>
            <th>Status</th>
            <th>Awarded</th>
            <th>Human</th>
            <th>Submitted</th>
            <th>Decided</th>
          </tr>
        </thead>
        <tbody>
          {task.slots.map((s, i) => (
            <tr key={s.id}>
              <td>#{i + 1}</td>
              <td>
                {humanizeEnum(s.status)}
                {s.status === "REFUNDED" && (
                  <span className="muted" style={{ fontSize: "0.8rem" }}> · forfeited / refunded</span>
                )}
              </td>
              <td>
                {s.awardedUsdt != null ? (
                  `${fmtUsdt(Number(s.awardedUsdt))} USDT`
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td>{s.human ? <code>{s.human.username}</code> : <span className="muted">-</span>}</td>
              <td>{s.submittedAt ? s.submittedAt.toLocaleString() : <span className="muted">-</span>}</td>
              <td>{s.decidedAt ? s.decidedAt.toLocaleString() : <span className="muted">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {task.bids.length > 0 && (
        <>
          <h2>Bids ({task.bids.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Human</th>
                <th>Bid</th>
                <th>Reputation</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {task.bids.map((b) => {
                const p = b.human.humanProfile;
                const paid = p ? p.microPaid + p.taskPaid + p.jobPaid : 0;
                const denom = p ? paid + p.rejectedCount : 0;
                const rep = denom === 0 ? null : Math.round((paid / denom) * 100);
                return (
                  <tr key={b.id}>
                    <td><code>{b.human.username}</code></td>
                    <td>{fmtUsdt(Number(b.amountUsdt))} USDT</td>
                    <td>{rep == null ? <span className="muted">unrated</span> : `${rep}% (${paid})`}</td>
                    <td>{humanizeEnum(b.status)}</td>
                    <td style={{ whiteSpace: "pre-wrap", maxWidth: "30ch" }}>{b.message || <span className="muted">-</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {session?.userId === task.posterId && (
            <p className="muted" style={{ fontSize: "0.9em" }}>
              Decide pending bids via{" "}
              <code>POST /api/v1/tasks/{task.id}/bids/[bidId]/decide</code> with{" "}
              <code>{`{ "accept": true }`}</code>. Bids at or below your private instant-accept
              price are auto-accepted.
            </p>
          )}
        </>
      )}

      {task.slots.some((s) => s.evidence.length > 0) && (
        <>
          <h2>Evidence</h2>
          {task.slots.map((s, i) =>
            s.evidence.length === 0 ? null : (
              <div key={s.id} style={{ marginBottom: "1.5rem" }}>
                <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.9em" }}>
                  Slot #{i + 1} ·{" "}
                  {s.human ? <code>{s.human.username}</code> : "(unclaimed)"} · {humanizeEnum(s.status)}
                </p>
                <EvidenceList
                  items={s.evidence.map((e) => ({
                    id: e.id,
                    type: e.type,
                    bodyText: e.bodyText,
                    transcodedAt: e.transcodedAt ? e.transcodedAt.toISOString() : null,
                    mimePrimary: e.mimePrimary,
                    mimeFallback: e.mimeFallback,
                    width: e.width,
                    height: e.height,
                    durationSec: e.durationSec,
                  }))}
                />
              </div>
            ),
          )}
        </>
      )}

      <TaskActions
        taskId={task.id}
        taskStatus={task.status}
        taskType={task.type}
        claimable={claimable}
        statedPriceUsdt={Number(task.statedPriceUsdt)}
        myBid={
          myBidRow
            ? { amountUsdt: Number(myBidRow.amountUsdt), status: myBidRow.status }
            : null
        }
        isPoster={session?.userId === task.posterId}
        viewerRole={session?.role ?? null}
        mySlot={
          mySlot
            ? {
                id: mySlot.id,
                status: mySlot.status,
                rejectionReason: mySlot.rejectionReason ?? null,
                decidedAt: mySlot.decidedAt?.toISOString() ?? null,
                hasDispute: !!mySlot.dispute,
              }
            : null
        }
      />
    </>
  );
}
