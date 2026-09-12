import { championRef, itemRef, type NameBook } from "@/lib/static/names";
import { ChampionIcon } from "./champion-icon";
import { ItemIcon } from "./item-icon";

/**
 * A carry with its items — the visual shorthand for "what comp was this?", shared
 * by the match history, the favorite comps table and the `/` glance panel.
 */
export function CarryCell({
  carryUnit,
  items,
  names,
  size = 32,
}: {
  carryUnit: string | null;
  items: readonly string[];
  names: NameBook;
  size?: number;
}) {
  if (!carryUnit) {
    // An 8th-place bust-out had no itemized unit at all. Say so rather than leaving a gap.
    return <span className="text-faint">no carry</span>;
  }

  const carry = championRef(names, carryUnit);

  return (
    <span className="flex shrink-0 items-center gap-1">
      <ChampionIcon name={carry.name} cost={carry.cost} iconUrl={carry.iconUrl} size={size} />
      <span className="flex gap-0.5">
        {items.map((apiName, i) => {
          const item = itemRef(names, apiName);
          return <ItemIcon key={`${apiName}-${i}`} name={item.name} iconUrl={item.iconUrl} size={Math.round(size / 2)} />;
        })}
      </span>
    </span>
  );
}
