import type { Code } from "../lib/api";

const STATUS: Record<Code["status"], { label: string; glyph: string; tone: string }> = {
  active: { label: "Active", glyph: "✓", tone: "safe" },
  paused: { label: "Paused", glyph: "‖", tone: "unknown" },
  archived: { label: "Archived", glyph: "–", tone: "unknown" },
  blocked: { label: "Stopped for safety", glyph: "✕", tone: "dead" },
};

export function CodeStatus({ status }: { status: Code["status"] }) {
  const { label, glyph, tone } = STATUS[status];
  return (
    <span class={`badge tone-${tone}`}>
      <span aria-hidden="true" class="badge__glyph">
        {glyph}
      </span>
      {label}
    </span>
  );
}
