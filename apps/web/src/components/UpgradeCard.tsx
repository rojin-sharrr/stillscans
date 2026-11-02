import { WaitlistForm } from "./WaitlistForm";

/** What a free account sees in place of full analytics: its total, and what Pro adds. */
export function UpgradeCard({ totalScans = 0 }: { totalScans?: number }) {
  return (
    <section class="card upgrade" aria-labelledby="ss-upgrade">
      <div class="upgrade__stat">
        <div class="stat__label">Total scans</div>
        <div class="stat__value">{totalScans.toLocaleString("en-US")}</div>
      </div>
      <div class="upgrade__copy">
        <h2 id="ss-upgrade" class="h3">
          See when, where and on what device
        </h2>
        <p class="body-15 muted pretty">
          Full analytics is part of Pro, which is coming soon. Your codes keep working either way.
        </p>
        <WaitlistForm plan="pro" label="Notify me (lock in $19)" />
      </div>
    </section>
  );
}
