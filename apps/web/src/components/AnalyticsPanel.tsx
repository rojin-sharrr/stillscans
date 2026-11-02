import { ANALYTICS_RANGES, type AnalyticsResponse } from "@stillscans/shared";
import { useEffect, useRef, useState } from "preact/hooks";
import { countryName, deviceName, placeName, systemName, timeAgo } from "../lib/analytics-copy";
import { ApiRequestError, fetchAnalytics } from "../lib/api";
import { ScansChart } from "./ScansChart";

const RANGE_LABELS: Record<number, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days",
  365: "1 year",
};

interface BarRow {
  key: string;
  label: string;
  value: number;
}

function BarList({ rows }: { rows: BarRow[] }) {
  if (rows.length === 0) return <p class="small muted">No scans yet.</p>;
  const peak = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul class="bars">
      {rows.map((row) => (
        <li key={row.key} title={`${row.label}: ${row.value}`}>
          <div class="bars__text">
            <span>{row.label}</span>
            <b>{row.value.toLocaleString("en-US")}</b>
          </div>
          <div class="bars__track" aria-hidden="true">
            <div class="bars__fill" style={{ width: `${(row.value / peak) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  /** Scopes every figure to one code. Without it, the panel covers all codes. */
  codeId?: string;
  onUnauthorized: () => void;
}

/** Filters sit in one row and scope everything below, so all the numbers always agree. */
export function AnalyticsPanel({ codeId, onUnauthorized }: Props) {
  const [days, setDays] = useState(30);
  const [device, setDevice] = useState("");
  const [country, setCountry] = useState("");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const countries = useRef<string[]>([]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    fetchAnalytics({ days, device, country, codeId })
      .then((response) => {
        if (!current) return;
        // Keep every option listed while one country is selected.
        if (!country) {
          countries.current = response.byCountry.flatMap((row) => (row.key ? [row.key] : []));
        }
        setData(response);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!current) return;
        if (error instanceof ApiRequestError && error.status === 401) onUnauthorized();
        else setFailed(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [days, device, country, codeId, onUnauthorized]);

  const topPlace = data?.byLocation[0];

  return (
    <section aria-labelledby="ss-analytics" class="analytics">
      <h2 id="ss-analytics" class="h2">
        Scans
      </h2>
      <div class="analytics__filters">
        <div class="segmented segmented--compact" role="group" aria-label="Date range">
          {ANALYTICS_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={days === range}
              onClick={() => setDays(range)}
            >
              {RANGE_LABELS[range]}
            </button>
          ))}
        </div>
        <label>
          <span class="sr-only">Device</span>
          <select value={device} onChange={(event) => setDevice(event.currentTarget.value)}>
            <option value="">All devices</option>
            <option value="mobile">Phones and tablets</option>
            <option value="desktop">Computers</option>
          </select>
        </label>
        <label>
          <span class="sr-only">Country</span>
          <select value={country} onChange={(event) => setCountry(event.currentTarget.value)}>
            <option value="">All countries</option>
            {countries.current.map((code) => (
              <option key={code} value={code}>
                {countryName(code)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {failed && (
        <p class="form-error" role="alert">
          We couldn't load your scans. Refresh to try again.
        </p>
      )}

      {data && (
        <div class={loading ? "analytics__body is-loading" : "analytics__body"}>
          <div class="stats">
            <div class="card stat">
              <div class="stat__label">Scans</div>
              <div class="stat__value">{data.totals.scans.toLocaleString("en-US")}</div>
            </div>
            <div class="card stat">
              <div class="stat__label">Estimated visitors</div>
              <div class="stat__value">{data.totals.visitors.toLocaleString("en-US")}</div>
              <div class="stat__note">Someone returning on another day counts again.</div>
            </div>
            <div class="card stat">
              <div class="stat__label">Top place</div>
              <div class="stat__value stat__value--text">
                {topPlace ? placeName(topPlace) : "None yet"}
              </div>
            </div>
          </div>

          <section class="card card-24">
            <h3 class="h3">Scans per day</h3>
            <p class="micro muted">Days are in UTC.</p>
            <ScansChart days={data.byDay} />
          </section>

          <div class="breakdowns">
            {!codeId && (
              <section class="card card-24">
                <h3 class="h3">By placement</h3>
                <BarList
                  rows={data.byCode.map((row) => ({
                    key: row.id,
                    label: row.label ?? `stillscans.net/${row.shortCode}`,
                    value: row.scans,
                  }))}
                />
              </section>
            )}
            <section class="card card-24">
              <h3 class="h3">By place</h3>
              <BarList
                rows={data.byLocation.map((row) => ({
                  key: `${row.city}-${row.region}-${row.country}`,
                  label: placeName(row),
                  value: row.scans,
                }))}
              />
            </section>
            <section class="card card-24">
              <h3 class="h3">By device</h3>
              <BarList
                rows={data.byOs.map((row) => ({
                  key: row.key ?? "other",
                  label: systemName(row.key),
                  value: row.scans,
                }))}
              />
            </section>
          </div>

          <section class="card card-24">
            <h3 class="h3">Recent scans</h3>
            <p class="small muted pretty">
              Scans are anonymous. You can see how many, where and on what device, but never who.
            </p>
            {data.recent.length === 0 ? (
              <p class="small muted" style={{ marginTop: "12px" }}>
                No scans yet.
              </p>
            ) : (
              <ul class="recent">
                {data.recent.map((scan) => (
                  <li key={`${scan.scannedAt}-${scan.shortCode}`}>
                    <span>
                      {placeName(scan)} · {deviceName(scan.deviceType)}
                      {!codeId && <span class="muted"> · {scan.label ?? scan.shortCode}</span>}
                    </span>
                    <span class="muted">{timeAgo(scan.scannedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
