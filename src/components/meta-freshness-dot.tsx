"use client";

import { useEffect, useState } from "react";
import { metaFreshness, type MetaFreshness } from "./meta-freshness";

/**
 * The header pill's sync dot, and the age beside it once the data is stale.
 *
 * The age is computed in the browser because the pill prerenders into the static
 * shell: rendered on the server it would freeze at build time and claim "2h ago"
 * for a week. Before hydration the dot is `unknown` and claims nothing — a green
 * pulse that survives a dead pipeline is exactly the failure this replaces.
 */

const DOT = {
  unknown: { colour: "bg-faint", pulse: false, label: "Meta data freshness unknown" },
  fresh: { colour: "bg-buff", pulse: true, label: "Meta data synced" },
  stale: { colour: "bg-stale", pulse: false, label: "Meta data last synced" },
} as const;

export function MetaFreshnessDot({ updatedAt }: { updatedAt: string | null }) {
  const [freshness, setFreshness] = useState<MetaFreshness>({ state: "unknown", age: null });

  useEffect(() => {
    const tick = () => setFreshness(metaFreshness(updatedAt, Date.now()));
    tick();
    // A second-monitor tab stays open for hours, so the dot has to be able to go stale
    // without a reload.
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [updatedAt]);

  const { colour, pulse, label } = DOT[freshness.state];
  const title = freshness.age ? `${label} ${freshness.age} ago` : label;

  return (
    <>
      <span className="relative flex size-1.5 shrink-0" title={title}>
        {pulse && <span className={`absolute inline-flex size-full animate-ping rounded-full ${colour} opacity-75`} />}
        <span className={`relative inline-flex size-1.5 rounded-full ${colour}`} />
        <span className="sr-only">{title}</span>
      </span>
      {/* Stale is said in words as well as colour: the dot alone is 6px of amber. */}
      {freshness.state === "stale" && freshness.age && (
        <span className="font-medium text-stale tabular-nums">{freshness.age} old</span>
      )}
    </>
  );
}
