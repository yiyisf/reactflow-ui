import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// TS/TSX 检查需要 typescript-eslint（需 `npm i -D typescript-eslint` 并提交 package-lock.json）。
// 未安装时自动跳过，不影响现有 CI；安装后即以"警告"级别启用，存量问题清理完再逐步改为 error。
let tsConfigs = []
try {
  const { default: tseslint } = await import('typescript-eslint')
  const toWarn = (rules = {}) =>
    Object.fromEntries(
      Object.entries(rules).map(([name, value]) => {
        const level = Array.isArray(value) ? value[0] : value
        const off = level === 'off' || level === 0
        return [name, off ? value : Array.isArray(value) ? ['warn', ...value.slice(1)] : 'warn']
      }),
    )
  tsConfigs = [
    ...tseslint.configs.recommended,
    reactHooks.configs.flat.recommended,
  ].map((c) => ({ ...c, files: ['**/*.{ts,tsx}'], rules: toWarn(c.rules) }))
  tsConfigs.push({
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      // 项目已有 ConfirmDialog / PromptDialog，避免原生阻塞式弹窗
      'no-alert': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  })
} catch {
  console.warn('[eslint] 未安装 typescript-eslint，已跳过 TS/TSX 检查（npm i -D typescript-eslint 后自动启用）')
}

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.claude']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  ...tsConfigs,
])
