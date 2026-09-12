"use client";

import { TOGGLE_BUTTON, TOGGLE_OFF, TOGGLE_ON } from "./toggle-group";

/**
 * Single-select toggles, for the dashboard's filter. `ToggleGroup` is multi-select
 * with an "All" button, which is the wrong shape for "10 or 20 or 50".
 *
 * `aria-pressed` rather than a `radiogroup`: these read as a row of toggle buttons,
 * and it matches the idiom `ToggleGroup` already established.
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-1 ${className}`}>
      <span className="mr-0.5 text-[11px] tracking-wider text-faint uppercase">{label}</span>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`${TOGGLE_BUTTON} ${option.value === value ? TOGGLE_ON : TOGGLE_OFF}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
