import Markdown from "react-markdown";

/**
 * A comp's `guide` markdown. Raw HTML in the source is not rendered, and headings
 * shift down so they sit under the page's own "Guide" heading.
 */
export function GuideMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="guide max-w-prose leading-relaxed text-muted">
      <Markdown components={{ h1: "h3", h2: "h3", h3: "h4", h4: "h5" }}>{markdown}</Markdown>
    </div>
  );
}
