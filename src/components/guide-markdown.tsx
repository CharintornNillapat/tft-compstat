import Markdown from "react-markdown";

/**
 * A comp's `guide` markdown, or one section of it. Raw HTML in the source is not
 * rendered, and headings shift down so they sit under the page's own headings.
 */
export function GuideMarkdown({ markdown, className = "" }: { markdown: string; className?: string }) {
  return (
    <div className={`guide leading-relaxed ${className}`}>
      <Markdown components={{ h1: "h3", h2: "h3", h3: "h4", h4: "h5" }}>{markdown}</Markdown>
    </div>
  );
}
