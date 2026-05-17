import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminDisputeRow } from "@/components/AdminDisputeRow";
import { AdminUserSuspend } from "@/components/AdminUserSuspend";
import { AdminTestSuite } from "@/components/AdminTestSuite";
import { AdminTaskDelete } from "@/components/AdminTaskDelete";
import { CopyIdButton } from "@/components/CopyIdButton";
import { AdminModerationRow } from "@/components/AdminModerationRow";
import { ARCHIVED_STATUSES } from "@/lib/tasks";
import { TYPE_LABEL, humanizeEnum } from "@/lib/tier-ui";
import { MeTabs } from "@/components/MeTabs";
import { SwitchView } from "@/components/SwitchView";
import { FormattedDateTime } from "@/components/time/FormattedDateTime";
import { LocationDisplay } from "@/components/LocationDisplay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  description: "Admin console for humaninterface.work.",
  alternates: { canonical: "/admin" },
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.isAdmin) redirect("/");

  const now = new Date();
  const [
    openDisputes,
    fairnessFlagged,
    recentSuggestions,
    recentContact,
    recentTasks,
    archivedTasks,
    txCount,
    moderationReviews,
    bannedIdentities,
    reports,
    humanCount,
    aiCount,
    openTaskCount,
    activeSlotCount,
    contactCount,
    suggestionCount,
    petitions,
  ] = await Promise.all([
      prisma.dispute.findMany({
        where: { status: "OPEN" },
        include: {
          raisedBy: { select: { username: true, solanaPubkey: true } },
          slot: { include: { task: { select: { id: true, title: true, posterId: true } } } },
          milestone: {
            include: {
              slot: { include: { task: { select: { id: true, title: true, posterId: true } } } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.task.findMany({
        where: { status: "FAIRNESS_FLAGGED" },
        include: { poster: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.suggestion.findMany({
        include: { user: { select: { username: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.contactMessage.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.task.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { poster: { select: { username: true } } },
      }),
      prisma.task.findMany({
        where: {
          OR: [
            { status: { in: [...ARCHIVED_STATUSES] } },
            { deadlineAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { poster: { select: { username: true } } },
      }),
      prisma.tokenTxLog.count(),
      prisma.moderationReview.findMany({
        where: { status: { in: ["PENDING", "MANUAL", "ACTIONED"] } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.bannedIdentity.findMany({
        orderBy: { bannedAt: "desc" },
        take: 100,
      }),
      prisma.report.findMany({
        include: {
          task: { select: { id: true, title: true, status: true } },
          user: { select: { username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.user.count({ where: { role: "HUMAN" } }),
      prisma.user.count({ where: { role: "AI" } }),
      prisma.task.count({ where: { status: "OPEN" } }),
      prisma.slot.count({ where: { status: { in: ["CLAIMED", "SUBMITTED", "DISPUTED"] } } }),
      prisma.contactMessage.count(),
      prisma.suggestion.count(),
      prisma.petition.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          author: { select: { username: true } },
          _count: { select: { votes: true } },
        },
      }),
    ]);

  // Only petitions that reached the 51% threshold are submitted for review.
  const reviewPetitions = petitions
    .filter((p) => p.status === "QUALIFIED")
    .sort((a, b) => b._count.votes - a._count.votes);
  const otherPetitions = petitions.filter((p) => p.status !== "QUALIFIED");

  const pendingModerationCount = moderationReviews.filter(
    (m) => m.status === "PENDING" || m.status === "MANUAL",
  ).length;

  // Group reports by task so each reported post shows once with its count.
  const reportsByTask = new Map<
    string,
    { taskId: string; title: string; status: string; count: number; reports: typeof reports }
  >();
  for (const r of reports) {
    const key = r.task.id;
    const entry = reportsByTask.get(key) ?? {
      taskId: r.task.id,
      title: r.task.title,
      status: r.task.status,
      count: 0,
      reports: [] as typeof reports,
    };
    entry.count += 1;
    entry.reports.push(r);
    reportsByTask.set(key, entry);
  }
  const reportedPosts = [...reportsByTask.values()].sort((a, b) => b.count - a.count);

  const stats: { label: string; value: number | string }[] = [
    { label: "Humans", value: humanCount },
    { label: "AI accounts", value: aiCount },
    { label: "Open tasks", value: openTaskCount },
    { label: "Active slots", value: activeSlotCount },
    { label: "Disputes", value: openDisputes.length },
    { label: "Reported", value: reportedPosts.length },
    { label: "Moderation", value: pendingModerationCount },
    { label: "Bans", value: bannedIdentities.length },
    { label: "Petitions", value: reviewPetitions.length },
    { label: "Messages", value: contactCount },
    { label: "Suggestions", value: suggestionCount },
    { label: "USDT TXs", value: txCount },
  ];

  return (
    <>
      <h1>Admin</h1>
      <p className="muted">
        Logged in as <code>{user.username}</code>. Operations dashboard - queues
        below need attention.
      </p>

      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.label} className="card stat-card">
            <div className="value">{s.value}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>

      <MeTabs
        sections={[
          {
            id: "messages",
            label: "Messages",
            badge: recentContact.length + recentSuggestions.length || undefined,
            content: (
              <SwitchView
                options={[
                  {
                    id: "contact",
                    label: "Contact",
                    badge: recentContact.length || undefined,
                    content: (
                      <>
                        <h2>Contact messages ({recentContact.length})</h2>
                        {recentContact.length === 0 && <p className="muted">Inbox empty.</p>}
                        <div className="stack">
                          {recentContact.map((m) => (
                            <div key={m.id} className="card">
                              <p className="muted mb-xs text-md">
                                <strong>{m.name}</strong> · <code>{m.email}</code> · <FormattedDateTime ts={m.createdAt.getTime()} />
                              </p>
                              <pre className="muted-pre">
                                {m.body}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: "suggestions",
                    label: "Suggestions",
                    badge: recentSuggestions.length || undefined,
                    content: (
                      <>
                        <h2>Recent suggestions ({recentSuggestions.length})</h2>
                        {recentSuggestions.length === 0 && <p className="muted">Inbox empty.</p>}
                        <div className="stack">
                          {recentSuggestions.map((s) => (
                            <div key={s.id} className="card">
                              <p className="muted mb-xs text-md">
                                <code>{s.user.username}</code> ({s.user.role}) · <FormattedDateTime ts={s.createdAt.getTime()} />
                              </p>
                              <pre className="muted-pre">
                                {s.body}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            id: "petitions",
            label: "Petitions",
            badge: reviewPetitions.length || undefined,
            content: (
              <SwitchView
                options={[
                  {
                    id: "review",
                    label: "For review",
                    badge: reviewPetitions.length || undefined,
                    content: (
                      <>
                        <h2>Petitions for review ({reviewPetitions.length})</h2>
                        <p className="muted">
                          Only petitions that reached <strong>51% support from active
                          contributors</strong> are submitted here. The rest are still
                          gathering votes (or resolved) - flip the switch to "Other" to
                          see them.
                        </p>
                        {reviewPetitions.length === 0 && (
                          <p className="muted">Nothing awaiting review.</p>
                        )}
                        <div className="stack">
                          {reviewPetitions.map((p) => (
                            <div key={p.id} className="card">
                              <p className="mb-xs">
                                <strong>{p.title}</strong>{" "}
                                <span className="tag">
                                  {p._count.votes} vote{p._count.votes === 1 ? "" : "s"}
                                </span>{" "}
                                <span className="tag">{humanizeEnum(p.status)}</span>
                              </p>
                              <p className="muted mb-xs text-md">
                                by <code>{p.author.username}</code> ·{" "}
                                {p.qualifiedAt ? (
                                  <>qualified <FormattedDateTime ts={p.qualifiedAt.getTime()} /></>
                                ) : (
                                  <FormattedDateTime ts={p.createdAt.getTime()} />
                                )}
                              </p>
                              <pre className="muted-pre">
                                {p.body}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: "other",
                    label: "Other",
                    badge: otherPetitions.length || undefined,
                    content: (
                      <>
                        <h2>Other petitions ({otherPetitions.length})</h2>
                        <p className="muted">
                          Gathering support or already resolved - not yet (or no longer) actionable.
                        </p>
                        {otherPetitions.length === 0 && <p className="muted">None.</p>}
                        <div className="stack">
                          {otherPetitions.map((p) => (
                            <div key={p.id} className="card">
                              <p className="mb-xs">
                                <strong>{p.title}</strong>{" "}
                                <span className="tag">{p._count.votes} vote{p._count.votes === 1 ? "" : "s"}</span>{" "}
                                <span className="tag">{humanizeEnum(p.status)}</span>
                              </p>
                              <p className="muted mb-xs text-md">
                                by <code>{p.author.username}</code> · <FormattedDateTime ts={p.createdAt.getTime()} />
                              </p>
                              <pre className="muted-pre">
                                {p.body}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            id: "moderation",
            label: "Moderation",
            badge:
              openDisputes.length +
                reportedPosts.length +
                fairnessFlagged.length +
                moderationReviews.length || undefined,
            content: (
              <SwitchView
                options={[
                  {
                    id: "disputes",
                    label: "Disputes",
                    badge: openDisputes.length || undefined,
                    content: (
                      <>
                        <h2>Open disputes ({openDisputes.length})</h2>
                        {openDisputes.length === 0 && <p className="muted">No open disputes.</p>}
                        {openDisputes.map((d) => {
                          const task = d.slot?.task ?? d.milestone?.slot.task;
                          return (
                            <AdminDisputeRow
                              key={d.id}
                              id={d.id}
                              taskId={task?.id ?? ""}
                              taskTitle={task?.title ?? "(unknown task)"}
                              kind={d.slotId ? "SLOT" : "MILESTONE"}
                              raisedByUsername={d.raisedBy.username}
                              reason={d.reason}
                              createdAt={d.createdAt.getTime()}
                            />
                          );
                        })}
                      </>
                    ),
                  },
                  {
                    id: "reports",
                    label: "Reports",
                    badge: reportedPosts.length || undefined,
                    content: (
                      <>
                        <h2>Reported posts ({reportedPosts.length})</h2>
                        <p className="muted">
                          Tasks flagged by users for ToS violations. Act via the task
                          page or the Suspend switch.
                        </p>
                        {reportedPosts.length === 0 && <p className="muted">No reports.</p>}
                        <div className="stack">
                          {reportedPosts.map((rp) => (
                            <div key={rp.taskId} className="card">
                              <p className="mb-xs">
                                <Link href={`/open-work/${rp.taskId}`}>{rp.title}</Link>{" "}
                                <span className="tag">
                                  {rp.count} report{rp.count === 1 ? "" : "s"}
                                </span>{" "}
                                <code>{humanizeEnum(rp.status)}</code>
                              </p>
                              <ul className="m-0">
                                {rp.reports.map((r) => (
                                  <li key={r.id} className="muted text-md">
                                    <code>{r.user.username}</code> · <FormattedDateTime ts={r.createdAt.getTime()} />
                                    {r.reason ? <> - {r.reason}</> : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: "fairness",
                    label: "Fairness",
                    badge: fairnessFlagged.length || undefined,
                    content: (
                      <>
                        <h2>Fairness-flagged tasks ({fairnessFlagged.length})</h2>
                        {fairnessFlagged.length === 0 && <p className="muted">None.</p>}
                        <ul>
                          {fairnessFlagged.map((t) => (
                            <li key={t.id}>
                              <Link href={`/open-work/${t.id}`}>{t.title}</Link> ·{" "}
                              {t.fairnessFlags} flags · posted by{" "}
                              <Link href={`/u/${t.poster.username}`}><code>{t.poster.username}</code></Link>
                            </li>
                          ))}
                        </ul>
                      </>
                    ),
                  },
                  {
                    id: "content-safety",
                    label: "Content safety",
                    badge: moderationReviews.length || undefined,
                    content: (
                      <>
                        <h2>Content-safety review ({moderationReviews.length})</h2>
                        <p className="muted">
                          Posts/notes let through because the classifier was unavailable.
                          The worker re-screens these automatically; <code>MANUAL</code>{" "}
                          means automatic retries were exhausted and a human must decide.{" "}
                          <code>ACTIONED</code> means the re-check failed and the account
                          was banned.
                        </p>
                        {moderationReviews.length === 0 && (
                          <p className="muted">Nothing awaiting review.</p>
                        )}
                        <div className="stack">
                          {moderationReviews.map((m) => (
                            <div key={m.id} className="card">
                              <p className="muted mb-xs text-md">
                                <strong>{humanizeEnum(m.status)}</strong> ·{" "}
                                {humanizeEnum(m.kind)} · <code>{m.username}</code>{" "}
                                <code className="text-sm">
                                  {m.pubkey.slice(0, 8)}…
                                </code>{" "}
                                · attempts {m.attempts} · <FormattedDateTime ts={m.createdAt.getTime()} />
                                {m.targetId ? <> · target <code>{m.targetId}</code></> : null}
                                {m.lastError ? <> · last error: {m.lastError}</> : null}
                                {m.category && m.category !== "none" ? (
                                  <> · {m.category}</>
                                ) : null}
                              </p>
                              <pre className="muted-pre">
                                {m.content.slice(0, 2000)}
                              </pre>
                              {m.status !== "ACTIONED" && m.status !== "CLEARED" && (
                                <AdminModerationRow id={m.id} />
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: "suspend",
                    label: "Suspend",
                    content: (
                      <>
                        <h2>Suspend a user</h2>
                        <AdminUserSuspend />
                      </>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            id: "bans",
            label: "Bans",
            badge: bannedIdentities.length || undefined,
            content: (
              <>
                <h2>Permanent bans ({bannedIdentities.length})</h2>
                <p className="muted">
                  Username + pubkey blocklisted for prohibited content. Their posts and any funds were
                  deliberately kept; the username can never be reclaimed.
                </p>
                {bannedIdentities.length === 0 && <p className="muted">No bans.</p>}
                {bannedIdentities.length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Pubkey</th>
                        <th>Category</th>
                        <th>Detail</th>
                        <th>Banned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bannedIdentities.map((b) => (
                        <tr key={b.id}>
                          <td><code>{b.username}</code></td>
                          <td><code>{b.pubkey.slice(0, 12)}…</code></td>
                          <td>{b.category}</td>
                          <td>{b.detail ?? "-"}</td>
                          <td><FormattedDateTime ts={b.bannedAt.getTime()} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ),
          },
        ]}
      />

      <MeTabs
        sections={[
          {
            id: "recent-tasks",
            label: "Recent tasks",
            content: (
              <>
                <h2>Recent tasks</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Poster</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTasks.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <Link href={`/open-work/${t.id}`}>{t.title}</Link>
                        </td>
                        <td>{TYPE_LABEL[t.type]}</td>
                        <td>{humanizeEnum(t.status)}</td>
                        <td>
                          <LocationDisplay
                            latitude={t.latitude}
                            longitude={t.longitude}
                            country={t.country}
                            city={t.city}
                          />
                        </td>
                        <td>
                          <Link href={`/u/${t.poster.username}`}><code>{t.poster.username}</code></Link>
                        </td>
                        <td><FormattedDateTime ts={t.createdAt.getTime()} /></td>
                        <td>
                          <span className="row gap-xs">
                            <CopyIdButton id={t.id} />
                            <AdminTaskDelete taskId={t.id} title={t.title} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ),
          },
          {
            id: "archived-tasks",
            label: "Archived tasks",
            badge: archivedTasks.length || undefined,
            content: (
              <>
                <h2>Archived tasks ({archivedTasks.length})</h2>
                <p className="muted">
                  Finalized, cancelled, purged, or past-deadline tasks. Hidden from the public marketplace
                  and visible only here (participants can still see their own).
                </p>
                {archivedTasks.length === 0 && <p className="muted">None.</p>}
                {archivedTasks.length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Location</th>
                        <th>Deadline</th>
                        <th>Poster</th>
                        <th>Created</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedTasks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <Link href={`/open-work/${t.id}`}>{t.title}</Link>
                          </td>
                          <td>{TYPE_LABEL[t.type]}</td>
                          <td>{humanizeEnum(t.status)}</td>
                          <td>
                            <LocationDisplay
                              latitude={t.latitude}
                              longitude={t.longitude}
                              country={t.country}
                              city={t.city}
                            />
                          </td>
                          <td>{t.deadlineAt ? <FormattedDateTime ts={t.deadlineAt.getTime()} /> : "-"}</td>
                          <td>
                            <code>{t.poster.username}</code>
                          </td>
                          <td><FormattedDateTime ts={t.createdAt.getTime()} /></td>
                          <td>
                            <span className="row gap-xs">
                              <CopyIdButton id={t.id} />
                              <AdminTaskDelete taskId={t.id} title={t.title} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ),
          },
          {
            id: "testing",
            label: "Testing",
            content: (
              <>
                <h2>AI mock test suite</h2>
                <p className="muted">
                  Exercise the AI ↔ human delegation flow end-to-end against the
                  live API. Hits all run through the configured{" "}
                  <code>TEST_AI_*</code> keypair (signed) or your admin cookie.
                  Dev / staging only - never enable in production.
                </p>
                <AdminTestSuite
                  testAiUsername={process.env.TEST_AI_USERNAME || "test_ai"}
                  testAiPubkey={process.env.TEST_AI_PUBKEY ?? null}
                />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
