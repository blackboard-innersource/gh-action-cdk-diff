import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { StackDiffInfo } from './stack-diff';

export class Labeler {
  constructor(private readonly octokit: InstanceType<typeof GitHub>) {}

  public async process(stackDiffs: Record<string, StackDiffInfo | Error>) {
    // Add labels based on changes
    const hasDestructiveChanges = Object.values(stackDiffs).some(
      (diff) => !(diff instanceof Error) && diff.changes.removedResources > 0,
    );

    const hasIamChanges = Object.values(stackDiffs).some(
      (diff) => !(diff instanceof Error) && diff.diff.iamChanges.hasChanges,
    );

    const hasSecurityGroupChanges = Object.values(stackDiffs).some(
      (diff) => !(diff instanceof Error) && diff.diff.securityGroupChanges.hasChanges,
    );

    const labels = await this.getLabels();
    const labelsToDelete = new Set<string>();

    if (hasDestructiveChanges) {
      labels.add('destructive');
    } else {
      labelsToDelete.add('destructive');
    }

    if (hasIamChanges) {
      labels.add('iam');
    } else {
      labelsToDelete.add('iam');
    }

    if (hasSecurityGroupChanges) {
      labels.add('networking');
    } else {
      labelsToDelete.add('networking');
    }

    if (labels.size > 0) {
      await this.addLabels([...labels]);
    }

    if (labelsToDelete.size > 0) {
      for (const label of labelsToDelete) {
        await this.removeLabel(label);
      }
    }
  }

  public async getLabels(): Promise<Set<string>> {
    const response = await this.octokit.rest.issues.listLabelsOnIssue({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: github.context.issue.number,
    });

    return new Set(response.data.map((label) => label.name));
  }

  public async addLabels(labels: string[]) {
    await this.octokit.rest.issues.addLabels({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: github.context.issue.number,
      labels: labels,
    });
  }

  public async removeLabel(label: string) {
    try {
      await this.octokit.rest.issues.removeLabel({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        name: label,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        // Ignore 404 errors (label doesn't exist)
        if ((error as { status: number }).status !== 404) {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
}
