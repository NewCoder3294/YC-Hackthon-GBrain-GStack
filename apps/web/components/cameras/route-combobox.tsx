"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label?: string;
}

export function RouteCombobox({ value, options, onChange, label = "Route" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(Math.max(0, filtered.indexOf(value)));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlighted] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  function commit(opt: string) {
    onChange(opt);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlighted];
      if (opt) commit(opt);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-7 min-w-[120px] items-center justify-between gap-2 border bg-white px-2 font-mono text-xs uppercase",
            open ? "border-black" : "border-neutral-200 hover:border-black",
          )}
        >
          <span className="truncate">{value}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={cn("shrink-0 transition-transform", open && "rotate-180")}
          >
            <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>
      </label>

      {open && (
        <div
          role="listbox"
          className="absolute left-[calc(2.5rem+0.5rem)] top-full z-50 mt-1 w-56 border border-black bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.12)]"
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Filter routes…"
            className="h-8 w-full border-b border-neutral-200 px-2 font-mono text-xs placeholder:text-neutral-300 focus:outline-none"
          />
          <div ref={listRef} className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 font-mono text-xs text-neutral-500">No match</div>
            ) : (
              filtered.map((opt, i) => {
                const selected = opt === value;
                const active = i === highlighted;
                return (
                  <button
                    key={opt}
                    type="button"
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => commit(opt)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left font-mono text-xs uppercase",
                      active && "bg-neutral-100",
                      selected && "font-bold",
                    )}
                  >
                    <span>{opt}</span>
                    {selected && (
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path
                          d="M2 5l2 2 4-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
