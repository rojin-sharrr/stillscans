import { PLANS } from "@stillscans/shared";
import { useCallback, useEffect, useState } from "preact/hooks";
import {
  type Account,
  ApiRequestError,
  type Code,
  fetchAccount,
  fetchCodes,
  fetchExport,
} from "../lib/api";
import { displayUrl } from "../lib/format";
import { rememberSignedIn } from "../lib/session-hint";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { ProCallout } from "./ProCallout";
import { StatRow } from "./StatRow";
import { CodeStatus } from "./CodeStatus";

function downloadJson(data: unknown): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "stillscans-codes.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function Dashboard() {
  const [account, setAccount] = useState<Account | null>(null);
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [failed, setFailed] = useState(false);

  const onUnauthorized = useCallback(() => {
    rememberSignedIn(false);
    window.location.replace("/sign-in");
  }, []);

  useEffect(() => {
    Promise.all([fetchAccount(), fetchCodes()])
      .then(([me, list]) => {
        rememberSignedIn(true);
        setAccount(me);
        setCodes(list.codes);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiRequestError && error.status === 401) onUnauthorized();
        else setFailed(true);
      });
  }, [onUnauthorized]);

  if (failed) {
    return (
      <main class="narrow">
        <div class="card card-pad" role="alert">
          <h1 class="h3">We couldn't load your dashboard</h1>
          <p class="muted" style={{ marginTop: "8px" }}>
            Your codes are still working. Refresh to try again.
          </p>
        </div>
      </main>
    );
  }
  if (!account || !codes) return null;

  const stats = [
    {
      label: "Total scans",
      value: codes.reduce((sum, code) => sum + (code.scans ?? 0), 0).toLocaleString("en-US"),
    },
    { label: "Codes used", value: `${account.liveCodes} of ${account.codeAllowance}` },
    { label: "Plan", value: PLANS[account.plan].label },
  ];

  return (
    <main class="wrap dashboard">
      <div class="dashboard__head">
        <div>
          <h1 class="h1">Your codes</h1>
          <p class="small muted" style={{ marginTop: "4px" }}>
            {account.email}
          </p>
        </div>
        <div class="dashboard__actions">
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => void fetchExport().then(downloadJson)}
          >
            Export
          </button>
          <a class="btn btn-primary" href="/create">
            Create a code
          </a>
        </div>
      </div>

      <StatRow stats={stats} />

      {codes.length === 0 ? (
        <div class="card empty">
          <div class="empty__title">No codes yet</div>
          <p>Make your first permanent code. It keeps working whether or not you ever pay us.</p>
          <a class="btn btn-primary empty__action" href="/create">
            Create a code
          </a>
        </div>
      ) : (
        <>
          <ul class="code-cards only-compact">
            {codes.map((code) => (
              <li class="card" key={code.id}>
                <div class="provider-card__head">
                  <a class="code-cards__name" href={`/dashboard/codes/${code.id}`}>
                    {code.label ?? "Untitled code"}
                  </a>
                  <CodeStatus status={code.status} />
                </div>
                <div class="mono small">{code.printedLink}</div>
                <div class="mono small muted code-cards__destination">
                  {displayUrl(code.destination)}
                </div>
                <div class="small muted">
                  {(code.scans ?? 0).toLocaleString("en-US")} {code.scans === 1 ? "scan" : "scans"}
                </div>
              </li>
            ))}
          </ul>
          <div class="card table-wrap only-desktop">
            <table class="provider-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span>Name</span>
                  </th>
                  <th scope="col">
                    <span>Printed link</span>
                  </th>
                  <th scope="col">
                    <span>Opens</span>
                  </th>
                  <th scope="col">
                    <span>Scans</span>
                  </th>
                  <th scope="col">
                    <span>Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id}>
                    <td>
                      <a href={`/dashboard/codes/${code.id}`}>{code.label ?? "Untitled code"}</a>
                    </td>
                    <td class="domains">{code.printedLink}</td>
                    <td class="domains code-table__destination">{displayUrl(code.destination)}</td>
                    <td>{(code.scans ?? 0).toLocaleString("en-US")}</td>
                    <td>
                      <CodeStatus status={code.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {account.features.analytics ? (
            <AnalyticsPanel onUnauthorized={onUnauthorized} />
          ) : (
            <ProCallout email={account.email} />
          )}
        </>
      )}
    </main>
  );
}
