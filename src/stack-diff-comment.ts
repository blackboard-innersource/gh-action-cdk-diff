import { GitHub } from '@actions/github/lib/utils';
import { formatDifferences } from '@aws-cdk/cloudformation-diff';
import { Comment, StringWritable } from './comment';
import { ChangeDetails, StackDiffInfo } from './stack-diff';

export class StackDiffComment extends Comment {
  constructor(
    octokit: InstanceType<typeof GitHub>,
    private readonly stackName: string,
    private readonly stackDiff: StackDiffInfo,
  ) {
    super(octokit);
  }

  get id() {
    return this.stackName;
  }

  get content(): string {
    const output: string[] = [];
    const emoji = this.getEmoji(this.stackDiff.changes);

    if (this.stackDiff.diff.isEmpty) {
      output.push(`No Changes for stack: ${this.stackName} ${emoji}`);
      return output.join('\n');
    }

    output.push(
      ...[
        `#### ${emoji} Diff for stack ***${this.stackName}***: ${this.getDiffSummary(this.stackDiff)} `,
        '<details><summary>Details</summary>',
        '',
      ],
    );

    if (this.stackDiff.changes.destructiveChanges.length) {
      output.push('');
      output.push('> [!WARNING]\n> ***Destructive Changes*** :bangbang:');

      this.stackDiff.changes.destructiveChanges.forEach((change) => {
        output.push(
          `> **Stack: ${change.stackName} - Resource: ${change.logicalId} - Impact:** ***${change.impact}***`,
        );
      });
    }

    const writable = new StringWritable({});

    formatDifferences(writable, this.stackDiff.diff);

    output.push('');
    output.push('```shell');
    output.push(writable.data);
    output.push('```');
    output.push('</details>');
    output.push('');

    return output.join('\n');
  }

  private getEmoji(changes: ChangeDetails): string {
    if (changes.destructiveChanges.length || changes.removedResources) {
      return ':x:';
    } else if (changes.updatedResources) {
      return ':yellow_circle:';
    } else if (changes.createdResources) {
      return ':sparkle:';
    }
    return ':white_check_mark:';
  }
}
