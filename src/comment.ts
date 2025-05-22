import * as crypto from 'node:crypto';
import * as github from '@actions/github';
import { ChangeDetails, StackDiffInfo } from './stack-diff';

export abstract class Comment {
  protected constructor() {}

  abstract get id(): string;

  abstract get content(): string;

  get issueNumber() {
    const issueNumber = github.context.payload.pull_request?.number;
    if (!issueNumber) {
      throw new Error('No pull request number found in context');
    }

    return issueNumber;
  }

  get hash() {
    return crypto.createHash('sha1').update(this.id).digest('hex');
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
}
