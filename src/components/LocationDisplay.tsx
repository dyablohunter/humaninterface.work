import * as React from "react";
import { MapPin } from "lucide-react";
import { countryName } from "@/lib/countries";

/**
 * Renders a task's location in one of three forms, in priority order:
 *
 *   1. Coordinates  → "37.7749, -122.4194" rendered as a Google Maps link.
 *      Both latitude and longitude must be numbers.
 *   2. Country (+ optional city) → "City, Country Name". Plain text.
 *   3. Fallback     → "Remote".
 *
 * When coords AND country/city are both present, coords win for display
 * (they're more precise); country/city remain on the data side for filtering.
 *
 * Server-renderable: no hooks, no client-only APIs. Accepts null | undefined
 * on every data prop for caller ergonomics.
 */
export function LocationDisplay({
  latitude,
  longitude,
  country,
  city,
  precision = 4,
  className,
  iconSize,
  showIcon = false,
}: {
  latitude?: number | null;
  longitude?: number | null;
  country?: string | null;
  city?: string | null;
  /** Decimal places used in the displayed coord string. Default 4. */
  precision?: number;
  className?: string;
  /** CSS size for the optional MapPin icon, e.g. "0.9em". */
  iconSize?: string;
  /** If true, prefixes a lucide MapPin icon. */
  showIcon?: boolean;
}): React.ReactNode {
  const hasCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  let body: React.ReactNode;
  if (hasCoords) {
    // Raw values in the URL so the pin lands exactly where the AI specified;
    // rounded values only in the visible label.
    const lat = latitude as number;
    const lng = longitude as number;
    const label = `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
    const href = `https://www.google.com/maps?q=${lat},${lng}`;
    // When coords AND country are both set, append the country (and optional
    // city) for human-readable context — coords alone are ambiguous to a reader.
    const contextName = country ? (countryName(country) ?? country) : null;
    const contextText = contextName
      ? city
        ? `${city}, ${contextName}`
        : contextName
      : null;
    const coordsLink = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in Google Maps"
      >
        {label}
      </a>
    );
    body = contextText ? (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
        {coordsLink}
        <span className="muted" style={{ fontSize: "0.85em" }}>{contextText}</span>
      </span>
    ) : (
      coordsLink
    );
  } else if (country) {
    const name = countryName(country) ?? country;
    const text = city ? `${city}, ${name}` : name;
    body = <span>{text}</span>;
  } else {
    body = <span>Remote</span>;
  }

  if (!showIcon) {
    return className ? <span className={className}>{body}</span> : body;
  }

  const iconStyle: React.CSSProperties | undefined = iconSize
    ? { width: iconSize, height: iconSize }
    : undefined;
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "flex-start", gap: "0.3em" }}
    >
      <MapPin style={iconStyle} aria-hidden="true" />
      {body}
    </span>
  );
}
