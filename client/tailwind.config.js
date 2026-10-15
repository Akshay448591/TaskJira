/** @type {import('tailwindcss').Config} */

// Neutrals and the accent are CSS variables (see src/index.css) so a dark theme can be added later by
// redefining the variables. Semantic hues are generated from a hue + saturation and are deliberately muted.
const v = (n) => `rgb(var(--c-${n}) / <alpha-value>)`;
const ramp = (prefix, steps) => Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

const hsl = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};
const LIGHTNESS = { 50: 96, 100: 92, 200: 85, 300: 74, 400: 60, 500: 47, 600: 38, 700: 31, 800: 24, 900: 18 };
const hue = (h, s) => Object.fromEntries(Object.entries(LIGHTNESS).map(([k, l]) => [k, hsl(h, s, l)]));
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        slate: ramp('slate', STEPS), // warm paper neutrals
        brand: ramp('brand', [50, 100, 500, 600, 700]), // navy accent
        red: hue(8, 56),
        green: hue(152, 36),
        amber: hue(36, 72),
        orange: hue(22, 60),
        yellow: hue(44, 70),
        blue: hue(214, 46),
        sky: hue(200, 48),
        indigo: hue(226, 34),
        purple: hue(268, 26),
        pink: hue(336, 36),
        teal: hue(176, 40),
      },
      boxShadow: { pop: '0 8px 24px rgb(31 29 26 / 0.12), 0 2px 6px rgb(31 29 26 / 0.08)' },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-in': { from: { transform: 'translateX(24px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        'rise-in': { from: { transform: 'translateY(8px) scale(.98)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        'toast-in': { from: { transform: 'translateY(10px) scale(.96)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        'toast-out': { from: { transform: 'none', opacity: 1 }, to: { transform: 'translateX(12px) scale(.98)', opacity: 0 } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'slide-in': 'slide-in 180ms cubic-bezier(.2,.8,.2,1)',
        'rise-in': 'rise-in 160ms cubic-bezier(.2,.8,.2,1)',
        'toast-in': 'toast-in 200ms cubic-bezier(.2,.8,.2,1)',
        'toast-out': 'toast-out 160ms ease-in forwards',
      },
    },
  },
  plugins: [],
};
