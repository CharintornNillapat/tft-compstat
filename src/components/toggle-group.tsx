/** Shared with `Segmented`, so the two kinds of toggle can never drift apart visually. */
export const TOGGLE_BUTTON = "h-7 min-w-7 rounded border px-2 font-semibold whitespace-nowrap transition-colors";
export const TOGGLE_ON = "border-accent/60 bg-accent/10 text-fg";
export const TOGGLE_OFF = "border-line text-muted hover:text-fg";

const BUTTON = TOGGLE_BUTTON;
const ON = TOGGLE_ON;
const OFF = TOGGLE_OFF;

/** Multi-select toggles plus "All". An empty selection means every option. */
export function ToggleGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  selected: ReadonlySet<T>;
  onChange: (next: ReadonlySet<T>) => void;
}) {
  const toggle = (value: T) => {
    const next = new Set(selected);
    if (!next.delete(value)) next.add(value);
    onChange(next);
  };

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        aria-pressed={selected.size === 0}
        onClick={() => onChange(new Set())}
        className={`${BUTTON} ${selected.size === 0 ? ON : OFF}`}
      >
        All
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected.has(option.value)}
          onClick={() => toggle(option.value)}
          className={`${BUTTON} ${selected.has(option.value) ? ON : OFF}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
