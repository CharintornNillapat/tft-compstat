"use client";

import { useEffect, useState } from "react";

type Status = "idle" | "copied" | "failed";

const RESET_MS = 2000;

/**
 * Copies a comp's Team Planner code (architecture §9, `curated/team-code.ts`). The
 * clipboard API needs a secure context and focus; where it is refused, a hidden
 * textarea copy is tried, and if that fails too the code is shown selectable so it
 * can still be copied by hand.
 */
export function CopyTeamCodeButton({ code, hint }: { code: string; hint: string }) {
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), RESET_MS);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    setStatus((await writeClipboard(code)) ? "copied" : "failed");
  }

  const copied = status === "copied";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        title={hint}
        aria-label={copied ? "Team code copied" : "Copy team code for the TFT Team Planner"}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded border px-2.5 text-[13px] transition-colors sm:min-h-8 ${
          copied ? "border-emerald-700 text-emerald-300" : "border-line bg-panel text-fg hover:border-zinc-600"
        } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400`}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
        {copied ? "Copied!" : "Copy team code"}
      </button>
      <span aria-live="polite" className="min-w-0 text-muted">
        {status === "failed" ? (
          <>
            Copy blocked — select:{" "}
            <code className="break-all text-fg select-all">{code}</code>
          </>
        ) : copied ? (
          <span className="sr-only">Team code copied to the clipboard</span>
        ) : null}
      </span>
    </div>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Insecure context, denied permission or no focus: fall back to a selection copy.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ClipboardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
