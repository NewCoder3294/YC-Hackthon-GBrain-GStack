"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export interface CockpitWidget {
  /** Stable id for layout persistence. */
  id: string;
  /** Human-readable name for the visibility menu. */
  label: string;
  /** Rendered panel (server-rendered children are fine). */
  node: ReactNode;
  /**
   * Column span in the 2-column grid. 2 = full row, 1 = half. Defaults to
   * 1. Persisted in localStorage so users can override per widget.
   */
  defaultSpan?: 1 | 2;
}

interface Props {
  widgets: CockpitWidget[];
  /** localStorage key. Bump to invalidate persisted layouts. */
  storageKey?: string;
}

interface Layout {
  order: string[];
  hidden: string[];
}

const DEFAULT_KEY = "cockpit-layout-v4";

function readLayout(key: string, fallback: Layout): Layout {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Layout>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order : fallback.order,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : fallback.hidden,
    };
  } catch {
    return fallback;
  }
}

function reconcile(layout: Layout, widgets: CockpitWidget[]): Layout {
  const ids = widgets.map((w) => w.id);
  const known = new Set(ids);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of layout.order) {
    if (known.has(id) && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) order.push(id);
  }
  const hidden = layout.hidden.filter((id) => known.has(id));
  return { order, hidden };
}

export function CockpitWidgetHost({ widgets, storageKey = DEFAULT_KEY }: Props) {
  const defaults = useMemo<Layout>(
    () => ({ order: widgets.map((w) => w.id), hidden: [] }),
    [widgets],
  );
  // SSR: start from defaults; hydrate from localStorage after mount so the
  // server-rendered shell matches first paint, then layout adjusts.
  const [layout, setLayout] = useState<Layout>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    setLayout(reconcile(readLayout(storageKey, defaults), widgets));
    setHydrated(true);
  }, [storageKey, defaults, widgets]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // localStorage may be unavailable (private mode / quota); harmless.
    }
  }, [hydrated, layout, storageKey]);

  const byId = useMemo(() => {
    const m = new Map<string, CockpitWidget>();
    for (const w of widgets) m.set(w.id, w);
    return m;
  }, [widgets]);

  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden]);

  const visible = useMemo(
    () => layout.order.filter((id) => !hiddenSet.has(id) && byId.has(id)),
    [layout.order, hiddenSet, byId],
  );

  const move = useCallback((srcId: string, dstId: string) => {
    setLayout((cur) => {
      if (srcId === dstId) return cur;
      const order = [...cur.order];
      const from = order.indexOf(srcId);
      const to = order.indexOf(dstId);
      if (from === -1 || to === -1) return cur;
      order.splice(from, 1);
      order.splice(to, 0, srcId);
      return { ...cur, order };
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setLayout((cur) => {
      const hidden = new Set(cur.hidden);
      if (hidden.has(id)) hidden.delete(id);
      else hidden.add(id);
      return { ...cur, hidden: Array.from(hidden) };
    });
  }, []);

  const reset = useCallback(() => setLayout(defaults), [defaults]);

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-l border-neutral-300 bg-neutral-200 lg:w-[560px]">
      <CockpitHeader
        widgets={widgets}
        hidden={hiddenSet}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((v) => !v)}
        onToggle={toggle}
        onReset={reset}
      />
      <div
        className="grid gap-1.5 p-1.5"
        style={{
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gridAutoFlow: "row dense",
        }}
      >
        {visible.length === 0 ? (
          <p className="col-span-2 border border-dashed border-neutral-300 bg-white px-3 py-12 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            all widgets hidden · open the menu to enable
          </p>
        ) : (
          visible.map((id) => {
            const w = byId.get(id);
            if (!w) return null;
            const isDragging = dragging === id;
            const isTarget = dropTarget === id && dragging !== null && dragging !== id;
            const span = w.defaultSpan ?? 1;
            return (
              <WidgetFrame
                key={id}
                id={id}
                label={w.label}
                span={span}
                dragging={isDragging}
                dropTarget={isTarget}
                onDragStart={() => setDragging(id)}
                onDragEnter={() => setDropTarget(id)}
                onDragEnd={() => {
                  setDragging(null);
                  setDropTarget(null);
                }}
                onDrop={(srcId) => {
                  move(srcId, id);
                  setDragging(null);
                  setDropTarget(null);
                }}
                onHide={() => toggle(id)}
              >
                {w.node}
              </WidgetFrame>
            );
          })
        )}
      </div>
    </aside>
  );
}

