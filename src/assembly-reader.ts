import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { ICloudAssemblySource, IReadableCloudAssembly, Toolkit } from '@aws-cdk/toolkit-lib';
import * as glob from 'glob-promise';

export interface AssemblyReaderOptions {
  readonly checkVersion?: boolean;
}

export class AssemblyReader {
  public static async fromPath(toolkit: Toolkit, path: string): Promise<AssemblyReader> {
    const assemblyReader = new AssemblyReader(toolkit, path);

    await assemblyReader.loadAssembly();

    return assemblyReader;
  }

  public readonly tmpdir: string;
  private _cloudAssembly?: IReadableCloudAssembly;
  private _cloudAssemblySource?: ICloudAssemblySource;

  constructor(
    private toolkit: Toolkit,
    public readonly assemblyPath: string,
    private options: AssemblyReaderOptions = { checkVersion: false },
  ) {
    // Create a temporary directory
    this.tmpdir = fs.mkdtempSync(`${os.tmpdir()}/assembly-reader`);
  }

  get cloudAssembly(): IReadableCloudAssembly {
    if (!this._cloudAssembly) {
      throw new Error('Cloud assembly source not loaded');
    }

    return this._cloudAssembly;
  }

  get cloudAssemblySource(): ICloudAssemblySource {
    if (!this._cloudAssemblySource) {
      throw new Error('Cloud assembly source not loaded');
    }

    return this._cloudAssemblySource;
  }

  /**
   * Get the stacks from the manifest
   * returns a map of artifactId to CloudFormation template
   */
  public get stacks() {
    const cloudAssembly = this.cloudAssembly.cloudAssembly;

    return cloudAssembly.stacksRecursively.map((stack) => stack.id);
  }

  public async loadAssembly() {
    if (this._cloudAssemblySource) {
      throw new Error('Cloud assembly source already loaded');
    }

    const stackTemplatesFiles = await glob.promise(`${this.assemblyPath}/*.template.json`);
    const assemblyTemplateFiles = await glob.promise(`${this.assemblyPath}/*/*.template.json`);

    //
    fs.writeFileSync(`${this.tmpdir}/manifest.json`, JSON.stringify(await this.generateManifest(), null, 2));
    this.createSymlinks(stackTemplatesFiles, assemblyTemplateFiles);

    this._cloudAssemblySource = await this.getAssembly(this.tmpdir);
    this._cloudAssembly = await this._cloudAssemblySource.produce();

    return {};
  }

  async generateManifest() {
    const existingManifest = JSON.parse(fs.readFileSync(`${this.assemblyPath}/manifest.json`, 'utf-8'));
    const cloudAssemblySource = await this.getAssembly(this.assemblyPath);
    const cloudAssembly = await cloudAssemblySource.produce();

    const artifacts: Record<string, object> = {};
    for (const stack of cloudAssembly.cloudAssembly.stacksRecursively) {
      const environment = stack.environment;

      artifacts[stack.id] = {
        type: 'aws:cloudformation:stack',
        environment: `aws://${environment.account}/${environment.region}`,
        properties: {
          id: stack.id,
          stackName: stack.id,
          environment: environment,
          templateFile: stack.templateFile,
        },
      };

      const stackTemplates = await glob.promise(`${this.assemblyPath}/assembly-${stack.id}*/*.template.json`, {});

      if (stackTemplates.length > 1) {
        for (const nestedStackTemplate of stackTemplates) {
          const nestedAssemblyDirectoryName = path.basename(path.dirname(nestedStackTemplate));
          const nestedStackTemplatePath = path.join(nestedAssemblyDirectoryName, path.basename(nestedStackTemplate));
          const nestedStackName = path.basename(nestedStackTemplate, '.template.json');

          artifacts[nestedStackName] = {
            type: 'aws:cloudformation:stack',
            environment: `aws://${environment.account}/${environment.region}`,
            properties: {
              id: nestedStackName,
              stackName: nestedStackName,
              environment: environment,
              // templateFile: `${nestedStack.id}.template.json`,
              templateFile: nestedStackTemplatePath,
            },
          };
        }
      }
    }

    console.log('Artifacts', JSON.stringify(artifacts, null, 2));

    return {
      version: existingManifest.version,
      artifacts,
    };
  }

  private async getAssembly(assemblyPath: string): Promise<ICloudAssemblySource> {
    return this.toolkit.fromAssemblyDirectory(assemblyPath, {
      loadAssemblyOptions: { checkVersion: this.options.checkVersion },
    });
  }

  private createSymlinks(stackTemplatesFiles: string[], assemblyTemplateFiles: string[]) {
    for (const templateFile of stackTemplatesFiles) {
      fs.symlinkSync(templateFile, path.join(this.tmpdir, path.basename(templateFile)), 'file');
    }

    for (const templateFile of assemblyTemplateFiles) {
      const targetPath = path.join(this.tmpdir, path.basename(path.dirname(templateFile)), path.basename(templateFile));
      const fullTemplateFile = path.join(this.assemblyPath, path.basename(templateFile));

      console.log('Creating symlink', targetPath, '->', fullTemplateFile);

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      fs.symlinkSync(fullTemplateFile, targetPath, 'file');
    }
  }
}
