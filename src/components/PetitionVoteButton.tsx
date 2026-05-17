"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowBigUp } from "lucide-react";

interface Props {
  petitionId: string;
  votes: number;
  voted: boolean;
  /** Disabled when the viewer can't vote (not a logged-in human, or closed). */
  disabled?: boolean;
  disabledReason?: string;
}

export function PetitionVoteButton({
  petitionId,
  votes,
  voted,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState({ votes, voted });
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/petitions/${petitionId}/vote`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setState({ votes: data.votes, voted: data.voted });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={state.voted ? "btn-primary inline-flex" : "btn inline-flex"}
      onClick={toggle}
      disabled={disabled || busy}
      title={disabled ? disabledReason : state.voted ? "Remove your vote" : "Vote in support"}
    >
      <ArrowBigUp size={18} aria-hidden />
      {state.votes} {state.votes === 1 ? "vote" : "votes"}
    </button>
  );
}
