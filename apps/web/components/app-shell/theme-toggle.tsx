"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A tiny ~6px dot in the corner that toggles a `dark` class on the <html>
 * root. globals.css does the heavy lifting (CSS `filter: invert(1)` on the
 * whole document, double-inverted on media). State persists in localStorage.
 *
 * Intentionally subtle — looks like a stray pixel until you hover. The
 * pre-paint script in layout.tsx applies the class before first render,
 * so there's no FOUC on dark-mode reloads.
 */

const STORAGE_KEY = "wd:dark";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Sync from <html> class (which the pre-paint script may have set).
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      const html = document.documentElement;
      if (next) html.classList.add("dark");
      else html.classList.remove("dark");
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore — Safari private mode / blocked storage
      }
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title=""
      className="h-1.5 w-1.5 rounded-full bg-neutral-300 opacity-30 transition hover:opacity-80"
    />
  );
}
