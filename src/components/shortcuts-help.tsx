"use client";

import { useEffect, useRef, useState } from "react";
import { NAV_ITEMS } from "./nav-tabs";

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleToggle = () => setOpen((prev) => !prev);
    window.addEventListener("toggle-shortcuts-help", handleToggle);
    return () => window.removeEventListener("toggle-shortcuts-help", handleToggle);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Keyboard shortcuts (?)"
        className="flex h-7 items-center gap-1.5 rounded border border-line/70 bg-raised/40 px-2 text-xs text-muted transition-colors hover:border-line hover:bg-raised hover:text-fg"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4" />
        </svg>
        <span className="hidden md:inline">Shortcuts</span>
        <kbd
          aria-hidden="true"
          className="rounded border border-line/80 bg-panel px-1 py-px font-mono text-[9px] text-faint"
        >
          ?
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-line bg-raised p-3 shadow-xl shadow-black/60 sm:w-80"
        >
          <div className="flex items-center justify-between border-b border-line pb-2">
            <h2 className="text-xs font-semibold tracking-wide text-fg uppercase">Keyboard Shortcuts</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close shortcuts dialog"
              className="rounded p-0.5 text-faint hover:bg-panel hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-2.5 space-y-3 text-xs">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">Navigation</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {NAV_ITEMS.map((item, idx) => (
                  <div key={item.href} className="flex items-center justify-between gap-1 py-0.5">
                    <span className="truncate text-muted">{item.label}</span>
                    <kbd className="shrink-0 rounded border border-line/80 bg-panel px-1.5 py-px font-mono text-[10px] font-semibold text-fg">
                      {idx + 1}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-line/60 pt-2">
              <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">Global Actions</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-muted">Focus search box (Comps, BIS, Augments)</span>
                  <kbd className="shrink-0 rounded border border-line/80 bg-panel px-1.5 py-px font-mono text-[10px] font-semibold text-fg">
                    /
                  </kbd>
                </div>
                <div className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-muted">Toggle shortcut cheatsheet</span>
                  <kbd className="shrink-0 rounded border border-line/80 bg-panel px-1.5 py-px font-mono text-[10px] font-semibold text-fg">
                    ?
                  </kbd>
                </div>
                <div className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-muted">Close tooltips, menus & modals</span>
                  <kbd className="shrink-0 rounded border border-line/80 bg-panel px-1.5 py-px font-mono text-[10px] font-semibold text-fg">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
