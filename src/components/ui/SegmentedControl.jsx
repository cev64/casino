import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Pill track with a raised thumb that slides between options (spring-soft, 350ms).
 * options: [{ value, label, icon? }]
 */
export const SegmentedControl = ({ options, value, onChange, label, className = '', size = 'md' }) => {
  const trackRef = useRef(null);
  const [thumb, setThumb] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = trackRef.current?.querySelector(`[data-value="${CSS.escape(String(value))}"]`);
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [value, options]);

  const h = size === 'sm' ? 'h-9 text-[14px]' : 'h-11 text-[15px]';

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      className={`relative inline-flex p-[3px] rounded-full bg-fill ${className}`}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className="absolute top-[3px] bottom-[3px] rounded-full bg-thumb shadow-thumb transition-[left,width] duration-[350ms] ease-spring-soft"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {options.map((opt) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={opt.value}
            onClick={() => onChange(opt.value)}
            className={`pressable relative z-[1] flex-1 inline-flex items-center justify-center gap-1.5 px-4 rounded-full font-medium whitespace-nowrap
              ${h} ${selected ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
