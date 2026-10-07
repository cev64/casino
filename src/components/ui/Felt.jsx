import { memo, useId } from 'react';

/*
 * Life-like casino felt with a padded rail. The table lays out `children` inside.
 *   <Felt variant="blackjack|craps" className contentClassName>children</Felt>
 *
 * Printed markings (screen-printed table text and lines) use these classes inside the felt:
 *   .felt-print        small spaced caps, cream ink at ~70%  (e.g. "BLACKJACK PAYS 3 TO 2")
 *   .felt-print-lg     larger display variant
 *   .felt-line         1px printed hairline (use on a div; width/height up to you)
 *   .felt-ring         printed outline (betting circle / box); add rounded-* as needed
 * or the <FeltPrint> component (see below), including curved text.
 */
export const Felt = memo(({ variant = 'blackjack', className = '', contentClassName = '', children, ...rest }) => (
  <div className={`felt felt-${variant} ${className}`} data-variant={variant} {...rest}>
    <div className="felt-bg" aria-hidden="true" />
    <div className={`felt-content ${contentClassName}`}>{children}</div>
  </div>
));

/**
 * Printed felt text. <FeltPrint>Dealer stands on 17</FeltPrint>
 * size: 'sm' (default) | 'lg'. as: element/tag. `arc`: render along a gentle arc (SVG textPath).
 */
export const FeltPrint = memo(({ children, as: Tag = 'p', size = 'sm', arc = false, className = '', ...rest }) => {
  const uid = useId().replace(/:/g, '');
  if (arc && typeof children === 'string') {
    const id = `felt-arc-${uid}`;
    return (
      <svg viewBox="0 0 400 70" className={`felt-arc ${className}`} role="img" aria-label={children} {...rest}>
        <path id={id} d="M20 12 Q200 62 380 12" fill="none" />
        <text className={size === 'lg' ? 'felt-print-svg felt-print-svg-lg' : 'felt-print-svg'}>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{children}</textPath>
        </text>
      </svg>
    );
  }
  return <Tag className={`felt-print ${size === 'lg' ? 'felt-print-lg' : ''} ${className}`} {...rest}>{children}</Tag>;
});
