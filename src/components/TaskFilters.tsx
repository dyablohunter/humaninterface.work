"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useMobileFilters } from "@/components/MobileFilters";

interface Opt {
  value: string;
  label: string;
}

export function TaskFilters({
  categories,
  types,
  urgencies,
  countries,
}: {
  categories: Opt[];
  types: Opt[];
  urgencies: Opt[];
  countries: Opt[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMobileFilters();
  const [isPending, startTransition] = useTransition();

  const category = searchParams.get("category") ?? "ALL";
  const type = searchParams.get("type") ?? "ALL";
  const urgency = searchParams.get("urgency") ?? "ALL";
  const country = (searchParams.get("country") ?? "ALL").toUpperCase();
  const urlQ = searchParams.get("q") ?? "";
  const urlCity = searchParams.get("city") ?? "";

  const [q, setQ] = useState(urlQ);
  const [city, setCity] = useState(urlCity);
  const firstRender = useRef(true);
  const firstCityRender = useRef(true);

  // City input is meaningful only with a real country (not blank, not REMOTE).
  const cityEnabled = country !== "ALL" && country !== "REMOTE";

  // Keep the inputs in sync if the URL changes externally (back/forward).
  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);
  useEffect(() => {
    setCity(urlCity);
  }, [urlCity]);

  // Debounce the free-text search before pushing it to the URL.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = q.trim();
      // Require at least 2 characters; shorter input is treated as no search.
      if (trimmed.length >= 2) next.set("q", trimmed);
      else next.delete("q");
      next.delete("page");
      if (next.toString() === searchParams.toString()) return;
      startTransition(() => {
        router.replace(`/open-work${next.toString() ? `?${next}` : ""}`, { scroll: false });
      });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Debounce the city input (300ms) before pushing it to the URL.
  useEffect(() => {
    if (firstCityRender.current) {
      firstCityRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = city.trim().slice(0, 80);
      if (cityEnabled && trimmed.length >= 1) next.set("city", trimmed);
      else next.delete("city");
      next.delete("page");
      if (next.toString() === searchParams.toString()) return;
      startTransition(() => {
        router.replace(`/open-work${next.toString() ? `?${next}` : ""}`, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, cityEnabled]);

  function update(key: "category" | "type" | "urgency" | "country", value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "ALL") next.delete(key);
    else next.set(key, value);
    // Clearing or switching to "REMOTE" invalidates any city filter.
    if (key === "country" && (value === "ALL" || value === "REMOTE")) {
      next.delete("city");
      setCity("");
    }
    next.delete("page"); // reset pagination on filter change
    startTransition(() => {
      router.replace(`/open-work${next.toString() ? `?${next}` : ""}`, { scroll: false });
    });
  }

  return (
    <div
      className={filters.open ? "filters-wrap open" : "filters-wrap"}
      style={{ marginBottom: "1.5rem", opacity: isPending ? 0.6 : 1, transition: "opacity 0.15s" }}
      aria-busy={isPending}
    >
      <div className="task-filters">
        <label className="tf-search">
          <span>Search</span>
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title and description…"
          />
        </label>
        <label>
          <span>Category</span>
          <select
            name="category"
            value={category}
            onChange={(e) => update("category", e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select name="type" value={type} onChange={(e) => update("type", e.target.value)}>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Urgency</span>
          <select
            name="urgency"
            value={urgency}
            onChange={(e) => update("urgency", e.target.value)}
          >
            {urgencies.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Country</span>
          <select
            name="country"
            value={country}
            onChange={(e) => update("country", e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>City</span>
          <input
            type="text"
            name="city"
            value={city}
            disabled={!cityEnabled}
            maxLength={80}
            placeholder={cityEnabled ? "City name" : "pick a country first"}
            onChange={(e) => setCity(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
