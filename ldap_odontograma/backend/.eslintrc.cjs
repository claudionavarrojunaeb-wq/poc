module.exports = {
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2024,
    sourceType: 'module'
  },
  extends: ['eslint:recommended'],
  rules: {
    // Ajustes mínimos para evitar reglas ruidosas en este backend
    'no-console': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
  }
}
