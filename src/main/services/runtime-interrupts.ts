import type { RuntimeCheckpoint, RuntimeRun } from '../../shared/types';

export class RuntimePauseSignal extends Error {
  constructor(
    public readonly run: RuntimeRun,
    public readonly checkpoint: RuntimeCheckpoint
  ) {
    super(`Run ${run.id} paused at checkpoint ${checkpoint.id}`);
    this.name = 'RuntimePauseSignal';
  }
}

export function isRuntimePauseSignal(value: unknown): value is RuntimePauseSignal {
  return value instanceof RuntimePauseSignal;
}
