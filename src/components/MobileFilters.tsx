"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface Ctx {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const MobileFiltersContext = createContext<Ctx | null>(null);

export function MobileFiltersProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileFiltersContext.Provider
      value={{
        open,
        toggle: () => setOpen((o) => !o),
        close: () => setOpen(false),
      }}
    >
      {children}
    </MobileFiltersContext.Provider>
  );
}

export function useMobileFilters(): Ctx {
  const ctx = useContext(MobileFiltersContext);
  if (!ctx) {
    // Safe fallback if a consumer renders outside the provider.
    return { open: false, toggle: () => {}, close: () => {} };
  }
  return ctx;
}
