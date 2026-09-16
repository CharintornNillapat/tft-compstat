import { championRef, type NameBook } from "@/lib/static/names";
import type { CompStat } from "@/lib/stats/types";
import { ChampionIcon } from "./champion-icon";

const pct = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The comps you actually play, ranked by how often (architecture §6.3).
 *
 * `table-fixed` with narrow numeric columns rather than the `min-w` + horizontal
 * scroller it used to have: the three figures are 2-4 characters, so pinning them
 * lets the comp label take the rest and truncate, and the table fits a 400px phone
 * without a scroll container of its own. Its columns match `MeCuratedComps` so the
 * two tables line up when they sit one above the other.
 */
export function MeFavoriteComps({ comps, names }: { comps: readonly CompStat[]; names: NameBook }) {
  return (
    <div className="rounded-md border border-line bg-panel">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-b border-line text-left text-[11px] tracking-wider whitespace-nowrap text-faint uppercase">
            <th scope="col" className="px-2 py-1.5 font-medium sm:px-3">Comp</th>
            <th scope="col" className="w-14 px-1 py-1.5 text-right font-medium sm:w-16 sm:px-3">Games</th>
            <th scope="col" className="w-12 px-1 py-1.5 text-right font-medium sm:w-16 sm:px-3">Avg</th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right font-medium sm:px-3">Top 4</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {comps.map((comp) => {
            // The key encodes `carry|traits`, so the carry is the part before the pipe.
            const carryApiName = comp.compKey.split("|")[0] || null;
            const carry = carryApiName ? championRef(names, carryApiName) : null;
            return (
              <tr key={comp.compKey}>
                <th scope="row" className="px-2 py-1.5 text-left font-normal sm:px-3">
                  <span className="flex items-center gap-2">
                    {carry && <ChampionIcon name={carry.name} cost={carry.cost} iconUrl={carry.iconUrl} size={24} alt="" />}
                    <span className="truncate">{comp.label}</span>
                  </span>
                </th>
                <td className="px-1 py-1.5 text-right tabular-nums sm:px-3">{comp.games}</td>
                <td className="px-1 py-1.5 text-right tabular-nums sm:px-3">{comp.avgPlacement.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums sm:px-3">{pct(comp.top4Rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
