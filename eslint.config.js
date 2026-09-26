// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // eslint-config-expo 57 spreads eslint-plugin-react-hooks 7 `recommended`,
    // which adds React Compiler diagnostics as errors. These six flag existing
    // code (Reanimated shared-value writes, gesture callbacks, effect setState)
    // that the compiler (app.json experiments.reactCompiler) already skips
    // silently under SDK 55. Off to keep the SDK 55 lint surface; the other
    // compiler rules stay on. Hits at the SDK 57 upgrade are noted per rule.
    rules: {
      'react-hooks/refs': 'off', // 31
      'react-hooks/set-state-in-effect': 'off', // 29
      'react-hooks/immutability': 'off', // 19
      'react-hooks/purity': 'off', // 4
      'react-hooks/preserve-manual-memoization': 'off', // 4
      'react-hooks/static-components': 'off', // 2
    },
  },
  {
    // `expo lint` only scans `app/` and `components/` by default, so a
    // conditional-hook bug in `hooks/**` (e.g. useColorScheme wrapping
    // useTheme() in try/catch) can pass `npm run lint` silently. Enforce
    // rules-of-hooks explicitly here so hooks/ is never lint-blind.
    files: ['hooks/**/*.ts', 'hooks/**/*.tsx'],
    plugins: { 'react-hooks': reactHooksPlugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]);
