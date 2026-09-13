/**
 * A comp guide's markdown, split into the labelled blocks every guide is written in
 * (architecture §9): `**Early:** …`, `**Levelling:** …`, `**Items**, in order: …`,
 * `**Positioning:** …`. The comp page renders each block as a card with its label as a
 * chip, which reads faster from a second monitor than paragraphs of prose.
 *
 * Pure and client-safe. Null when the guide has no label at all, so the caller renders
 * it as plain markdown rather than one card called "Tips".
 */

export type GuideSection = {
  /** The bold lead-in as written ("Early", "Positioning"), or `UNLABELLED`. */
  label: string;
  /** Early, Mid, Late and Levelling happen in order during a game; the rest is reference. */
  kind: "stage" | "reference";
  /** The block's markdown without its label. May be empty. */
  body: string;
};

export type GuideOutline = {
  sections: GuideSection[];
  /** A closing all-italic block, such as the generated guides' source note. */
  footnote: string | null;
};

/** The label for paragraphs written without one, like a closing piece of advice. */
export const UNLABELLED = "Tips";

// A short capitalised word or phrase in bold, with its colon inside or after the bold
// (`**Early:**`, `**Items**:`) or a comma after it (`**Items**, in the order…`). The
// shape is strict so a sentence that merely opens in bold (`**Don't** slam…`) is prose.
const LABEL = /^\*\*([A-Z][A-Za-z0-9 &/-]{0,23}?)(?::\*\*|\*\*\s*[:,])\s*/;
const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s/;
const FOOTNOTE = /^(?:_(?!_)[\s\S]*[^_]_|\*(?!\*)[\s\S]*[^*]\*)$/;
const STAGE = /^(?:early|mid|late|level+ing)\b/i;

export function splitGuide(markdown: string): GuideOutline | null {
  const blocks = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const last = blocks.at(-1);
  const footnote = last !== undefined && FOOTNOTE.test(last) ? last : null;
  if (footnote !== null) blocks.pop();

  const sections: GuideSection[] = [];
  for (const block of blocks) {
    const match = LABEL.exec(block);
    if (match) {
      const label = match[1]!.trim();
      sections.push({
        label,
        kind: STAGE.test(label) ? "stage" : "reference",
        // With the label gone, "**Early:** the most-played opener…" starts mid-sentence.
        body: block.slice(match[0].length).replace(/^[a-z]/, (letter) => letter.toUpperCase()),
      });
      continue;
    }
    const previous = sections.at(-1);
    // A list continues the block above it, and loose paragraphs in a row are one tip.
    if (previous && (LIST_ITEM.test(block) || previous.label === UNLABELLED)) {
      previous.body = previous.body ? `${previous.body}\n\n${block}` : block;
      continue;
    }
    sections.push({ label: UNLABELLED, kind: "reference", body: block });
  }

  return sections.some((section) => section.label !== UNLABELLED) ? { sections, footnote } : null;
}
