export interface Stat {
  label: string;
  value: string;
}

/** A row of headline numbers, used at the top of signed-in pages. */
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div class="stats app-stats">
      {stats.map((stat) => (
        <div class="card stat" key={stat.label}>
          <div class="stat__label">{stat.label}</div>
          <div class="stat__value">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
