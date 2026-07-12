import globals from 'globals'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
import nextVitals from 'eslint-config-next/core-web-vitals'
import jsxA11y from 'eslint-plugin-jsx-a11y'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default [
  {
    // app/sw.ts 用到 webworker 全域型別,不在主專案的 tsconfig.json 型別檢查範圍內
    // (見 tsconfig.json 的 exclude 註解),typescript-eslint 的 project-aware 規則
    // 因此無法解析這個檔案,一併排除。
    ignores: ['next-env.d.ts', 'next.config.mjs', 'app/sw.ts'],
  },
  js.configs.recommended,
  // eslint-config-next v16 的 flat config 已內含並「註冊」@typescript-eslint 與
  // jsx-a11y 等 plugin(綁定它自己 node_modules 裡的實例),這裡不可再用 FlatCompat
  // 或 plugins 鍵重複註冊同名 plugin(實例不同會觸發 "Cannot redefine plugin");
  // 要加嚴 jsx-a11y 只能疊 rules(規則實作仍由已註冊的 plugin 提供)。
  ...nextVitals,
  { rules: jsxA11y.flatConfigs.recommended.rules },
  {
    // 補回舊設定裡 plugin:@typescript-eslint/eslint-recommended + recommended 的完整
    // 規則集(eslint-config-next v16 只啟用其中兩條,直接沿用會讓整組規則靜默消失)。
    // 同樣只疊 rules:規則實作由 eslint-config-next 已註冊的 plugin 實例提供。
    // eslint-recommended 會關閉與 TS 重複的 core 規則(no-undef、no-unused-vars 等,
    // 交給 TypeScript 本身檢查,否則會對型別語法誤報,例如 `React.ReactNode`)。
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
    },
  },
  ...compat.extends('plugin:prettier/recommended'),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.amd,
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 5,
      sourceType: 'commonjs',

      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },

    rules: {
      'prettier/prettier': 'error',
      'react/react-in-jsx-scope': 'off',

      // react-hooks v6(隨 eslint-config-next 16 引入)的新規則,會打到
      // `useEffect(() => setMounted(true), [])` 這種避免 hydration mismatch 的
      // 刻意寫法(ThemeSwitch、Comments 等)。先關閉,是否逐一改寫另案處理。
      'react-hooks/set-state-in-effect': 'off',

      'jsx-a11y/anchor-is-valid': [
        'error',
        {
          components: ['Link'],
          specialLink: ['hrefLeft', 'hrefRight'],
          aspects: ['invalidHref', 'preferButton'],
        },
      ],
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
]
