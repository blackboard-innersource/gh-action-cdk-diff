import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import { globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import importPlugin, { flatConfigs as importFlatConfigs, createNodeResolver } from 'eslint-plugin-import-x';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tsEslint, { configs as tseslintConfigs } from 'typescript-eslint';
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

export default tsEslint.config(
  eslint.configs.recommended,
  tseslintConfigs.recommended,
  importFlatConfigs.recommended,
  importFlatConfigs.typescript,
  eslintPluginPrettierRecommended,
  globalIgnores([
    "eslint.config.mjs",
    ".yarn",
    ".yalc",
    "dist",
    "coverage",
    "lib",
    "jest.config.mjs",
    ".yalc",
    "assets/**/*.mjs"
  ]),
  {
    extends: [prettier],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        parserOptions: {
          project: ['./tsconfig.dev.json'],
          tsconfigRootDir: import.meta.dirname,
        },

      },
    },
  },
  {
    rules: {
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
          singleQuote: true,
          trailingComma: 'all',
          printWidth: 120,
          tabWidth: 2,
          semi: true,
        },
      ],
    },
  },
  {
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: [".js", ".mjs", ".json", ".node"],
          moduleDirectory: ['node_modules', 'src'],
        }),
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: ['./tsconfig.dev.json'],
        }),
      ],
    },
    rules: {
      'import-x/order': [
        'warn',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-extraneous-dependencies': [
        'warn',
        {
          devDependencies: [
            '.projenrc.[mjct]s',
            'projenrc/**/*.[mjct]s',
            '**/test/**',
            '**/build-tools/**',
            '**/eslint.config.[mjct]s',
            '**/jest.config.[mjct]s',
          ],
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/member-ordering': [
        'warn',
        {
          default: [
            'public-static-field',
            'public-static-method',
            'protected-static-field',
            'protected-static-method',
            'private-static-field',
            'private-static-method',
            'field',
            'constructor',
            'method',
          ],
        },
      ],
      '@typescript-eslint/no-empty-object-type': ['off'],
      '@typescript-eslint/no-unused-vars': ['warn'],
      'dot-notation': ['error'],
      'key-spacing': ['error'],
      'no-bitwise': ['error'],
      'no-shadow': ['off'],
      'no-multiple-empty-lines': ['error'],
      'no-return-await': ['off'],
      'no-trailing-spaces': ['error'],
    },
  },
);
