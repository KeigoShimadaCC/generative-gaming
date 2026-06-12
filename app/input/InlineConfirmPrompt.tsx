"use client";

import type { PendingConfirm } from "@/store/game-store";

export function InlineConfirmPrompt({
  confirm,
}: {
  readonly confirm: PendingConfirm | null;
}) {
  if (confirm === null) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute bottom-2 left-3 right-3 rounded border border-amber-500/60 bg-black/85 px-3 py-2 text-sm text-amber-100 shadow-lg"
      role="status"
      aria-live="polite"
      data-confirm-prompt="true"
    >
      {confirm.prompt}
    </div>
  );
}
