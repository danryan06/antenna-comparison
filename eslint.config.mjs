// ESLint flat config. Run with `npm run lint`.
//
// The site has no bundler: browser files are classic <script>s that share
// helpers through globals. The shared-helper names are read from the helper
// modules' own exports below, so adding a helper needs no config change.
import { createRequire } from 'node:module';
import js from '@eslint/js';
import globals from 'globals';

const require = createRequire(import.meta.url);
const exportedNames = file => Object.keys(require(file));

const sharedGlobals = Object.fromEntries(
  [
    ...exportedNames('./antenna-format.js'), // top-level declarations in the browser
    ...exportedNames('./antenna-submit.js'), // Object.assign(globalThis, api) in the browser
    'AntennaCompatibility', // compatibility-matcher.js
    'ConnectorNormalize', // connector-normalize.js
    'Fresh' // fresh.js
  ].map(name => [name, 'readonly'])
);

// Shared helper files are loaded by Node tests too (UMD / module.exports guard).
const sharedHelpers = [
  'antenna-format.js',
  'antenna-submit.js',
  'compatibility-matcher.js',
  'connector-normalize.js'
];

export default [
  {
    ignores: ['node_modules/**', 'images/**', 'fonts/**']
  },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'off', // the UMD helpers deliberately use var for old-browser safety
      // Defensive initial values (let x = ''; then assigned in every branch) are house style.
      'no-useless-assignment': 'off',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    // Browser classic scripts: page scripts and shared helpers.
    files: ['*.js', 'js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...sharedGlobals }
    },
    rules: {
      // Top-level declarations in a classic script are globals other scripts may use.
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      // A file defining a shared global is not redeclaring it.
      'no-redeclare': ['error', { builtinGlobals: false }]
    }
  },
  {
    files: sharedHelpers,
    languageOptions: { globals: { ...globals.commonjs } }
  },
  {
    // Node tooling: validators, generators, tests, this config.
    files: ['.github/scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: { ...globals.node }
    }
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  }
];
