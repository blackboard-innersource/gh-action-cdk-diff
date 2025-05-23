import { TextFile, typescript } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript';

const project = new typescript.TypeScriptProject({
  majorVersion: 1,
  defaultReleaseBranch: 'main',
  name: 'cdk-diff-action',
  github: false,
  githubOptions: {
    mergify: false,
  },
  packageManager: NodePackageManager.NPM,
  deps: [
    '@octokit/webhooks-definitions',
    '@aws-cdk/aws-service-spec',
    '@aws-cdk/cloudformation-diff',
    '@aws-cdk/cloud-assembly-schema',
    '@aws-cdk/cx-api',
    '@aws-cdk/toolkit-lib',
    '@actions/core',
    '@actions/github',
    '@actions/exec@^1.1.1',
    '@actions/io@^1.1.3',
    '@actions/tool-cache@^2.0.0',
    'diff',
    'fs-extra',
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-sts',
    '@smithy/types',
    'chalk@^4',
    '@aws-sdk/credential-providers',
    'glob-promise',
  ],
  devDeps: [
    '@bb-fnds/projen',
    '@eslint/js',
    '@swc/core',
    '@swc/jest',
    '@types/diff',
    '@types/fs-extra',
    '@types/mock-fs@^4',
    '@typescript-eslint/parser',
    'action-docs',
    'aws-sdk',
    'aws-sdk-client-mock',
    'esbuild',
    'eslint@^9',
    'eslint-config-prettier',
    'eslint-import-resolver-typescript',
    'eslint-plugin-import-x',
    'eslint-plugin-prettier',
    'mock-fs@^5',
    'prettier',
    'projen-github-action-typescript',
    'typescript-eslint',
  ],
  release: false,
  package: false,
  typescriptVersion: undefined,
  projenrcTs: true,
  eslint: false,
  jest: false,
  minNodeVersion: '20',
  licensed: false,
});

project.bundler.addBundle('src/index.ts', {
  // banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
  // format: 'esm',
  outfile: '../../dist/index.js',
  platform: 'node',
  sourcemap: true,
  target: 'node20',
  externals: ['@aws-cdk/aws-service-spec', 'fs', 'fsevents'],
});

project.compileTask.reset();

project.gitignore.removePatterns('/dist/');
project.gitignore.exclude('test/test_helper');
project.gitignore.exclude('.idea');
project.gitignore.exclude('.yarn');
project.gitignore.exclude('.env');

project.addDevDeps('husky', 'lint-staged');

project.package.addField('lint-staged', {
  [`${project.srcdir}/**/*.{json,md}`]: 'prettier --write',
  [`${project.srcdir}/**/*.ts`]: 'eslint --fix',
});

project.addScripts({ prepare: 'husky' });

new TextFile(project, '.husky/pre-commit', {
  lines: ['projen', 'npx lint-staged', 'npm run build', 'git add dist'],
});

project.synth();
