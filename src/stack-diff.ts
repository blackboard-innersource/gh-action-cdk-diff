import * as core from '@actions/core';
import {
  DifferenceCollection,
  PropertyDifference,
  ResourceDifference,
  ResourceImpact,
  TemplateDiff,
} from '@aws-cdk/cloudformation-diff';
import { CloudFormationStackArtifact } from '@aws-cdk/cx-api';
import { DiffMethod, ExpandStackSelection, StackSelectionStrategy, Toolkit } from '@aws-cdk/toolkit-lib';
import { diffLines } from 'diff';
import { AssemblyReader } from './assembly-reader';

export interface StackDiffInfo {
  /**
   * The name of the stack
   */
  stackName: string;

  /**
   * The template diff for the stack
   */
  diff: TemplateDiff;

  changes: ChangeDetails;
}

/**
 * Details on what changes are occurring in this stack
 */
export interface ChangeDetails {
  /**
   * The number of resources that are being updated
   */
  updatedResources: number;

  /**
   * The number of resources that are being removed
   */
  removedResources: number;

  /**
   * The number of resources that are being created
   */
  createdResources: number;

  /**
   * Information on any destructive changes
   */
  destructiveChanges: DestructiveChange[];

  /**
   * Returns true if there are changes.
   */
  hasChanges: boolean;
}

/**
 * Information on any destructive changes
 */
export interface DestructiveChange {
  /**
   * The logicalId of the resource with a destructive change
   */
  readonly logicalId: string;

  /**
   * The name of the stack that contains the destructive change
   */
  readonly stackName: string;

  /**
   * The impact of the destructive change
   */
  readonly impact: ResourceImpact;
}

export class StackDiff {
  constructor(
    private toolkit: Toolkit,
    private readonly stack: CloudFormationStackArtifact,
    private readonly headAssembly: AssemblyReader,
    private readonly baseAssembly: AssemblyReader,
  ) {}

  public async diff(skipProperties?: string[], ignoreAssetOnlyChanges?: boolean): Promise<StackDiffInfo> {
    const stackName = this.stack.id;

    const headStack = this.headAssembly.cloudAssembly.cloudAssembly.getStackByName(stackName);
    if (!headStack) {
      throw new Error(`Stack ${stackName} not found in head assembly`);
    }

    const baseStack = this.baseAssembly.cloudAssembly.cloudAssembly.getStackByName(stackName);
    if (!baseStack) {
      throw new Error(`Stack ${stackName} not found in base assembly`);
    }

    const diffResults = await this.toolkit.diff(this.headAssembly.cloudAssemblySource, {
      method: DiffMethod.LocalFile(baseStack.templateFullPath),
      stacks: {
        expand: ExpandStackSelection.NONE,
        strategy: StackSelectionStrategy.PATTERN_MUST_MATCH_SINGLE,
        patterns: [this.stack.id],
        failOnEmpty: true,
      },
    });

    const changes: ChangeDetails = {
      createdResources: 0,
      removedResources: 0,
      updatedResources: 0,
      destructiveChanges: [],
      hasChanges: false,
    };

    const stackDiff = diffResults[stackName];

    if (!stackDiff) {
      core.info(`Diff for ${stackName} is\n${diffResults}`);
      throw new Error(`No diff found for stack: ${stackName}`);
    }

    const filteredResources = this.filterResources(stackDiff, skipProperties, ignoreAssetOnlyChanges);
    stackDiff.resources = new DifferenceCollection(filteredResources);

    // go through all the resource differences and check for any
    // "destructive" changes
    diffResults[stackName].resources.forEachDifference((logicalId: string, change: ResourceDifference) => {
      // if the change is a removal it will not show up as a 'changeImpact'
      // so need to check for it separately, unless it is a resourceType that
      // has been "allowed" to be destroyed
      const resourceType = change.oldValue?.Type ?? change.newValue?.Type;

      let keys: string[] = [];
      switch (resourceType) {
        case 'AWS::CDK::Metadata':
          return;
        case 'AWS::Lambda::Function':
          keys = Object.keys(change.propertyUpdates);
          if ((keys.length <= 2 && keys.includes('Code')) || keys.includes('Metadata')) {
            return;
          }
          break;
        case 'AWS::StepFunctions::StateMachine':
          break;
      }

      if (change.isUpdate) {
        changes.updatedResources += 1;
      } else if (change.isRemoval) {
        changes.removedResources += 1;
      } else if (change.isAddition) {
        changes.createdResources += 1;
      }

      // if (resourceType && this.allowedDestroyTypes.includes(resourceType)) {
      //   return;
      // }

      if (change.isRemoval) {
        changes.destructiveChanges.push({
          impact: ResourceImpact.WILL_DESTROY,
          logicalId,
          stackName: stackName,
        });
      } else {
        switch (change.changeImpact) {
          case ResourceImpact.MAY_REPLACE:
          case ResourceImpact.WILL_ORPHAN:
          case ResourceImpact.WILL_DESTROY:
          case ResourceImpact.WILL_REPLACE:
            changes.destructiveChanges.push({
              impact: change.changeImpact,
              logicalId,
              stackName: stackName,
            });
            break;
        }
      }
    });

    if (changes.createdResources > 0 && changes.updatedResources > 0 && changes.removedResources > 0) {
      changes.hasChanges = true;
    }

    return { changes, diff: stackDiff, stackName: stackName };
  }

