import { useState } from 'react';

/** 48×28 switch. Track fill-2 off / accent on; 24px thumb stretches to 28px while pressed. */
export const Switch = ({ checked, onChange, label, id }) => {
  const [pressed, setPressed] = useState(false);
  const thumbW = pressed ? 28 : 24;
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ease-ease
        before:absolute before:-inset-2 before:content-['']
        ${checked ? 'bg-accent' : 'bg-fill-2'}`}
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 h-6 rounded-full bg-white transition-[left,width] duration-[350ms] ease-spring-soft"
        style={{
          width: thumbW,
          left: checked ? 48 - 2 - thumbW : 2,
          boxShadow: '0 1px 2px rgba(8,32,79,.16), 0 3px 8px -2px rgba(8,32,79,.2)',
        }}
      />
    </button>
  );
};
