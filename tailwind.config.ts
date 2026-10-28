import type { Config } from 'tailwindcss';

// Brand colors are driven by CSS variables (set from Admin → Branding),
// so changing the palette needs no rebuild.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Shape language: square corners everywhere (circles stay round), flat surfaces.
      borderRadius: { none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0', full: '9999px' },
      colors: {
        // Neutral scale: body text #5E6973 (slate-500), strong text and headings deep indigo (slate-900).
        slate: { 50: '#F7F8FA', 100: '#EEF0F3', 200: '#DFE3E8', 300: '#C9CFD6', 400: '#9AA4AE', 500: '#5E6973', 600: '#4B555F', 700: '#38414A', 800: 'rgb(var(--ink2) / <alpha-value>)', 900: 'rgb(var(--ink) / <alpha-value>)' },
        red: { 50: '#FEF2F2', 100: '#FDE2E2', 200: '#FBC4C4', 300: '#F59A9A', 400: '#EB6464', 500: '#DC3A3A', 600: '#CC1010', 700: '#A80D0D', 800: '#870F0F', 900: '#6B1010' },
        brand: 'rgb(var(--brand) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        ink: {
          DEFAULT: '#0f172a',
          soft: '#475569',
          faint: '#94a3b8',
        },
        stage: {
          DEFAULT: 'rgb(var(--stage) / <alpha-value>)',
          raised: 'rgb(var(--stage-raised) / <alpha-value>)',
          line: 'rgb(var(--stage-line) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"Montserrat Variable"', 'Montserrat', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
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
