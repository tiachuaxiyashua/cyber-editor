import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('thinking chain navigation', () => {
  it('keeps idea map reachable from draft orchestration workspaces through commands and rail actions', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');

    const commandMatches = source.match(/id: 'view-thinking-chain'[\s\S]{0,240}?disabled: !\(project \|\| draftPlatform\)/g) ?? [];

    expect(commandMatches.length).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(/const openThinkingMap = \(\) => \{\s+if \(!project\) return;/);
    expect(source).toMatch(/const openFlowOrchestration = \(\) => \{\s+if \(!\(project \|\| draftPlatform\)\) return;/);
    expect(source).toMatch(/<ActivityButton[\s\S]{0,240}?onClick=\{openThinkingMap\}[\s\S]{0,120}?disabled=\{!project\}/);
    expect(source).toMatch(
      /<ActivityButton[\s\S]{0,240}?onClick=\{openFlowOrchestration\}[\s\S]{0,120}?disabled=\{\!\(project \|\| draftPlatform\)\}/
    );
    expect(source).toContain("layout.activityView === 'thinking-chain'");
    expect(source).toContain("layout.activityView === 'orchestration'");
  });
});
