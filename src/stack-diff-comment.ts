import { Writable, WritableOptions } from 'stream';
import { StringDecoder } from 'string_decoder';
import { formatDifferences } from '@aws-cdk/cloudformation-diff';
import { Comment } from './comment';
import { StackDiffInfo } from './stack-diff';

export class StackDiffComment extends Comment {
  constructor(
    private readonly stackName: string,
    private readonly stackDiff: StackDiffInfo,
  ) {
    super();
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
        `#### ${emoji} Diff for stack ***${this.stackName}***: ${this.getDiffSummary([this.stackDiff]).join(', ')} `,
        '<details>',
        '<summary>Details</summary>',
        '',
      ],
    );

    if (this.stackDiff.changes.destructiveChanges.length) {
      output.push('> [!WARNING]\n> ***Destructive Changes*** :bangbang:');
      output.push('');

      this.stackDiff.changes.destructiveChanges.forEach((change) => {
        output.push(
          `> **Stack: ${change.stackName} - Resource: ${change.logicalId} - Impact:** ***${change.impact}***`,
          '',
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
}

export class StringWritable extends Writable {
  public data: string;
  private _decoder: StringDecoder;

  constructor(options: WritableOptions) {
    super(options);
    this._decoder = new StringDecoder();
    this.data = '';
  }

  _write(chunk: string, encoding: string, callback: (error?: Error | null) => void): void {
    if (encoding === 'buffer') {
      chunk = this._decoder.write(chunk);
    }

    this.data += chunk;
    callback();
  }

  _final(callback: (error?: Error | null) => void): void {
    this.data += this._decoder.end();
    callback();
  }
}
