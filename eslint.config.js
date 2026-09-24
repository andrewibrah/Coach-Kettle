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
