function summarizeIpcArg(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return `[String(${value.length})]`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  if (value instanceof Error) {
    return {
      name: value.name
    };
  }
  if (typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.keys(value as Record<string, unknown>).slice(0, 20)
    };
  }
  return String(value);
}

export function summarizeIpcArgsForLogging(args: unknown[]) {
  return args.map((value) => summarizeIpcArg(value));
}

export function summarizeIpcValueForLogging(value: unknown) {
  return summarizeIpcArg(value);
}
