import { championRef, type NameBook } from "@/lib/static/names";
import type { CompStat } from "@/lib/stats/types";
import { ChampionIcon } from "./champion-icon";

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** The comps you actually play, ranked by how often (architecture §6.3). */
export function MeFavoriteComps({ comps, names }: { comps: readonly CompStat[]; names: NameBook }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-panel">
      <table className="w-full min-w-[26rem] border-collapse">
        <thead>
          <tr className="border-b border-line text-left text-[11px] tracking-wider text-faint uppercase">
            <th scope="col" className="px-3 py-1.5 font-medium">Comp</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Games</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Avg</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Top 4</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {comps.map((comp) => {
            // The key encodes `carry|traits`, so the carry is the part before the pipe.
            const carryApiName = comp.compKey.split("|")[0] || null;
            const carry = carryApiName ? championRef(names, carryApiName) : null;
            return (
              <tr key={comp.compKey}>
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    {carry && <ChampionIcon name={carry.name} cost={carry.cost} iconUrl={carry.iconUrl} size={24} alt="" />}
                    <span className="truncate">{comp.label}</span>
                  </span>
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">{comp.games}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{comp.avgPlacement.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pct(comp.top4Rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
