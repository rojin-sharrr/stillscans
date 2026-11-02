import type { CheckProvider, CheckResult } from "@stillscans/shared";
import { useState } from "preact/hooks";
import { checkedAgo, displayUrl, formatDate } from "../lib/format";
import type { ScanDetails } from "../lib/pending-check";
import { PHOTO_TIPS, type ResultView } from "../lib/verdict-copy";
import { Badge } from "./Badge";

const ICON_PATHS = {
  safe: { width: 3, paths: ["M20 6 9 17l-5-5"] },
  risk: { width: 2.6, paths: ["M12 7v6", "M12 17h.01"] },
  dead: { width: 2.8, paths: ["M17 7 7 17", "m7 7 10 10"] },
  error: { width: 2.6, paths: ["M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"] },
};

function VerdictIcon({ verdict }: { verdict: ResultView["verdict"] }) {
  const { width, paths } = ICON_PATHS[verdict];
  return (
    <span aria-hidden="true" class="verdict__icon">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        stroke-width={width}
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

function ProviderCard({ provider }: { provider: CheckProvider }) {
  return (
    <section aria-labelledby="pc-name" class="card card-24">
      <div class="provider-card__head">
        <div>
          <div class="micro muted">
            Provider on file · <span class="mono">{provider.domain}</span>
          </div>
          <h2 id="pc-name" class="h3" style={{ marginTop: "2px" }}>
            {provider.name}
          </h2>
        </div>
        <Badge rating={provider.rating} prefix="When you stop paying: " />
      </div>
      <p class="body-15 pretty" style={{ marginTop: "12px" }}>
        {provider.policy}
      </p>
      <div class="provider-card__meta">
        <span>Last verified: {formatDate(provider.verified)}</span>
        {provider.sourceUrl && (
          <a href={provider.sourceUrl} rel="noopener noreferrer" target="_blank">
            Source
          </a>
        )}
        <a href={`/providers/${provider.slug}`} style={{ fontWeight: 600 }}>
          See full details
        </a>
      </div>
    </section>
  );
}

function UnknownProviderCard({ domain }: { domain: string }) {
  return (
    <section aria-labelledby="pc-unknown" class="card card-24">
      <div class="provider-card__head">
        <h2 id="pc-unknown" class="h3">
          Provider not on file
        </h2>
        <Badge rating="unknown" />
      </div>
      <p class="body-15 pretty" style={{ marginTop: "12px" }}>
        This code uses a redirect service we don't have on file yet (
        <span class="mono small">{domain}</span>). It depends on that service staying active.
      </p>
      <a href={`/report?domain=${encodeURIComponent(domain)}`} class="link-strong">
        Tell us about this provider
      </a>
    </section>
  );
}

function GuaranteeNote() {
  return (
    <div class="panel__note">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#12805C"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <span>If you stop paying, your codes keep working. You only lose editing and analytics.</span>
    </div>
  );
}

interface Props {
  view: ResultView;
  result: CheckResult | null;
  scan: ScanDetails | null;
  onPasteLink?: (url: string) => void;
}

export function ResultScreen({ view, result, scan, onPasteLink }: Props) {
  const [link, setLink] = useState("");
  const { panel, verdict } = view;
  const isError = verdict === "error";
  const scanned = scan?.label ?? (result ? displayUrl(result.input) : "");
  const showProvider = result !== null && (verdict === "risk" || verdict === "dead");

  const submitLink = () => {
    if (link.trim()) onPasteLink?.(link.trim());
  };

  return (
    <>
      <main class="result">
        <a href="/" class="back-link">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Check another code
        </a>
        <div class="result__layout">
          <div class="result__main">
            <section aria-labelledby="verdict" class={`verdict tone-${verdict}`}>
              <div class="verdict__label">
                <VerdictIcon verdict={verdict} />
                <span>{view.label}</span>
              </div>
              <h1 id="verdict" class="h1-result">
                {view.headline}
              </h1>
              <p class="verdict__body">{view.body}</p>
              <div class="verdict__scanned">
                {scan?.thumbnail ? (
                  <img class="qr-thumb qr-thumb--48" src={scan.thumbnail} alt="" />
                ) : (
                  <div class="qr-thumb qr-thumb--48" aria-hidden="true">
                    QR
                  </div>
                )}
                <div>
                  <div class="muted">
                    Checked {result ? checkedAgo(result.createdAt) : "just now"}
                  </div>
                  <div class="mono" style={{ overflowWrap: "anywhere" }}>
                    {scanned}
                  </div>
                </div>
              </div>
            </section>

            <div class="grid-280">
              {view.hops.length > 0 && (
                <section class="card card-24">
                  <h2 class="h3">Where it goes</h2>
                  <ol class="hops">
                    {view.hops.map((hop, index) => (
                      <li key={hop.url}>
                        <div class="hop">
                          <span aria-hidden="true" class={`hop__dot hop__dot--${hop.tone}`} />
                          <div>
                            <div class={hop.plain ? "hop__url is-plain" : "hop__url"}>
                              {hop.url}
                            </div>
                            <div class="hop__note">{hop.note}</div>
                          </div>
                        </div>
                        {index < view.hops.length - 1 && (
                          <div aria-hidden="true" class="hop__arrow">
                            ↓
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {view.facts.length > 0 && (
                <section class="card card-24">
                  <h2 class="h3">Who controls it</h2>
                  <dl class="facts">
                    {view.facts.map((fact) => (
                      <div key={fact.key}>
                        <dt>{fact.key}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {isError && (
                <section class="card card-24">
                  <h2 class="h3">Tips for a clearer photo</h2>
                  <ul class="tips">
                    {PHOTO_TIPS.map((tip, index) => (
                      <li key={tip}>
                        <span class="tips__n">{index + 1}</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {showProvider && result.provider && <ProviderCard provider={result.provider} />}
            {showProvider && result.unknownDomain && (
              <UnknownProviderCard domain={result.unknownDomain} />
            )}
          </div>

          <aside class="result__panel">
            <div class="card panel">
              <div>
                <h2 class="h3" style={{ textWrap: "balance" }}>
                  {panel.title}
                </h2>
                <p class="body-15 muted pretty" style={{ marginTop: "8px" }}>
                  {panel.body}
                </p>
              </div>
              {panel.rows && (
                <dl class="panel__rows">
                  {panel.rows.map((row) => (
                    <div key={row.key}>
                      <dt>{row.key}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {isError ? (
                <>
                  <div class="field">
                    <label for="ss-paste">Link inside the code</label>
                    <input
                      id="ss-paste"
                      class="input input-mono"
                      placeholder="qrfy.com/r/abc"
                      inputMode="url"
                      autoCapitalize="none"
                      spellcheck={false}
                      value={link}
                      onInput={(event) => setLink(event.currentTarget.value)}
                      onKeyDown={(event) => event.key === "Enter" && submitLink()}
                    />
                  </div>
                  <button type="button" class="btn btn-primary" onClick={submitLink}>
                    {panel.primary?.label}
                  </button>
                </>
              ) : (
                panel.primary && (
                  <a class="btn btn-primary" href={panel.primary.href}>
                    {panel.primary.label}
                  </a>
                )
              )}
              {panel.secondary && (
                <div style={{ display: "grid", gap: "8px" }}>
                  <a class="btn btn-secondary" href={panel.secondary.href}>
                    {panel.secondary.label}
                  </a>
                  {panel.secondary.note && <p class="small muted pretty">{panel.secondary.note}</p>}
                </div>
              )}
              {panel.guarantee && <GuaranteeNote />}
              {panel.link && (
                <a class="link-strong" href={panel.link.href}>
                  {panel.link.label}
                </a>
              )}
            </div>
          </aside>
        </div>
      </main>
      {view.bar && (
        <div class="sticky-bar">
          <a class="btn btn-primary" href={view.bar.href}>
            {view.bar.label}
          </a>
        </div>
      )}
    </>
  );
}
