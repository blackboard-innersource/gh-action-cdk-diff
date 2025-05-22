import { Comment } from './comment';

export class CommentUpdater {
  constructor(private comments: Comment[]) {}

  public async updateComments() {
    const hasGithubContext = !!process.env.GITHUB_REPOSITORY;

    if (!hasGithubContext) {
      console.error('No GitHub context found. Cannot update pull request.');
    }

    for (const comment of this.comments) {
      if (hasGithubContext) {
        await comment.updatePullRequest();
      } else {
        console.debug(comment.content);
      }
    }
  }
}
