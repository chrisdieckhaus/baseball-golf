/** The Daily Dugout infield-diamond mark. Same artwork as src/app/icon.svg. */
export default function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
      <linearGradient id="dd-logo-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#1f5e3b"/>
      <stop offset="1" stopColor="#17402a"/>
      </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#dd-logo-bg)"/>
      <path d="M32 10L54 32L32 54L10 32Z" fill="none" stroke="#f8f5ec" strokeWidth="3.6" strokeLinejoin="round"/>
      <rect x="28.3" y="6.3" width="7.4" height="7.4" rx="1" fill="#f8f5ec" transform="rotate(45 32 10)"/>
      <rect x="50.3" y="28.3" width="7.4" height="7.4" rx="1" fill="#f8f5ec" transform="rotate(45 54 32)"/>
      <rect x="6.3" y="28.3" width="7.4" height="7.4" rx="1" fill="#f8f5ec" transform="rotate(45 10 32)"/>
      <path d="M27 49.5H37V53.5L32 58.5L27 53.5Z" fill="#f8f5ec" stroke="#17402a" strokeWidth="1.2" strokeLinejoin="round"/>
      <circle cx="32" cy="32" r="10.5" fill="#f8f5ec"/>
      <path d="M25.44 23.60C28.85 27.80 28.85 36.20 25.44 40.40" fill="none" stroke="#c8372d" strokeWidth="2.00" strokeLinecap="round"/>
      <path d="M38.56 23.60C35.15 27.80 35.15 36.20 38.56 40.40" fill="none" stroke="#c8372d" strokeWidth="2.00" strokeLinecap="round"/>
    </svg>
  );
}
