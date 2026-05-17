import { humanizeEnum } from "@/lib/tier-ui";

interface EvidenceItem {
  id: string;
  type: "TEXT" | "IMAGE" | "VIDEO";
  bodyText: string | null;
  transcodedAt: string | null;
  mimePrimary: string | null;
  mimeFallback: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="muted">No evidence yet.</p>;
  }
  return (
    <div className="stack">
      {items.map((e) => {
        if (e.type === "TEXT") {
          return (
            <div key={e.id} className="card">
              <p className="muted" style={{ fontSize: "0.85em", marginBottom: "0.5rem" }}>
                Text
              </p>
              <pre style={{ whiteSpace: "pre-wrap", border: "none", padding: 0, margin: 0 }}>
                {e.bodyText}
              </pre>
            </div>
          );
        }
        if (!e.transcodedAt) {
          return (
            <div key={e.id} className="card">
              <p className="muted" style={{ margin: 0, fontSize: "0.9em" }}>
                {humanizeEnum(e.type)} · transcoding…
              </p>
            </div>
          );
        }
        if (e.type === "IMAGE") {
          return (
            <div key={e.id} className="card">
              <picture>
                <source srcSet={`/api/v1/evidence/${e.id}`} type={e.mimePrimary ?? undefined} />
                <img
                  src={`/api/v1/evidence/${e.id}?fallback=true`}
                  alt=""
                  loading="lazy"
                  style={{ maxWidth: "100%", height: "auto", display: "block" }}
                  width={e.width ?? undefined}
                  height={e.height ?? undefined}
                />
              </picture>
            </div>
          );
        }
        // VIDEO
        return (
          <div key={e.id} className="card">
            <video
              controls
              preload="metadata"
              style={{ width: "100%", height: "auto" }}
              poster={undefined}
            >
              <source src={`/api/v1/evidence/${e.id}`} type={e.mimePrimary ?? "video/mp4"} />
              <source
                src={`/api/v1/evidence/${e.id}?fallback=true`}
                type={e.mimeFallback ?? "video/webm"}
              />
              Your browser doesn&apos;t support video playback.
            </video>
            {e.durationSec != null && (
              <p className="muted" style={{ fontSize: "0.85em", marginTop: "0.5rem", marginBottom: 0 }}>
                {e.durationSec}s
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
