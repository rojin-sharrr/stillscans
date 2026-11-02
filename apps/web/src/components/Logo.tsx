export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="25" height="25" rx="7" stroke="#0E1116" stroke-width="3" />
      <rect x="7" y="7" width="14" height="14" rx="3.5" fill="#0E1116" />
      <path
        d="M10.4 14.2l2.5 2.5 4.7-5.2"
        stroke="#FAFAF7"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
