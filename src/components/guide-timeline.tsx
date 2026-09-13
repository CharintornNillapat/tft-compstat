import { splitGuide } from "@/lib/curated/guide-sections";
import { GuideMarkdown } from "./guide-markdown";

/**
 * A comp's guide as a column of cards, one per labelled block (`splitGuide`), each
 * under a stage chip. The chips share one accent tint rather than a hue per stage:
 * every hue on this page already means something (architecture §9), so the word says
 * which stage it is and the rail dot says what kind — filled for the stages a game
 * moves through (Early, Mid, Late, Levelling), hollow for reference (Positioning, Tips).
 *
 * `omit` drops sections by label, such as Items while the page shows the item builds.
 * A guide written without labels renders as plain markdown.
 */
export function GuideTimeline({ markdown, omit = [] }: { markdown: string; omit?: readonly string[] }) {
  const outline = splitGuide(markdown);
  if (!outline) return <GuideMarkdown markdown={markdown} className="text-muted" />;
  const sections = outline.sections.filter((section) => !omit.includes(section.label));

  return (
    <>
      <ol className="space-y-2">
        {sections.map((section, i) => (
          <li key={`${section.label}-${i}`} className="relative pl-5">
            {/* Dot centre to the next dot's centre: 18px down, across the 8px gap. */}
            {i < sections.length - 1 ? (
              <span aria-hidden className="absolute top-[18px] -bottom-[26px] left-[5px] w-px bg-line" />
            ) : null}
            <span
              aria-hidden
              className={`absolute top-3 left-0 size-[11px] rounded-full ${
                section.kind === "stage" ? "bg-accent" : "bg-panel ring-1 ring-accent/60 ring-inset"
              }`}
            />
            <div className="rounded-md border border-line bg-raised/40 px-2.5 py-2">
              <h3 className="inline-flex rounded-sm border border-accent/40 bg-accent/10 px-1.5 text-[10px] leading-4 font-semibold tracking-wider text-accent uppercase">
                {section.label}
              </h3>
              {section.body ? <GuideMarkdown markdown={section.body} className="mt-1 text-fg/85" /> : null}
            </div>
          </li>
        ))}
      </ol>
      {outline.footnote ? (
        <GuideMarkdown markdown={outline.footnote} className="mt-2 text-[11px] leading-snug text-faint" />
      ) : null}
    </>
  );
}
