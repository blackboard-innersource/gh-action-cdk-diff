import { info } from '@actions/core';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { Comment } from './comment';

const MAX_COMMENT_LENGTH = 65536;

export class CommentUpdater {
  private issueNumber: number;
  constructor(
    private readonly octokit: InstanceType<typeof GitHub>,
    private comments: Comment[],
  ) {
    const issueNumber = github.context.payload.pull_request?.number;

    if (!issueNumber) {
      throw new Error('No pull request number found in context');
    }

    this.issueNumber = issueNumber;
  }

  public async updateComments() {
    const hasGithubContext = !!process.env.GITHUB_REPOSITORY;

    if (!hasGithubContext) {
      console.error('No GitHub context found. Cannot update pull request.');
    }

    for (const comment of this.comments) {
      if (hasGithubContext) {
        await this.updatePullRequest(comment);
      } else {
        console.debug(comment.content);
      }
    }
  }

  /**
   * Combines the comments into one or more PR comments.
   */
  public combineCommentBodies(comments: Comment[]): string[] {
    const commentBodies: string[] = [];

    let body: string = '';
    for (const comment of comments) {
      const commentContent = comment.content;

      if ((body + commentContent).length < MAX_COMMENT_LENGTH) {
        body += commentContent;
      } else {
        commentBodies.push(body);
        body = '';
      }
    }

    return commentBodies;
  }

  public async updatePullRequest(comment: Comment): Promise<void> {
    let body = [`<!-- cdk diff action with id ${comment.id} ${comment.hash} -->`, comment.content, ''].join('\n');

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

    const commentId = await this.findPreviousComment(comment);

    if (!commentId) {
      info(`No previous comment found, creating a new one`);
      await this.octokit.rest.issues.createComment({ ...payload, issue_number: this.issueNumber });
    } else {
      info(`Updating existing comment with ID ${commentId}`);
      await this.octokit.rest.issues.updateComment({ ...payload, comment_id: commentId });
    }
  }

  get commitSha() {
    const commitSha = github.context.payload.pull_request?.head.sha;
    if (!commitSha) {
      throw new Error('No commit SHA found in context');
    }

    return commitSha;
  }

  private async findPreviousComment(comment: Comment) {
    const comments = await this.octokit.rest.issues.listComments({
      ...github.context.repo,
      issue_number: this.issueNumber,
    });

    return comments.data.find((gcomment) => gcomment.body?.includes(comment.hash))?.id;
  }
}
