import { GitHub } from '@actions/github/lib/utils';
import { Comment } from './comment';
import { StackDiffInfo } from './stack-diff';

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

    output.push(...['<details>', '<summary>Summary of changes</summary>', '</details>']);
    for (const [stackName, diff] of stackDiffs) {
      if (!(diff instanceof Error)) {
        output.push(...[`***${diff.stackName}:*** ` + this.getDiffSummary(diff)]);
      } else {
        output.push(...[`***${stackName}:***: Error: ${diff.message}`]);
      }
    }
    output.push('</details>');
    output.push('');

    return output.join('\n');
  }
}
