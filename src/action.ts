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
   * A list of CloudFormation resource types that are allowed to be destroyed even if `failOnDestructiveChanges` is
   * set to true.
   *
   * @default - there are no allowed destroy types
   */
  allowDestructionOf: string[];

  /**
   * The location of the base CDK output directory
   */
  base: string;

  /**
   * The location of the head CDK output directory
   */
  head: string;

  /**
   * Whether or not to enable labels on the PR.
   */
  enableLabels: boolean;

  /**
   * Enabling the summarize flag will create a summary comment with the number of resources that are being added,
   * updated, or for each stack.
   */
  enableSummary: boolean;

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
    allowDestructionOf: getMultilineInput('allowDestructionOf'),
    base: getInput('base', { required: true }),
    githubToken: getInput('githubToken', { required: true }),
    head: getInput('head', { required: true }),
    enableLabels: getInput('enableLabels', { required: false }) ? getBooleanInput('enableLabels') : true,
    enableSummary: getInput('enableSummary', { required: false }) ? getBooleanInput('enableSummary') : true,
    ignoreChanges: getMultilineInput('ignoreChanges'),
    ignoreAssetOnlyChanges: getInput('ignoreAssetOnlyChanges', { required: false })
      ? getBooleanInput('ignoreAssetOnlyChanges')
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

      stackResults[stackName] = diff;
      comments.push(new StackDiffComment(octokit, stackName, diff));
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
  setOutput('has-iam-changes', hasIamChanges);
  setOutput('has-security-group-changes', hasSecurityGroupChanges);

  comments.unshift(new SummaryComment(octokit, stackResults));

  try {
    const updater = new CommentUpdater(comments);

    await updater.updateComments();
  } catch (e) {
    error(`Error updating comments: ${e}`);
  }

  try {
    const labeler = new Labeler(octokit);

    await labeler.process(stackResults);
  } catch (e) {
    error(`Error labeling PR: ${e}`);
  }
}