interface HeaderProps {
  widgets: CockpitWidget[];
  hidden: Set<string>;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onToggle: (id: string) => void;
  onReset: () => void;
}

function CockpitHeader({
  widgets,
  hidden,
  menuOpen,
  onMenuToggle,
  onToggle,
  onReset,
}: HeaderProps) {
  const visibleCount = widgets.length - hidden.size;
  return (
    <div className="sticky top-0 z-10 flex flex-col border-b border-neutral-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2">
        <h1 className="font-mono text-[10px] uppercase tracking-widest">
          Cockpit
        </h1>
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          <span>
            {visibleCount}/{widgets.length}
          </span>
          <button
            onClick={onMenuToggle}
            className={cn(
              "border px-2 py-0.5 transition-colors",
              menuOpen
                ? "border-black bg-black text-white"
                : "border-neutral-200 text-neutral-600 hover:border-black hover:text-black",
            )}
          >
            {menuOpen ? "Close" : "Widgets"}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="border-t border-neutral-200 px-3 py-2">
          <ul className="grid grid-cols-1 gap-1">
            {widgets.map((w) => {
              const on = !hidden.has(w.id);
              return (
                <li key={w.id}>
                  <button
                    onClick={() => onToggle(w.id)}
                    className={cn(
                      "flex w-full items-center justify-between border px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                      on
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-black hover:text-black",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5",
                          on ? "bg-white" : "bg-neutral-300",
                        )}
                      />
                      {w.label}
                    </span>
                    <span className="text-[9px]">{on ? "on" : "off"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            onClick={onReset}
            className="mt-2 w-full border border-neutral-200 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
          >
            Reset layout
          </button>
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-neutral-400">
            Drag the ⋮⋮ handle on a widget header to reorder. Layout persists
            in this browser only.
          </p>
        </div>
      )}
    </div>
  );
}

interface FrameProps {
  id: string;
  label: string;
  span: 1 | 2;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: (srcId: string) => void;
  onHide: () => void;
  children: ReactNode;
}

function WidgetFrame({
  id,
  label,
  span,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onHide,
  children,
}: FrameProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={ref}
      className={cn(
        "group/widget relative flex flex-col border border-neutral-400 bg-white transition-opacity",
        span === 2 && "col-span-2",
        dragging && "opacity-40",
        dropTarget && "ring-2 ring-black ring-offset-0",
      )}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => onDragEnter()}
      onDrop={(e) => {
        e.preventDefault();
        const srcId = e.dataTransfer.getData("text/plain");
        if (srcId) onDrop(srcId);
      }}
    >
      {/* Hover-revealed control strip — drag grip + hide button. Lives in
          the top-right corner so existing panel headers stay untouched. */}
      <div className="pointer-events-none absolute right-1 top-1 z-20 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/widget:opacity-100">
        <button
          aria-label={`Drag ${label} to reorder`}
          title="Drag to reorder"
          className="pointer-events-auto cursor-grab border border-neutral-200 bg-white px-1 font-mono text-[10px] text-neutral-500 hover:border-black hover:text-black active:cursor-grabbing"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          ⋮⋮
        </button>
        <button
          aria-label={`Hide ${label}`}
          title="Hide widget"
          onClick={onHide}
          className="pointer-events-auto border border-neutral-200 bg-white px-1 font-mono text-[10px] text-neutral-500 hover:border-black hover:text-black"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}
