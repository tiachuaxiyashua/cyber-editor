export type PackagedAppInfo = {
  appPath: string;
  name: string;
  parent: string;
};

export type ClearOutputDirectoryDependencies = {
  removeDirectory?: (directoryPath: string) => void;
  exists?: (directoryPath: string) => boolean;
  findLockingProcesses?: (directoryPath: string) => Array<{
    name?: string;
    pid?: number;
    path?: string;
  }>;
};

export function clearOutputDirectory(targetDir: string, dependencies?: ClearOutputDirectoryDependencies): void;
export function packageApp(rawOptions?: Record<string, string | boolean>): Promise<PackagedAppInfo[]>;
