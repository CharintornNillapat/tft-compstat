"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

type Active<T> = { item: T; anchor: HTMLElement };

/**
 * One tooltip shared by many triggers. It opens on mouse hover, keyboard focus or
 * tap, and closes on leave, blur, Escape, scroll or a tap elsewhere. Spread
 * `triggerProps(item)` on each trigger and render `<HoverTip>` while `active`.
 */
export function useHoverTip<T>() {
  const id = useId();
  const [active, setActive] = useState<Active<T> | null>(null);
  const close = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node && active.anchor.contains(event.target))) close();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [active, close]);

  const triggerProps = (item: T) => {
    const show = (event: SyntheticEvent<HTMLElement>) => setActive({ item, anchor: event.currentTarget });
    return {
      "aria-describedby": active?.item === item ? id : undefined,
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse") show(event);
      },
      onPointerLeave: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse") close();
      },
      onFocus: show,
      onBlur: close,
      onClick: show,
    };
  };

  return { id, active, triggerProps };
}

/** Floats above its anchor (below when there's no room), kept inside the viewport. */
export function HoverTip({ id, anchor, children }: { id: string; anchor: HTMLElement; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const target = anchor.getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const top = target.top - gap - height >= margin ? target.top - gap - height : target.bottom + gap;
    const left = Math.min(
      Math.max(target.left + target.width / 2 - width / 2, margin),
      window.innerWidth - width - margin,
    );
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    tip.style.visibility = "visible";
  });

  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={{ visibility: "hidden" }}
      className="pointer-events-none fixed top-0 left-0 z-50 w-max max-w-64 rounded-md border border-line bg-raised px-2.5 py-2 text-xs leading-snug shadow-lg shadow-black/40"
    >
      {children}
    </div>
  );
}
