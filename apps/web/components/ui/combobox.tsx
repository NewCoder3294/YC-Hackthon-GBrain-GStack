"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchable?: boolean;
  emptyLabel?: string;
  className?: string;
  triggerLabel?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Any",
  searchable = true,
  emptyLabel = "No match",
  className,
  triggerLabel,
}: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `[data-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIdx];
      if (opt) {
        onChange(opt.value);
        close();
      }
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={triggerLabel}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
        className="flex h-8 w-full min-w-[8rem] items-center justify-between gap-2 border border-neutral-200 bg-white px-2 font-mono text-xs hover:border-neutral-700 focus:border-black focus:outline-none data-[open=true]:border-black"
        data-open={open}
      >
        <span className={selected ? "text-black" : "text-neutral-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[max(100%,14rem)] border border-black bg-white shadow-[0_1px_0_#000]">
          {searchable && (
            <div className="border-b border-neutral-200 p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search…"
                className="h-7 w-full border border-neutral-200 bg-white px-2 font-mono text-xs placeholder:text-neutral-300 focus:border-black focus:outline-none"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
                {emptyLabel}
              </li>
            ) : (
              filtered.map((opt, idx) => {
                const isActive = idx === activeIdx;
                const isSelected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    data-idx={idx}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => {
                      onChange(opt.value);
                      close();
                    }}
                    className={`flex cursor-pointer items-center justify-between px-3 py-1.5 font-mono text-xs ${
                      isActive ? "bg-black text-white" : "text-black"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <span
                        aria-hidden
                        className={`font-mono text-[10px] uppercase tracking-widest ${
                          isActive ? "text-white" : "text-neutral-500"
                        }`}
                      >
                        ✓
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      className={`text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}
