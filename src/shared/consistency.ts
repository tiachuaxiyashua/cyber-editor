import type { ConsistencyFinding, ProjectSummary, SessionSkillMap } from './types';

function finding(id: string, severity: ConsistencyFinding['severity'], message: string, documentPath?: string): ConsistencyFinding {
  return { id, severity, message, documentPath };
}

export function runConsistencyCheck(input: {
  project: ProjectSummary;
  requiredPaths: string[];
  projectSkillIds: string[];
  sessionSkillIds: SessionSkillMap;
  installedSkillIds: string[];
}) {
  const findings: ConsistencyFinding[] = [];
  const allTreePaths = new Set<string>();

  function walk(paths: typeof input.project.tree) {
    for (const node of paths) {
      allTreePaths.add(node.path);
      if (node.children?.length) {
        walk(node.children);
      }
    }
  }

  walk(input.project.tree);

  for (const requiredPath of input.requiredPaths) {
    if (!allTreePaths.has(requiredPath)) {
      findings.push(finding(`missing:${requiredPath}`, 'error', '缺少必需文档或目录。', requiredPath));
    }
  }

  if (input.project.workflow.activeDocumentPath && !allTreePaths.has(input.project.workflow.activeDocumentPath)) {
    findings.push(
      finding(
        'active-document-missing',
        'warning',
        '当前工作流引用的活动文档不存在，系统将回退到其他文档。',
        input.project.workflow.activeDocumentPath
      )
    );
  }

  for (const skillId of input.projectSkillIds) {
    if (!input.installedSkillIds.includes(skillId)) {
      findings.push(finding(`project-skill:${skillId}`, 'error', `项目默认 Skill 未安装：${skillId}`));
    }
  }

  for (const [sessionId, skillIds] of Object.entries(input.sessionSkillIds)) {
    for (const skillId of skillIds) {
      if (!input.installedSkillIds.includes(skillId)) {
        findings.push(finding(`session-skill:${sessionId}:${skillId}`, 'warning', `会话引用了未安装 Skill：${skillId}`));
      }
    }
  }

  if (!input.project.workflow.confirmedStages.length) {
    findings.push(finding('no-confirmed-stage', 'info', '当前还没有已确认阶段。'));
  }

  return findings;
}
