"use client";

import { useEffect } from "react";

/** Marks `html[data-hydrated]` while the page is interactive: view-url.ts waits for it before it
    writes the address, and the e2e specs wait for it instead of guessing from network idle. */
export function HydratedMark() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);
  return null;
}
