import { GitHub } from '@actions/github/lib/utils';
import { Comment } from './comment';
import { ChangeDetails, StackDiffInfo } from './stack-diff';

export class SummaryComment extends Comment {
  constructor(
    octokit: InstanceType<typeof GitHub>,
    private readonly stackDiffs: Record<string, StackDiffInfo | Error> = {},
  ) {
    super(octokit);
  }

  get id() {
    return 'summary-comment';
  }

  get content(): string {
    const output: string[] = [];
    const stackDiffs = Object.entries(this.stackDiffs);

    if (!stackDiffs?.length) {
      output.push(`:ghost: No Changes were generated for this pull request :ghost:`);
      return output.join('\n');
    }

    const combinedChanges = this.combineChanges(
      stackDiffs.filter((entry) => !(entry[1] instanceof Error)).map((entry) => (entry[1] as StackDiffInfo).changes),
    );

    const emoji = this.getEmoji(combinedChanges);

    output.push(...['<details>', '<summary>Summary of changes</summary>']);
    for (const [stackName, diff] of stackDiffs) {
      if (!(diff instanceof Error)) {
        output.push(...[`:${emoji}: ***Stack***: ${diff.stackName}: ` + this.getDiffSummary(diff)]);
      } else {
        output.push(...[`:fire: ***Stack***: ${stackName}\n> Error: ${diff.message}`]);
      }
    }
    output.push('</details>');
    output.push('');

    return output.join('\n');
  }

  /**
   * Combine the diff changes into a single object. This is mostly used to help in the summarization of the changes.
   */
  protected combineChanges(changes: ChangeDetails[]): ChangeDetails {
    const combinedChanges: ChangeDetails = {
      createdResources: 0,
      updatedResources: 0,
      removedResources: 0,
      destructiveChanges: [],
      hasChanges: false,
    };

    for (const change of changes) {
      combinedChanges.destructiveChanges.push(...change.destructiveChanges);
      combinedChanges.createdResources += change.createdResources;
      combinedChanges.updatedResources += change.updatedResources;
      combinedChanges.removedResources += change.removedResources;
    }

    if (combinedChanges.createdResources + combinedChanges.updatedResources + combinedChanges.removedResources > 0) {
      combinedChanges.hasChanges = true;
    }

    return combinedChanges;
  }
}
