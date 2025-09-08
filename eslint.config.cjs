// eslint.config.cjs
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script', // for CommonJS, not 'module'
  },
  extends: [
    'eslint:recommended', // basic recommended rules
  ],
  rules: {
    // === Variable Rules ===
    'no-unused-vars': ['error', { 
      vars: 'all', 
      args: 'after-used', 
      ignoreRestSiblings: true 
    }],
    
    // === Best Practices ===
    'no-console': 'warn',          // warn instead of using console.log
    'no-debugger': 'error',        // disallow debugger statements
    'eqeqeq': ['error', 'always'], // enforce strict equality
    'curly': ['error', 'all'],     // enforce consistent curly braces
    'no-var': 'error',             // prefer let/const over var
    'prefer-const': 'error',       // use const when variables are never reassigned
    
    // === Code Style ===
    'semi': ['error', 'always'],   // enforce semicolons
    'quotes': ['error', 'single'], // enforce single quotes
    'indent': ['error', 2],        // 2-space indentation
    'comma-dangle': ['error', 'always-multiline'], // trailing commas in multiline
  },
};
