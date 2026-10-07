import { forwardRef, memo } from 'react';

/**
 * Fluid Glass buttons.
 *  - primary:     solid accent, on-accent label. Use once per view.
 *  - ghost:       fill tone, ink label (everything else).
 *  - destructive: ghost with bad-coloured label.
 *  - plain:       no fill until hover (toolbar / inline actions).
 * size: 'md' (44px) | 'lg' (50px) | 'sm' (36px visual, 44px hit area via padding)
 */
const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-pressed active:bg-accent-pressed',
  ghost: 'bg-fill text-ink hover:bg-fill-2 active:bg-fill-2',
  destructive: 'bg-fill text-bad hover:bg-fill-2 active:bg-fill-2',
  plain: 'bg-transparent text-ink-2 hover:bg-fill hover:text-ink active:bg-fill-2',
};

const SIZES = {
  sm: 'min-h-[36px] px-3.5 text-[15px] gap-1.5',
  md: 'min-h-[44px] px-5 text-[16px] gap-2',
  lg: 'min-h-[50px] px-6 text-[17px] gap-2',
};

export const Button = memo(forwardRef(({
  children,
  variant = 'ghost',
  size = 'md',
  block = false,
  className = '',
  type = 'button',
  ...props
}, ref) => (
  <button
    ref={ref}
    type={type}
    className={`pressable inline-flex items-center justify-center rounded-control font-medium select-none
      disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
      ${VARIANTS[variant] || VARIANTS.ghost} ${SIZES[size] || SIZES.md} ${block ? 'w-full' : ''} ${className}`}
    {...props}
  >
    {children}
  </button>
)));
Button.displayName = 'Button';

/** Round icon-only button with a 44px hit area. Always pass an aria-label. */
export const IconButton = memo(forwardRef(({ children, className = '', label, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={label}
    title={label}
    className={`pressable pressable-icon inline-flex items-center justify-center w-11 h-11 rounded-full
      text-ink-2 hover:text-ink hover:bg-fill active:bg-fill-2 disabled:opacity-40 disabled:pointer-events-none ${className}`}
    {...props}
  >
    {children}
  </button>
)));
IconButton.displayName = 'IconButton';
