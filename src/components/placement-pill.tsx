import { ordinal, placementBand, PLACEMENT_PILL } from "./placement-styles";

const SIZES = { sm: "h-5 w-5 text-[11px]", md: "h-6 w-6" } as const;

/**
 * A placement as a coloured square (architecture §9). The digit is always printed,
 * so colour is never the only channel carrying the information.
 */
export function PlacementPill({
  placement,
  size = "md",
  emphasis = false,
  className = "",
}: {
  placement: number;
  size?: keyof typeof SIZES;
  /** Rings the pill — used for "most recent game". */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-label={ordinal(placement)}
      className={`grid shrink-0 place-items-center rounded font-semibold tabular-nums ${SIZES[size]} ${
        PLACEMENT_PILL[placementBand(placement)]
      } ${emphasis ? "ring-1 ring-fg/40" : ""} ${className}`}
    >
      {placement}
    </span>
  );
}
