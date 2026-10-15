import type { Config } from 'tailwindcss';

// Brand colors are driven by CSS variables (set from Admin → Branding),
// so changing the palette needs no rebuild.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'rgb(var(--brand) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        ink: {
          DEFAULT: '#0f172a',
          soft: '#475569',
          faint: '#94a3b8',
        },
        stage: {
          DEFAULT: '#0b1220',
          raised: '#121b2e',
          line: '#24314d',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        pulseRing: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        ticker: 'ticker 28s linear infinite',
        pulseRing: 'pulseRing 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
