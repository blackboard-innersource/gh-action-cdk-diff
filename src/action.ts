import { getInput, getBooleanInput, getMultilineInput, debug, error, setOutput } from '@actions/core';
import * as github from '@actions/github';
import { NonInteractiveIoHost, Toolkit } from '@aws-cdk/toolkit-lib';
import { AssemblyReader } from './assembly-reader';
import { Comment } from './comment';
import { CommentUpdater } from './comment-updater';
import { Labeler } from './labeler';
import { StackDiff, StackDiffInfo } from './stack-diff';
import { StackDiffComment } from './stack-diff-comment';
import { SummaryComment } from './summary-comment';

/**
 * Inputs to the GH Workflow
 */
export interface Inputs {
  /**
   * The GitHub TOKEN to use to create the comment
   */
  githubToken: string;

  /**
   * The location of the base CDK output directory
   */
  base: string;

  /**
   * The location of the head CDK output directory
   */
  head: string;

  /**
   * If true, comments will not be created on the PR.
   */
  disableComments: boolean;

  /**
   * If true, labels will not be added to the PR.
   */
  disableLabels: boolean;

  /**
   * If true, the summary comment will not be created.
   */
  disableSummary: boolean;

  /**
   * A list of CloudFormation resource types to ignore when calculating the diff. The format is:
   *
   * AWS::CloudFormation::CustomResource.PropertyName
   */
  ignoreChanges: string[];

  /**
   * Whether or not to ignore asset-only changes. Asset-only changes can be to asset paths in the bootstrap bucket.
   * Currently, this is limited to scanning state machines for S3 path only changes.
   */
  ignoreAssetOnlyChanges: boolean;
}

export async function run() {
  const inputs: Inputs = {
    base: getInput('base', { required: true }),
    githubToken: getInput('github-token', { required: true }), // Change from githubToken to github-token
    head: getInput('head', { required: true }),
    disableComments: getInput('disable-comments', { required: false }) ? getBooleanInput('disable-comments') : false,
    disableLabels: getInput('disable-labels', { required: false }) ? getBooleanInput('disable-labels') : false,
    disableSummary: getInput('disable-summary', { required: false }) ? getBooleanInput('disable-summary') : false,
    ignoreChanges: getMultilineInput('ignore-changes'),
    ignoreAssetOnlyChanges: getInput('ignore-asset-only-changes', { required: false })
      ? getBooleanInput('ignore-asset-only-changes')
      : false,
  };

  debug(`Inputs: ${JSON.stringify(inputs, null, 2)}`);

  const octokit = github.getOctokit(inputs.githubToken);
  const toolkit = new Toolkit({
    ioHost: new NonInteractiveIoHost({
      logLevel: 'trace',
    }),
  });

  let baseAssembly: AssemblyReader;
  try {
    debug(`Loading base assembly from ${inputs.base}`);
    baseAssembly = await AssemblyReader.fromPath(toolkit, inputs.base);
  } catch (e: unknown) {
    console.error('Error loading base assembly: ', e);
    throw e;
  }

  let headAssembly: AssemblyReader;
  try {
    debug(`Loading head assembly from ${inputs.head}`);
    headAssembly = await AssemblyReader.fromPath(toolkit, inputs.head);
  } catch (e: unknown) {
    console.error('Error loading head assembly: ', e);
    throw e;
  }

  const stackResults: Record<string, StackDiffInfo | Error> = {};
  const comments: Comment[] = [];
  const stacks = headAssembly.cloudAssembly.cloudAssembly.stacks;

  let hasChanges = false;
  let hasDestructiveChanges = false;
  let hasSecurityGroupChanges = false;
  let hasIamChanges = false;
  for (const stack of stacks.values()) {
    const stackName = stack.id;

    debug(`Looking at stack: ${stackName}`);

    try {
      const stackDiff = new StackDiff(toolkit, stack, headAssembly, baseAssembly);
      const diff = await stackDiff.diff(inputs.ignoreChanges, inputs.ignoreAssetOnlyChanges);

      if (diff.changes.hasChanges) {
        hasChanges = true;
      }

      if (diff.diff.securityGroupChanges.hasChanges) {
        hasSecurityGroupChanges = true;
      }

      if (diff.diff.iamChanges.hasChanges) {
        hasIamChanges = true;
      }

      if (diff.changes.destructiveChanges.length > 0) {
        hasDestructiveChanges = true;
      }

      stackResults[stackName] = diff;
      comments.push(new StackDiffComment(stackName, diff));
    } catch (e: unknown) {
      if (e instanceof Error) {
        stackResults[stackName] = e;
      } else {
        stackResults[stackName] = new Error(`Unknown error: ${e}`);
      }

      console.error('Error performing diff: ', e);
    }
  }

  setOutput('has-changes', hasChanges);
  setOutput('has-destructive-changes', hasDestructiveChanges);
  setOutput('has-iam-changes', hasIamChanges);
  setOutput('has-security-group-changes', hasSecurityGroupChanges);

  if (!inputs.disableSummary) {
    comments.unshift(new SummaryComment(stackResults));
  } else {
    debug('Summary comment is disabled, skipping summary comment');
  }

  if (!inputs.disableComments) {
    try {
      const updater = new CommentUpdater(octokit, comments);

      await updater.updateComments();
    } catch (e) {
      error(`Error updating comments: ${e}`);
    }
  } else {
    debug('Comments are disabled, skipping comment updater');
  }

  if (!inputs.disableLabels) {
    try {
      const labeler = new Labeler(octokit);

      await labeler.process(stackResults);
    } catch (e) {
      error(`Error labeling PR: ${e}`);
    }
  } else {
    debug('Labeling is disabled, skipping labeler');
  }
}
