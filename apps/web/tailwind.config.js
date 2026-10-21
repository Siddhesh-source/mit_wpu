/** Design tokens from the deck theme "Public Record" (out/source/kit.py). See docs/DESIGN.md. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        panel: '#F4F6F8',
        rule: '#E1E4E8',
        ink: '#101418',
        muted: '#5A6370',
        faint: '#6B7480',
        accent: '#1D4F91',
        ok: { DEFAULT: '#1E7A4C', bg: '#E8F3EC' },
        bad: { DEFAULT: '#B42318', bg: '#FBEAE8' },
        warn: { DEFAULT: '#B54708', bg: '#FEF0C7' },
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
};
