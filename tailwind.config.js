/** @type {import('tailwindcss').Config} */
// Colours map to the Fluid Glass CSS variables in src/styles/tokens.css,
// so every utility follows light/dark automatically.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        page: 'var(--page)',
        card: 'var(--card)',
        accent: { DEFAULT: 'var(--accent)', pressed: 'var(--accent-pressed)' },
        'on-accent': 'var(--on-accent)',
        good: 'var(--good)',
        bad: 'var(--bad)',
        warn: 'var(--warn)',
        fill: { DEFAULT: 'var(--fill)', 2: 'var(--fill-2)' },
        thumb: 'var(--thumb)',
        glass: { DEFAULT: 'var(--glass)', strong: 'var(--glass-strong)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        sheet: '28px',
        menu: '18px',
        control: '12px',
        rail: '24px',
      },
      boxShadow: {
        glass: 'var(--glass-hi), var(--glass-edge), var(--glass-shadow)',
        'glass-lg': 'var(--glass-hi), var(--glass-edge), var(--glass-shadow-lg)',
        thumb: 'var(--thumb-shadow)',
        fab: 'var(--fab-shadow)',
      },
      transitionTimingFunction: {
        ease: 'var(--ease)',
        spring: 'var(--spring)',
        'spring-soft': 'var(--spring-soft)',
      },
      screens: {
        nav: '600px', // side rail replaces bottom nav
        wide: '1024px',
      },
    },
  },
  plugins: [],
};