  private filterResources(templateDiff: TemplateDiff, skipProperties?: string[], ignoreAssetOnlyChanges?: boolean) {
    const filteredResources: {
      [logicalId: string]: ResourceDifference;
    } = {};

    const skipProps =
      skipProperties?.reduce(
        (acc, prop) => {
          const propName = prop.split('.')[0];
          const propValue = prop.split('.')[1];

          acc[propName] ??= [];
          acc[propName].push(propValue);

          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? {};

    for (const [id, resource] of Object.entries(templateDiff.resources.changes)) {
      if (resource.resourceType === 'AWS::Lambda::Function') {
        const propertyUpdates = Object.entries(resource.propertyUpdates)
          .filter((prop) => prop[1].isDifferent)
          .map((prop) => prop[0]);

        if (propertyUpdates.length === 1 && propertyUpdates.includes('Code')) {
          continue;
        }
      }

      if (resource.resourceType === 'AWS::StepFunctions::StateMachine') {
        if (resource.propertyUpdates.DefinitionString?.isDifferent) {
          if (
            ignoreAssetOnlyChanges &&
            this.changeHasOnlyAssetChanges(
              resource.propertyUpdates.DefinitionString.oldValue,
              resource.propertyUpdates.DefinitionString.newValue,
            )
          ) {
            core.debug(`Skipping state machine diff, only S3 object key changed`);
            continue;
          } else {
            core.debug(`State machine has differences, changeHasOnlyAssetChanges is false`);
          }
        }
      }

      const resourceType = resource.resourceType;
      if (resourceType && resource.isUpdate && Object.keys(skipProps).includes(resource.resourceType)) {
        const filteredPropertyUpdates = Object.entries(resource.propertyUpdates).filter(
          (entry) => !skipProps[resourceType].includes(entry[0]),
        );

        if (!filteredPropertyUpdates || !filteredPropertyUpdates.length) {
          core.debug(`Filtered out resource with no property updates: ${resource.resourceType}/${id}`);
          continue;
        } else {
          core.debug(`Remaining properties: ${filteredPropertyUpdates}`);
        }
      }

      filteredResources[id] = resource;
    }

    return filteredResources;
  }

  /**
   * Check if the differences between two JSON strings are only S3 key changes.
   */
  private changeHasOnlyAssetChanges(
    oldValue: PropertyDifference<string>,
    newValue: PropertyDifference<string>,
  ): boolean {
    const diffs = diffLines(JSON.stringify(oldValue ?? '', null, 2), JSON.stringify(newValue ?? '', null, 2))
      .filter((d) => d.added || d.removed)
      .map((d) => d.value.trim());

    if (!diffs || !diffs.length) {
      return false;
    }

    for (const diffLine of diffs) {
      if (diffLine.includes('cdk-hnb659fds-assets')) {
        return true;
      }
    }

    return false;
  }
}
