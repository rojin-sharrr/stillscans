import { useEffect, useRef, useState } from "preact/hooks";
import { axisMax } from "../lib/analytics-copy";
import { formatDate } from "../lib/format";

const HEIGHT = 240;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 40 };

interface Props {
  days: { day: string; scans: number }[];
}

/**
 * One series over time, so a titled line with no legend. Hover and keyboard both
 * snap to the nearest day, and the table below carries every value without a pointer.
 */
export function ScansChart({ days }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  const count = days.length;
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const { max, step } = axisMax(Math.max(...days.map((day) => day.scans), 0));

  const x = (index: number) =>
    MARGIN.left + (count > 1 ? (index / (count - 1)) * plotWidth : plotWidth / 2);
  const y = (value: number) => MARGIN.top + plotHeight - (value / max) * plotHeight;

  const line = days.map((day, index) => `${index ? "L" : "M"}${x(index)} ${y(day.scans)}`).join("");
  const baseline = y(0);
  const area = `${line}L${x(count - 1)} ${baseline}L${x(0)} ${baseline}Z`;

  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step);
  const labelEvery = Math.ceil(count / Math.max(Math.floor(plotWidth / 90), 2));
  const lastIndex = count - 1;

  const nearest = (clientX: number) => {
    const bounds = frame.current?.getBoundingClientRect();
    if (!bounds || count < 2) return 0;
    const ratio = (clientX - bounds.left - MARGIN.left) / plotWidth;
    return Math.min(Math.max(Math.round(ratio * lastIndex), 0), lastIndex);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const change = event.key === "ArrowRight" ? 1 : -1;
    setActive((current) => Math.min(Math.max((current ?? lastIndex) + change, 0), lastIndex));
  };

  const point = active === null ? null : days[active];
  const total = days.reduce((sum, day) => sum + day.scans, 0);
  const last = days[lastIndex];

  return (
    <div>
      <div
        ref={frame}
        class="chart"
        role="img"
        aria-label={`Scans per day. ${total} scans over ${count} days. Use the left and right arrow keys to read each day.`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys read each day's value.
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive(lastIndex)}
        onBlur={() => setActive(null)}
        onPointerMove={(event) => setActive(nearest(event.clientX))}
        onPointerLeave={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                class="chart__grid"
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                class="chart__tick"
                x={MARGIN.left - 8}
                y={y(tick)}
                text-anchor="end"
                dominant-baseline="middle"
              >
                {tick.toLocaleString("en-US")}
              </text>
            </g>
          ))}
          {days.map((day, index) =>
            index % labelEvery === 0 ? (
              <text
                key={day.day}
                class="chart__tick"
                x={x(index)}
                y={HEIGHT - 8}
                text-anchor={index === 0 ? "start" : "middle"}
              >
                {formatDate(day.day).replace(/, \d+$/, "")}
              </text>
            ) : null,
          )}
          <path class="chart__area" d={area} />
          <path class="chart__line" d={line} />
          {last && <circle class="chart__dot" cx={x(lastIndex)} cy={y(last.scans)} r="4" />}
          {point && active !== null && (
            <>
              <line
                class="chart__crosshair"
                x1={x(active)}
                x2={x(active)}
                y1={MARGIN.top}
                y2={baseline}
              />
              <circle class="chart__dot" cx={x(active)} cy={y(point.scans)} r="4" />
            </>
          )}
        </svg>
        {point && active !== null && (
          <div
            class="chart__tooltip"
            style={{
              left: `${Math.min(x(active) + 12, width - 150)}px`,
              top: `${MARGIN.top}px`,
            }}
          >
            <b>{point.scans.toLocaleString("en-US")}</b> {point.scans === 1 ? "scan" : "scans"}
            <div class="micro muted">{formatDate(point.day)}</div>
          </div>
        )}
      </div>
      <details class="chart__table">
        <summary>View as table</summary>
        <div class="chart__table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Scans</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.day}>
                  <td>{formatDate(day.day)}</td>
                  <td>{day.scans.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
