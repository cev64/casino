/** Monochrome die mark: inherits the text colour. */
export const LogoMark = ({ size = 28, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
    <rect x="3" y="3" width="26" height="26" rx="8" stroke="currentColor" strokeWidth="2" />
    <circle cx="11" cy="11" r="2.2" fill="currentColor" />
    <circle cx="16" cy="16" r="2.2" fill="currentColor" />
    <circle cx="21" cy="21" r="2.2" fill="currentColor" />
  </svg>
);

/** Mark plus wordmark (display face, uppercase). */
export const LogoLockup = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-2.5 text-ink ${className}`}>
    <LogoMark size={30} />
    <span className="font-display font-semibold uppercase text-[22px] leading-6 tracking-[.8px]">Lucky Roll</span>
  </span>
);
