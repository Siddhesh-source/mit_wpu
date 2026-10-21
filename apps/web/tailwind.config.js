/**
 * Design tokens from the deck theme "Public Record" (out/source/kit.py), as CSS variables so light and dark
 * themes share one set of names. Values live in src/index.css. See docs/DESIGN.md.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: v('panel'),
        rule: v('rule'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        ok: { DEFAULT: v('ok'), bg: v('ok-bg') },
        bad: { DEFAULT: v('bad'), bg: v('bad-bg') },
        warn: { DEFAULT: v('warn'), bg: v('warn-bg') },
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
};
