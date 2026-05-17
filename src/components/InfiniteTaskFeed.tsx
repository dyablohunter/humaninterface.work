"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORY_LABEL, fmtUsdt } from "@/lib/pricing";
import { Countdown } from "@/components/Countdown";
import { tierTint, urgencyTint, TYPE_LABEL, URGENCY_LABEL } from "@/lib/tier-ui";
import { LocationDisplay } from "@/components/LocationDisplay";
import type { Category, TaskType, Urgency } from "@prisma/client";

export interface FeedTask {
  id: string;
  title: string;
  type: TaskType;
  category: Category;
  urgency: Urgency;
  status: string;
  slotCount: number;
  slotsOpen: number;
  estimatedMinutes: number;
  statedPriceUsdt: number;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  biddingClosesAt: number | null;
  poster: string;
  lowestBidUsdt: number | null;
  bidCount: number;
}

interface Props {
  initialTasks: FeedTask[];
  total: number;
  pageSize: number;
  view: "grid" | "table";
  /** Query string carrying all the active filters (status, category, etc.) without `page` / `pageSize` / `view`. */
  queryString: string;
}

/**
 * Infinite-scroll feed for /open-work. Server passes the first page of tasks;
 * this component appends subsequent pages as the sentinel approaches the
 * viewport (IntersectionObserver, 400px rootMargin).
 *
 * Page size differs by view: 20 in grid, 50 in table — set server-side and
 * passed in.
 */
export function InfiniteTaskFeed({ initialTasks, total, pageSize, view, queryString }: Props) {
  const [tasks, setTasks] = useState<FeedTask[]>(initialTasks);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasMore = tasks.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(queryString);
      qs.set("page", String(page + 1));
      qs.set("pageSize", String(pageSize));
      const res = await fetch(`/api/v1/tasks?${qs.toString()}`);
      if (!res.ok) {
        setError("load_failed");
        return;
      }
      const data = (await res.json()) as { tasks: FeedTask[] };
      setTasks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const fresh = data.tasks.filter((t) => !seen.has(t.id));
        return [...prev, ...fresh];
      });
      setPage((p) => p + 1);
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, queryString, page, pageSize]);

  // IntersectionObserver-driven loader.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  return (
    <>
      {view === "table" ? (
        <div style={{ overflowX: "auto" }}>
          <table className="work-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Urgency</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Stated</th>
                <th style={{ textAlign: "right" }}>Lowest bid</th>
                <th>Slots</th>
                <th>Location</th>
                <th>Bidding closes</th>
                <th>Poster</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                return (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/open-work/${t.id}`}>{t.title}</Link>
                    </td>
                    <td>{TYPE_LABEL[t.type]}</td>
                    <td style={{ color: urgencyTint(t.urgency) }}>{URGENCY_LABEL[t.urgency]}</td>
                    <td>{CATEGORY_LABEL[t.category]}</td>
                    <td style={{ textAlign: "right" }}>{fmtUsdt(t.statedPriceUsdt)} USDT</td>
                    <td style={{ textAlign: "right" }}>
                      {t.lowestBidUsdt != null ? `${fmtUsdt(t.lowestBidUsdt)} USDT` : <span className="muted">—</span>}
                    </td>
                    <td>{t.slotsOpen}/{t.slotCount}</td>
                    <td>
                      <LocationDisplay
                        latitude={t.latitude}
                        longitude={t.longitude}
                        country={t.country}
                        city={t.city}
                      />
                    </td>
                    <td>
                      {t.biddingClosesAt ? (
                        t.biddingClosesAt > Date.now() ? (
                          <Countdown target={t.biddingClosesAt} />
                        ) : (
                          <span className="muted">closed</span>
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td><code>{t.poster}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="work-grid">
          {tasks.map((t) => {
            const tint = tierTint(t.type);
            return (
              <Link
                key={t.id}
                href={`/open-work/${t.id}`}
                className="card work-card"
                style={{ borderColor: tint.border }}
              >
                <div
                  className="work-card-price"
                  style={{ background: tint.bg, borderRight: `1px solid ${tint.border}` }}
                >
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, lineHeight: 1.1, color: tint.fg }}>
                    {fmtUsdt(t.statedPriceUsdt)} USDT
                  </div>
                  {t.lowestBidUsdt != null ? (
                    <div style={{ fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.2, color: tint.fg }}>
                      {fmtUsdt(t.lowestBidUsdt)} USDT
                      <span className="muted" style={{ fontSize: "0.72rem", fontWeight: 500, display: "block" }}>
                        lowest bid · {t.bidCount} bid{t.bidCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: "0.72rem" }}>no bids yet</div>
                  )}
                </div>
                <div className="work-card-body">
                  <h3 style={{ marginTop: 0, marginBottom: "0.4rem", color: tint.fg }}>{t.title}</h3>
                  <div className="card-tags">
                    <span className="tag">{TYPE_LABEL[t.type]}</span>
                    <span className="tag" style={{ color: urgencyTint(t.urgency), borderColor: urgencyTint(t.urgency) }}>
                      {URGENCY_LABEL[t.urgency]}
                    </span>
                    <span className="tag">{CATEGORY_LABEL[t.category]}</span>
                    <span className="tag">{t.estimatedMinutes} min</span>
                    {t.status === "FAIRNESS_FLAGGED" && <span className="tag">Fairness flagged</span>}
                    {t.status === "PAUSED" && <span className="tag">Paused</span>}
                    <LocationDisplay
                      latitude={t.latitude}
                      longitude={t.longitude}
                      country={t.country}
                      city={t.city}
                      className="tag"
                      showIcon
                      iconSize="0.9em"
                    />
                  </div>
                  <p className="muted" style={{ marginBottom: 0, fontSize: "0.7rem" }}>
                    {t.slotsOpen} open of {t.slotCount} slot{t.slotCount === 1 ? "" : "s"} · posted by{" "}
                    <code>{t.poster}</code>
                    {t.biddingClosesAt && (
                      <>
                        {" · "}
                        {t.biddingClosesAt > Date.now() ? (
                          <>bidding <Countdown target={t.biddingClosesAt} className="cd-bold" /></>
                        ) : (
                          <span>Bidding closed</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} style={{ padding: "1.5rem 0", textAlign: "center" }}>
          <span className="muted text-sm">{loading ? "Loading more…" : "Scroll for more"}</span>
        </div>
      )}
      {error && (
        <p className="error" style={{ textAlign: "center" }}>
          Failed to load more. <button type="button" className="btn btn-mini" onClick={loadMore}>Retry</button>
        </p>
      )}
      {!hasMore && tasks.length > 0 && (
        <p className="muted text-sm" style={{ textAlign: "center", marginTop: "1.5rem" }}>
          End of results — {tasks.length} of {total} shown.
        </p>
      )}
    </>
  );
}
