import * as crypto from 'node:crypto';
import { Writable, WritableOptions } from 'stream';
import { StringDecoder } from 'string_decoder';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { ChangeDetails, StackDiffInfo } from './stack-diff';

const MAX_COMMENT_LENGTH = 65536;

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

    if (this.data.length > MAX_COMMENT_LENGTH) {
      console.log('Comment exceeds maximum length');
    }

    callback();
  }
}

export abstract class Comment {
  protected constructor(private readonly octokit: InstanceType<typeof GitHub>) {}

  abstract get id(): string;

  abstract get content(): string;

  get issueNumber() {
    const issueNumber = github.context.payload.pull_request?.number;
    if (!issueNumber) {
      throw new Error('No pull request number found in context');
    }

    return issueNumber;
  }

  get commitSha() {
    const commitSha = github.context.payload.pull_request?.head.sha;
    if (!commitSha) {
      throw new Error('No commit SHA found in context');
    }

    return commitSha;
  }

  get hash() {
    return crypto.createHash('sha256').update(this.content).digest('hex');
  }

  public async updatePullRequest(): Promise<void> {
    let body = [`<!-- cdk diff action with id ${this.id} ${this.hash} -->`, this.content, ''].join('\n');

    const generatedMessage = `_Generated for commit ${this.commitSha}_`;

    if (body.length > MAX_COMMENT_LENGTH) {
      console.log('Comment exceeds maximum length and will be truncated');
      const trailer = '!!! TRUNCATED !!!'.repeat(3);

      body = body.slice(0, MAX_COMMENT_LENGTH - trailer.length - generatedMessage.length - 2) + trailer;
    }

    const payload = {
      ...github.context.repo,
      body: `${body}\n${generatedMessage}`,
    };

    const commentId = await this.findPreviousComment();

    if (!commentId) {
      await this.octokit.rest.issues.createComment({ ...payload, issue_number: this.issueNumber });
    } else {
      await this.octokit.rest.issues.updateComment({ ...payload, comment_id: commentId });
    }
  }

  public getDiffSummary(diff: StackDiffInfo[]): string[] {
    const segments: string[] = [];

    let createdResources = 0;
    let updatedResources = 0;
    let removedResources = 0;
    let hasChanges = false;
    let securityGroupChanges = 0;
    let iamChanges = 0;
    for (const d of diff) {
      createdResources += d.changes.createdResources;
      updatedResources += d.changes.updatedResources;
      removedResources += d.changes.removedResources;
      hasChanges = hasChanges || d.changes.hasChanges;
      securityGroupChanges += d.diff.securityGroupChanges.hasChanges ? 1 : 0;
      iamChanges += d.diff.iamChanges.hasChanges ? 1 : 0;
    }
    if (createdResources > 0) {
      segments.push(`:sparkle: ${createdResources} to add`);
    }

    if (updatedResources > 0) {
      segments.push(`:yellow_circle: ${updatedResources} to update`);
    }

    if (removedResources > 0) {
      segments.push(`:x: ${removedResources} to destroy`);
    }

    if (securityGroupChanges) {
      segments.push(`:lock: Security group changes detected`);
    }

    if (iamChanges) {
      segments.push(`:lock: IAM changes detected`);
    }

    if (!createdResources && !updatedResources && !removedResources) {
      segments.push(':white_check_mark: No changes');
    }

    return segments;
  }

  protected getEmoji(changes: ChangeDetails): string {
    if (changes.destructiveChanges.length || changes.removedResources) {
      return ':boom:';
    } else if (changes.updatedResources) {
      return ':yellow_circle:';
    } else if (changes.createdResources) {
      return ':white_check_mark:';
    }
    return ':green_apple:';
  }

  private async findPreviousComment() {
    const comments = await this.octokit.rest.issues.listComments({
      ...github.context.repo,
      issue_number: this.issueNumber,
    });

    return comments.data.find((comment) => comment.body?.includes(this.hash))?.id;
  }
}
