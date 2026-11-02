import { type Provider, RATINGS } from "@stillscans/providers";
import type { ProviderRating } from "@stillscans/shared";
import { useMemo, useState } from "preact/hooks";
import { formatDate, NOT_VERIFIED } from "../lib/format";
import { Badge } from "./Badge";

type RatingFilter = ProviderRating | "all";
type SortKey = "name" | "rating" | "verified";

const CHIPS: RatingFilter[] = ["all", "keeps", "limited", "stops", "unknown"];
const HEADS: { label: string; sort: SortKey | null; width: string }[] = [
  { label: "Provider", sort: "name", width: "24%" },
  { label: "Redirect domains", sort: null, width: "18%" },
  { label: "Free option", sort: null, width: "18%" },
  { label: "When you stop paying", sort: "rating", width: "28%" },
  { label: "Last verified", sort: "verified", width: "12%" },
];

const sortValue: Record<SortKey, (p: Provider) => string | number> = {
  name: (p) => p.name.toLowerCase(),
  rating: (p) => RATINGS[p.rating].order,
  verified: (p) => p.verified ?? "0",
};

function subtitle(p: Provider): string {
  return p.parent ? `${p.site} · part of ${p.parent}` : p.site;
}

function Unverifiable({ value, mono }: { value: string | null; mono?: boolean }) {
  if (!value) return <span class="unverified">{NOT_VERIFIED}</span>;
  return mono ? <span class="mono">{value}</span> : value;
}

/**
 * Filtering runs on the client over a server-rendered list, so every provider
 * is in the HTML for crawlers. Both layouts render; CSS picks one per screen size.
 */
export function ProviderDirectory({ providers }: { providers: Provider[] }) {
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<RatingFilter>("all");
  const [free, setFree] = useState("any");
  const [customDomain, setCustomDomain] = useState("any");
  const [sort, setSort] = useState<SortKey>("name");
  const [direction, setDirection] = useState(1);

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter(
      (p) =>
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.site.includes(q) ||
          p.domains.some((domain) => domain.includes(q))) &&
        (free === "any" || p.freeKind === free) &&
        (customDomain === "any" || p.customDomain === true),
    );
  }, [providers, query, free, customDomain]);

  const rows = useMemo(() => {
    const key = sortValue[sort];
    // "Newest first" is the natural first click on a date column.
    const factor = sort === "verified" ? -direction : direction;
    return base
      .filter((p) => rating === "all" || p.rating === rating)
      .sort((a, b) => {
        const x = key(a);
        const y = key(b);
        return (x > y ? 1 : x < y ? -1 : 0) * factor;
      });
  }, [base, rating, sort, direction]);

  const reset = () => {
    setQuery("");
    setRating("all");
    setFree("any");
    setCustomDomain("any");
  };

  const toggleSort = (key: SortKey) => {
    setDirection(sort === key ? -direction : 1);
    setSort(key);
  };

  return (
    <>
      <div class="filters">
        <div class="filters__row">
          <div class="search">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5B6170"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <label for="ss-q" class="sr-only">
              Search providers
            </label>
            <input
              id="ss-q"
              class="input"
              value={query}
              placeholder="Search by name or domain, e.g. qrco.de"
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <div class="filters__selects">
            <label>
              <span class="sr-only">Free option</span>
              <select value={free} onChange={(event) => setFree(event.currentTarget.value)}>
                <option value="any">Any free option</option>
                <option value="plan">Free plan</option>
                <option value="trial">Trial only</option>
              </select>
            </label>
            <label>
              <span class="sr-only">Custom domain</span>
              <select
                value={customDomain}
                onChange={(event) => setCustomDomain(event.currentTarget.value)}
              >
                <option value="any">Any domain setup</option>
                <option value="yes">Custom domain</option>
              </select>
            </label>
          </div>
        </div>
        <div role="group" aria-label="Filter by what happens when you stop paying" class="chips">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              class={chip === "all" ? "chip" : `chip tone-${chip}`}
              aria-pressed={rating === chip}
              onClick={() => setRating(chip)}
            >
              <span aria-hidden="true" class="chip__glyph">
                {chip === "all" ? "•" : RATINGS[chip].glyph}
              </span>
              {chip === "all" ? "All" : RATINGS[chip].label}
              <span class="chip__count">
                {chip === "all" ? base.length : base.filter((p) => p.rating === chip).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div class="count" aria-live="polite">
        {rows.length === 1 ? "1 provider" : `${rows.length} providers`}
      </div>

      {rows.length === 0 && (
        <div class="card empty">
          <div class="empty__title">No providers match</div>
          <p>
            Custom domain support hasn't been verified for most providers yet. Clear a filter, or
            check your code directly below.
          </p>
          <button type="button" class="btn btn-secondary" onClick={reset}>
            Clear filters
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <ul class="provider-cards only-compact">
          {rows.map((p) => (
            <li class="card" key={p.slug}>
              <div class="provider-card__head">
                <div>
                  <h2>
                    <a href={`/providers/${p.slug}`}>{p.name}</a>
                  </h2>
                  <div class="micro muted">{subtitle(p)}</div>
                </div>
                <Badge rating={p.rating} />
              </div>
              <p class="body-15 pretty">{p.policy}</p>
              <dl>
                <div>
                  <dt>Redirect domains</dt>
                  <dd class="mono">
                    <Unverifiable value={p.domains.join(", ") || null} />
                  </dd>
                </div>
                <div>
                  <dt>Free option</dt>
                  <dd>
                    <Unverifiable value={p.free} />
                  </dd>
                </div>
              </dl>
              <div class="provider-cards__foot">
                <span>Last verified: {formatDate(p.verified)}</span>
                <a href={`/providers/${p.slug}`}>Details</a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div class="card table-wrap only-desktop">
          <table class="provider-table">
            <thead>
              <tr>
                {HEADS.map((head) => {
                  const active = head.sort === sort;
                  const ascending = direction === 1;
                  return (
                    <th
                      key={head.label}
                      scope="col"
                      style={{ width: head.width }}
                      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
                    >
                      {head.sort ? (
                        <button
                          type="button"
                          class={active ? "is-active" : undefined}
                          onClick={() => head.sort && toggleSort(head.sort)}
                        >
                          {head.label}
                          <span aria-hidden="true">{active ? (ascending ? "↑" : "↓") : "↕"}</span>
                        </button>
                      ) : (
                        <span>{head.label}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.slug}>
                  <td>
                    <a href={`/providers/${p.slug}`}>{p.name}</a>
                    <div class="micro muted">{subtitle(p)}</div>
                  </td>
                  <td class="domains">
                    <Unverifiable value={p.domains.join(", ") || null} />
                  </td>
                  <td>
                    <Unverifiable value={p.free} />
                  </td>
                  <td>
                    <Badge rating={p.rating} />
                    <div class="policy">{p.policy}</div>
                  </td>
                  <td class="verified">{formatDate(p.verified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
