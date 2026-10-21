/**
 * CampusSign mark: a handwritten loop that flows into a check, written on a signature line ("signed, and it checks
 * out"). The tile takes the theme accent; the stroke is white. Same drawing as public/icon.svg (the favicon).
 */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <path
        d="M6.8 17.6c2.6-.4 4.9-2.1 5-4.2.1-1.9-2-2.4-3-.9-1.5 2.1.6 5.6 3.9 8.6l.9.8L25 9.4"
        fill="none"
        stroke="#fff"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 25h18" stroke="#fff" strokeOpacity={0.45} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

/** Mark + wordmark ("Campus" in ink, "Sign" in the accent). */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className={`flex items-center ${lg ? 'flex-col gap-3' : 'gap-2.5'}`}>
      <LogoMark className={lg ? 'h-14 w-14' : 'h-8 w-8'} />
      <span className={`font-bold tracking-tight ${lg ? 'text-3xl md:text-4xl' : 'text-lg'}`}>
        Campus<span className="text-accent">Sign</span>
      </span>
    </span>
  );
}
