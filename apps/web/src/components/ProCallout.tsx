import { WaitlistForm } from "./WaitlistForm";

const FEATURES = ["When your codes get scanned", "Cities and regions", "Phones and devices"];

/** What Pro adds, shown to free accounts. Kept apart from the numbers they already have. */
export function ProCallout({ email }: { email: string }) {
  return (
    <section class="card pro-callout" aria-labelledby="ss-pro">
      <div class="pro-callout__copy">
        <div class="pro-callout__head">
          <h2 id="ss-pro" class="h3">
            See the full picture with Pro
          </h2>
          <span class="plan__tag">Coming soon</span>
        </div>
        <ul class="plan__list pro-callout__list">
          {FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
      <div class="pro-callout__action">
        <WaitlistForm plan="pro" label="Notify me (lock in $19)" initialEmail={email} inline />
      </div>
    </section>
  );
}
