"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CategoryEntry = { code: string; label: string; group: string };

interface Props {
  initialBio: string;
  initialCategories: string[];
  catalog: CategoryEntry[];
}

export function ProfileEditor({ initialBio, initialCategories, catalog }: Props) {
  const router = useRouter();
  const [bio, setBio] = useState(initialBio);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialCategories));
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, CategoryEntry[]> = {};
    for (const c of catalog) {
      if (filter && !c.label.toLowerCase().includes(filter.toLowerCase())) continue;
      groups[c.group] ??= [];
      groups[c.group].push(c);
    }
    return groups;
  }, [catalog, filter]);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bio: bio || null,
          categories: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "save_failed");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {savedAt && <div className="success">Saved.</div>}

      <label>
        <span>Bio (optional, shown on your public profile)</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} />
      </label>

      <div>
        <h3 style={{ marginBottom: "0.25rem" }}>Categories you offer ({selected.size})</h3>
        <p className="muted" style={{ fontSize: "0.9em", marginTop: 0 }}>
          Pick the categories you can do at a paid, professional level. Filter by name to find them faster.
        </p>
        <input
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {Object.entries(grouped).map(([group, items]) => (
          <details key={group} open={!!filter || items.some((i) => selected.has(i.code))}>
            <summary style={{ cursor: "pointer", padding: "0.5rem 0", fontWeight: 600 }}>
              {prettyGroup(group)} ({items.filter((i) => selected.has(i.code)).length}/{items.length})
            </summary>
            <div style={{ paddingLeft: "1rem" }}>
              {items.map((c) => (
                <label
                  key={c.code}
                  style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem", fontWeight: 400 }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.code)}
                    onChange={() => toggle(c.code)}
                    style={{ width: "auto", minHeight: 0 }}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
      </div>

      <button onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}

function prettyGroup(group: string): string {
  return group
    .toLowerCase()
    .split("_")
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(" ");
}
