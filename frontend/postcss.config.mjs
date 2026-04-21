import postcssPresetEnv from 'postcss-preset-env'

/**
 * PostCSS configuration for cross-browser compatibility.
 *
 * Tailwind v4 (via @tailwindcss/vite) outputs standard CSS containing:
 *   - @layer        — Chrome 99+, Firefox 97+: polyfilled via specificity hacks
 *   - color-mix()   — Chrome 111+:             replaced with static hex
 *   - CSS nesting   — Chrome 112+:             flattened to standard selectors
 *
 * postcss-preset-env converts all of the above so the final bundle works in
 * Chrome 60+, Firefox 60+, Safari 11+, Edge 18+ on intranet machines.
 */
export default {
  plugins: [
    postcssPresetEnv({
      stage: 2,
      features: {
        // Polyfill @layer with specificity-based selectors
        'cascade-layers': true,
        // Flatten CSS nesting  (a { &:hover {} } → a:hover {})
        'nesting-rules': { edition: '2021' },
        // Convert color-mix() to static fallback values
        'color-mix': true,
        // Convert oklab/oklch — safety net in case any survive theme.css rewrite
        'oklab-function': { preserve: false },
        // Add -webkit- / -moz- vendor prefixes for backdrop-filter etc.
        'custom-properties': false,   // keep CSS vars as-is (browsers support them)
      },
      browsers: ['chrome >= 60', 'firefox >= 60', 'safari >= 11', 'edge >= 18'],
    }),
  ],
}
