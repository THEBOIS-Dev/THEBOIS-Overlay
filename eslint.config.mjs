import prettierConfig from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  {
    ignores: ['**/out/**', '**/dist/**', '**/node_modules/**', '**/.electron-vite/**'],
  },

  tseslint.configs.recommended,

  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.ts'],
    ignores: ['**/*.d.ts'],

    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.node.json',
          './tsconfig.web.json',
          './tsconfig.e2e.json',
          './tsconfig.codemods.json',
        ],

        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-explicit-any': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      '@typescript-eslint/no-floating-promises': 'error',

      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/await-thenable': 'error',

      '@typescript-eslint/no-require-imports': 'warn',

      '@typescript-eslint/no-import-type-side-effects': 'error',

      'no-console': [
        'warn',
        {
          allow: ['warn', 'error'],
        },
      ],

      'prefer-const': 'error',

      'no-var': 'error',

      'object-shorthand': ['error', 'always'],

      'prefer-template': 'error',
    },
  },

  {
    files: ['e2e/**/*.ts'],

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    files: ['**/*.vue'],

    languageOptions: {
      parser: vueParser,

      parserOptions: {
        parser: tseslint.parser,
        project: false,
        extraFileExtensions: ['.vue'],
      },
    },

    rules: {
      'vue/multi-word-component-names': 'off',

      'vue/no-v-html': 'warn',

      'vue/component-api-style': ['error', ['script-setup']],

      'vue/define-macros-order': [
        'error',
        {
          order: ['defineProps', 'defineEmits'],
        },
      ],

      'vue/block-order': [
        'error',
        {
          order: ['script', 'template', 'style'],
        },
      ],

      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'always',
            normal: 'always',
            component: 'always',
          },
        },
      ],

      'vue/max-attributes-per-line': [
        'error',
        {
          singleline: 1,
          multiline: 1,
        },
      ],

      'vue/html-indent': ['error', 2],

      'vue/script-indent': [
        'error',
        2,
        {
          baseIndent: 1,
          switchCase: 1,
        },
      ],

      'vue/mustache-interpolation-spacing': ['error', 'always'],

      'vue/no-unused-refs': 'error',

      'vue/no-useless-mustaches': 'error',

      'vue/padding-line-between-blocks': ['error', 'always'],

      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettierConfig,
);
