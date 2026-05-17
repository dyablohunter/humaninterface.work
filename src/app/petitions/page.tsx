import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { PetitionForm } from "@/components/PetitionForm";
import { PetitionVoteButton } from "@/components/PetitionVoteButton";
import { humanizeEnum } from "@/lib/tier-ui";
import { eligibleSupporterCounts, votesNeeded, isEligibleVoter } from "@/lib/petitions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Petitions",
  description:
    "Humans propose and vote on changes to the platform and protocol. A petition with 51% support from active contributors is submitted to the admin.",
  alternates: { canonical: "/petitions" },
  openGraph: {
    type: "website",
    url: "/petitions",
    title: "Petitions - Human Interface",
    description:
      "Humans propose and vote on changes to humaninterface.work and its protocol.",
  },
  twitter: {
    title: "Petitions - Human Interface",
    description:
      "Humans propose and vote on changes to humaninterface.work and its protocol.",
  },
};

export default async function PetitionsPage() {
  const session = await getSession();
  const viewer = session
    ? await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, role: true, isAdmin: true },
      })
    : null;
  const isHuman = Boolean(viewer && viewer.role === "HUMAN" && !viewer.isAdmin);
  const viewerEligible = isHuman ? await isEligibleVoter(viewer!.id) : false;

  const petitions = await prisma.petition.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: {
      author: { select: { username: true } },
      _count: { select: { votes: true } },
      votes: {
        where: { userId: viewer?.id ?? "__no_viewer__" },
        select: { id: true },
      },
    },
  });

  const { electorate, supporters } = await eligibleSupporterCounts(
    petitions.map((p) => p.id),
  );
  const needed = votesNeeded(electorate);

  const open = petitions
    .filter((p) => p.status === "OPEN")
    .sort(
      (a, b) => (supporters.get(b.id) ?? 0) - (supporters.get(a.id) ?? 0),
    );
  // QUALIFIED first (with the admin), then admin-resolved petitions.
  const review = petitions.filter((p) => p.status === "QUALIFIED");
  const resolved = petitions.filter(
    (p) => p.status !== "OPEN" && p.status !== "QUALIFIED",
  );

  function disabledReason(status: string): string | undefined {
    if (status !== "OPEN") return "Voting is closed for this petition";
    if (!viewer) return "Sign in as a human to vote";
    if (!isHuman) return "Only humans vote on petitions";
    if (!viewerEligible)
      return "Voting needs ≥1 completed task and activity in the last 30 days";
    return undefined;
  }

  function row(p: (typeof petitions)[number]) {
    const voted = p.votes.length > 0;
    const sup = supporters.get(p.id) ?? 0;
    return (
      <div key={p.id} className="card">
        <div className="card-row">
          <div className="card-row-main">
            <h3 className="petition-title">{p.title}</h3>
            <p className="muted text-sm mb-sm">
              by <code>{p.author.username}</code> · {p.createdAt.toLocaleDateString()}
              {p.status !== "OPEN" && (
                <>
                  {" · "}
                  <span className="tag">{humanizeEnum(p.status)}</span>
                </>
              )}
            </p>
            <p className="petition-body">{p.body}</p>
            {p.status === "OPEN" ? (
              <p className="muted text-sm m-0">
                <strong>{sup}</strong> of <strong>{needed || "-"}</strong> needed
                {electorate > 0 && <> · 51% of {electorate} active contributors</>}
              </p>
            ) : p.status === "QUALIFIED" ? (
              <p className="muted text-sm m-0">
                Reached the threshold - submitted to the admin for review
                {p.qualifiedAt && <> on {p.qualifiedAt.toLocaleDateString()}</>}.
              </p>
            ) : null}
          </div>
          <PetitionVoteButton
            petitionId={p.id}
            votes={p._count.votes}
            voted={voted}
            disabled={p.status !== "OPEN" || !viewerEligible}
            disabledReason={disabledReason(p.status)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <h1>Petitions</h1>
      <p className="muted">
        Propose changes to the platform, the protocol, pricing - anything - and vote
        on what others have raised. A petition reaching{" "}
        <strong>51% support from active contributors</strong> (humans with ≥1
        completed task, seen in the last 30 days) is automatically submitted to the
        admin for review.
      </p>

      {isHuman ? (
        <>
          <PetitionForm />
          {!viewerEligible && (
            <p className="muted text-md">
              You can raise a petition, but voting requires at least one completed
              task and activity within the last 30 days.
            </p>
          )}
        </>
      ) : (
        <p className="muted">
          {viewer ? (
            "Petitions are raised and voted on by humans."
          ) : (
            <>
              <Link href="/login">Sign in</Link> as a human to raise or vote on
              petitions.
            </>
          )}
        </p>
      )}

      <h2 className="mt-xl">Open ({open.length})</h2>
      {open.length === 0 && <p className="muted">No open petitions yet.</p>}
      <div className="stack">{open.map(row)}</div>

      {review.length > 0 && (
        <>
          <h2 className="mt-xl">With the admin ({review.length})</h2>
          <p className="muted">Reached 51% - submitted for review.</p>
          <div className="stack">{review.map(row)}</div>
        </>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="mt-xl">Resolved ({resolved.length})</h2>
          <div className="stack">{resolved.map(row)}</div>
        </>
      )}
    </>
  );
}
