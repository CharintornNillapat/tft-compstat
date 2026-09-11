import Image from "next/image";
import { COST_BORDER } from "./cost-styles";

/** Champion portrait with a cost-colored border (architecture §9). */
export function ChampionIcon({
  name,
  cost,
  iconUrl,
  size = 40,
  alt = name,
}: {
  name: string;
  cost: number;
  iconUrl: string | null;
  size?: number;
  /** Pass "" when a visible label already names the champion. */
  alt?: string;
}) {
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-md border-2 bg-raised ${COST_BORDER[cost] ?? "border-line"}`}
      style={{ width: size, height: size }}
    >
      {iconUrl ? (
        <Image src={iconUrl} alt={alt} width={size} height={size} className="size-full object-cover" />
      ) : (
        <span
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          className="grid size-full place-items-center text-[10px] font-semibold text-muted"
        >
          {name.slice(0, 2)}
        </span>
      )}
    </span>
  );
}
