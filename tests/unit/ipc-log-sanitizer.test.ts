import { describe, expect, it } from 'vitest';
import { summarizeIpcArgsForLogging } from '../../src/main/ipc-log-sanitizer.js';

describe('ipc log sanitizer', () => {
  it('replaces raw strings, arrays, and object values with structural summaries', () => {
    expect(summarizeIpcArgsForLogging([
      'private draft body',
      {
        contents: '# Secret Plan',
        nested: {
          token: 'sensitive-token'
        },
        approved: true
      },
      ['alpha', 'beta', 'gamma']
    ])).toEqual([
      '[String(18)]',
      {
        type: 'object',
        keys: ['contents', 'nested', 'approved']
      },
      '[Array(3)]'
    ]);
  });

  it('keeps scalar diagnostics but suppresses error messages that may echo user content', () => {
    expect(summarizeIpcArgsForLogging([
      42,
      false,
      new Error('document contents leaked here')
    ])).toEqual([
      42,
      false,
      {
        name: 'Error'
      }
    ]);
  });
});
