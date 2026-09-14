import { textSourceLabel, type ChampionAbility, type ItemText } from "@/lib/static/tooltip-text";

/**
 * Ability and item text inside the shared `HoverTip` (architecture §9). Each block
 * ends with where its numbers came from: MetaTFT's lookup is a PBE build, and the
 * tooltip must not pass those values off as live.
 */

export function AbilityBlock({ ability }: { ability: ChampionAbility }) {
  return (
    <div className="mt-1.5 border-t border-line pt-1.5">
      <p className="font-medium text-fg">{ability.name}</p>
      <p className="mt-0.5 whitespace-pre-line text-muted">{ability.text}</p>
      <SourceNote source={ability.source} />
    </div>
  );
}

export function ItemTextBlock({ text }: { text: ItemText }) {
  return (
    <div className="mt-1.5 border-t border-line pt-1.5">
      {text.stats ? <p className="font-medium text-fg tabular-nums">{text.stats}</p> : null}
      {text.description ? <p className="mt-0.5 whitespace-pre-line text-muted">{text.description}</p> : null}
      <SourceNote source={text.source} />
    </div>
  );
}

function SourceNote({ source }: { source: string | null }) {
  const label = textSourceLabel(source);
  return label ? <p className="mt-1 text-[10px] text-faint">{label}</p> : null;
}
