import * as crypto from 'node:crypto';
import { Writable, WritableOptions } from 'stream';
import { StringDecoder } from 'string_decoder';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { StackDiffInfo } from './stack-diff';

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
    let body = [
      `<!-- cdk diff action with id ${this.id} ${this.hash} -->`,
      this.content,
      '',
      `_Generated for commit ${this.commitSha}_`,
    ].join('\n');

    if (body.length > MAX_COMMENT_LENGTH) {
      console.log('Comment exceeds maximum length and will be truncated');
      const trailer = '!!! TRUNCATED !!!'.repeat(3);

      body = body.slice(0, MAX_COMMENT_LENGTH - trailer.length) + trailer;
    }

    const payload = {
      ...github.context.repo,
      body,
    };

    const commentId = await this.findPreviousComment();

    if (!commentId) {
      await this.octokit.rest.issues.createComment({ ...payload, issue_number: this.issueNumber });
    } else {
      await this.octokit.rest.issues.updateComment({ ...payload, comment_id: commentId });
    }
  }

  public getDiffSummary(diff: StackDiffInfo): string {
    const segments: string[] = [];

    if (diff.changes.createdResources > 0) {
      segments.push(`:sparkle: ${diff.changes.createdResources} to add`);
    }

    if (diff.changes.updatedResources > 0) {
      segments.push(`:yellow_circle: ${diff.changes.updatedResources} to update`);
    }

    if (diff.changes.removedResources > 0) {
      segments.push(`:x: ${diff.changes.removedResources} to destroy`);
    }

    if (diff.diff.securityGroupChanges.hasChanges) {
      segments.push(`:lock: Security group changes detected`);
    }

    if (diff.diff.iamChanges.hasChanges) {
      segments.push(`:lock: IAM changes detected`);
    }

    if (!diff.changes.createdResources && !diff.changes.updatedResources && !diff.changes.removedResources) {
      segments.push(':white_check_mark: No changes');
    }

    return segments.join(', ');
  }

  private async findPreviousComment() {
    const comments = await this.octokit.rest.issues.listComments({
      ...github.context.repo,
      issue_number: this.issueNumber,
    });

    return comments.data.find((comment) => comment.body?.includes(this.hash))?.id;
  }
}
