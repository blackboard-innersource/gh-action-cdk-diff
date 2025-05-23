import { Comment } from './comment';
import { ChangeDetails, StackDiffInfo } from './stack-diff';

export class SummaryComment extends Comment {
  constructor(private readonly stackDiffs: Record<string, StackDiffInfo | Error> = {}) {
    super();
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

    if (combinedChanges.hasChanges) {
      output.push(`:ghost: This pull request introduces changes to CloudFormation templates :ghost:\n`);
    }

    const filteredDiffs = Object.values(this.stackDiffs).filter((sd) => !(sd instanceof Error)) as StackDiffInfo[];

    output.push(`***Summary of changes*** :ghost:`);
    output.push(`\n> ${this.getDiffSummary(filteredDiffs).join('\n')}\n`);

    output.push('<details>');
    output.push('<summary>Summary of changes</summary>\n');
    for (const [stackName, diff] of stackDiffs) {
      if (!(diff instanceof Error)) {
        output.push(`### ${emoji} ***Stack***: ${diff.stackName}\n> ${this.getDiffSummary([diff]).join(', ')}\n`);
      } else {
        output.push(`### :fire: ***Stack***: ${stackName}\n> Error: ${diff.message}\n`);
      }
    }
    output.push('</details>');

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
      securityGroupChanges: 0,
      iamChanges: 0,
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
