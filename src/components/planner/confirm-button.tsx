"use client";

import { useEffect, useState } from "react";
import { TOGGLE_BUTTON, TOGGLE_OFF } from "../toggle-group";

const DISARM_MS = 4000;

/**
 * A button that asks once before a destructive action: the first press turns it into
 * "Confirm …", a second press within four seconds acts. No modal, so it works the same
 * by mouse, touch and keyboard. With `needsConfirm` false it acts on the first press.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  needsConfirm = true,
  disabled = false,
  title,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  needsConfirm?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), DISARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => {
        if (needsConfirm && !armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      onBlur={() => setArmed(false)}
      className={`${TOGGLE_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 ${
        armed ? "border-nerf/60 bg-nerf/10 text-nerf" : TOGGLE_OFF
      }`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
