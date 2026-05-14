import { defineConfig } from 'eslint/config'

export default defineConfig({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2024,
      sourceType: 'module'
    },
    globals: {
      process: 'readonly',
      console: 'readonly',
      module: 'readonly',
      require: 'readonly',
      __dirname: 'readonly'
    }
  },
  ignores: ['node_modules/**'],
  rules: {
    'no-console': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
  }
})
