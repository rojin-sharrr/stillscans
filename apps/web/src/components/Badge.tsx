import { RATINGS } from "@stillscans/providers";
import type { ProviderRating } from "@stillscans/shared";

/** A rating is always glyph + label + color, never color alone. */
export function Badge({ rating, prefix = "" }: { rating: ProviderRating; prefix?: string }) {
  const { label, glyph } = RATINGS[rating];
  return (
    <span class={`badge tone-${rating}`}>
      <span aria-hidden="true" class="badge__glyph">
        {glyph}
      </span>
      {prefix}
      {label}
    </span>
  );
}
