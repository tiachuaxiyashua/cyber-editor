import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  ArtifactSchemaAsset,
  RuntimeExportFormat,
  RuntimeTemplateAsset,
  RuntimeTemplateExportMappingEntry
} from '../../shared/types';
import { validateArtifact } from '../../shared/artifact-validators';
import { resolveRuntimeExportMapping } from '../../shared/runtime-template';
import { ArtifactGovernanceService } from './artifact-governance-service';
import { ProjectService } from './project-service';
import { resolveOpenSpecWorkspaceRoot } from './runtime-template-contracts';

type ExportableArtifact = {
  stage: string;
  title: string;
  relativePath: string;
  absolutePath: string;
  content: string;
  schema: ArtifactSchemaAsset;
};

type ExportPackageResult = {
  exportRoot: string;
  markdownPath: string | null;
  textPath: string | null;
  pdfPath: string | null;
  openspecRoot: string | null;
  customPaths: string[];
  manifestPath: string;
};

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function compactTimestampToken(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugifySegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'artifact';
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '- ')
    .replace(/`{3}[\s\S]*?`{3}/g, (block) => block.replace(/`/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function applyTokenPattern(
  pattern: string,
  input: {
    format: RuntimeExportFormat;
    index?: number;
    templateId: string;
    artifact?: ExportableArtifact;
    timestamp: string;
  }
) {
  return pattern
    .replaceAll('{format}', input.format)
    .replaceAll('{index}', `${input.index ?? 1}`)
    .replaceAll('{templateId}', input.templateId)
    .replaceAll('{timestamp}', input.timestamp)
    .replaceAll('{artifact}', input.artifact ? slugifySegment(path.basename(input.artifact.relativePath, path.extname(input.artifact.relativePath))) : 'artifact')
    .replaceAll('{stage}', input.artifact ? input.artifact.stage : 'stage')
    .replaceAll('{title}', input.artifact ? slugifySegment(input.artifact.title) : 'item');
}

function normalizeRelativeExportPattern(pattern: string, workspaceRoot: string) {
  const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const normalizedWorkspaceRoot = workspaceRoot.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  let relative = normalizedPattern;

  if (normalizedWorkspaceRoot && (relative === normalizedWorkspaceRoot || relative.startsWith(`${normalizedWorkspaceRoot}/`))) {
    relative = relative.slice(normalizedWorkspaceRoot.length).replace(/^\/+/, '');
  }

  if (relative === 'exports') {
    return '';
  }
  if (relative.startsWith('exports/')) {
    return relative.slice('exports/'.length);
  }
  return relative;
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  let inCodeBlock = false;
  const html: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      html.push(inCodeBlock ? '</pre>' : '<pre class="code-block">');
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      html.push(`${escapeHtml(rawLine)}\n`);
      continue;
    }
    if (!line) {
      html.push('<div class="spacer"></div>');
      continue;
    }
    if (line.startsWith('### ')) {
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      html.push(`<p class="bullet">- ${escapeHtml(line.slice(2))}</p>`);
      continue;
    }
    html.push(`<p>${escapeHtml(line)}</p>`);
  }
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    '<style>',
    'body { font-family: "Microsoft YaHei UI", "PingFang SC", sans-serif; color: #1f2328; margin: 40px; line-height: 1.6; }',
    'h1,h2,h3 { margin: 20px 0 12px; }',
    'p { margin: 0 0 10px; }',
    '.bullet { padding-left: 8px; }',
    '.spacer { height: 10px; }',
    '.code-block { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 10px; padding: 12px; white-space: pre-wrap; }',
    '</style>',
    '</head>',
    '<body>',
    ...html,
    '</body>',
    '</html>'
  ].join('');
}

function copyRecursive(sourcePath: string, targetPath: string) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    ensureDir(targetPath);
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyRecursive(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

export class DeliveryExportService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly artifactGovernance = new ArtifactGovernanceService()
  ) {}

  private collectArtifacts(rootPath: string, template: RuntimeTemplateAsset, schemaMap: Map<string, ArtifactSchemaAsset>) {
    const workflow = this.projectService.loadWorkflow(rootPath);
    const confirmed = new Set(workflow.confirmedStages);
    const artifacts: ExportableArtifact[] = [];
    for (const [stage, documents] of Object.entries(template.stageDocuments)) {
      for (const document of documents) {
        const absolutePath = path.join(rootPath, document.path);
        if (!fs.existsSync(absolutePath)) continue;
        if (
          !confirmed.has(stage as typeof workflow.stage)
          && stage !== workflow.stage
          && stage !== 'draft'
          && stage !== 'review'
          && stage !== 'finalize'
        ) {
          continue;
        }
        const schema = schemaMap.get(document.validatorId);
        if (!schema) {
          throw new Error(`缺少导出校验器：${document.validatorId}`);
        }
        const content = this.projectService.readFile(absolutePath);
        const validation = validateArtifact(content, schema, {
          qualityTier: document.qualityTier ?? schema.qualityTier,
          minimumQualityScore: document.minimumQualityScore ?? schema.minimumQualityScore
        });
        if (!validation.ok) {
          throw new Error(`导出前校验失败：${document.title} - ${validation.message}`);
        }
        artifacts.push({
          stage,
          title: document.title,
          relativePath: document.path.replace(/\\/g, '/'),
          absolutePath,
          content: validation.normalized ?? content,
          schema
        });
      }
    }
    return artifacts;
  }

  private buildMarkdownBundle(template: RuntimeTemplateAsset, changeName: string, artifacts: ExportableArtifact[]) {
    const sections: string[] = [
      `# ${template.name} 交付包`,
      '',
      `- 生成时间：${new Date().toISOString()}`,
      `- 模板：${template.name}`,
      `- OpenSpec Change：${changeName}`,
      ''
    ];
    for (const artifact of artifacts) {
      sections.push(`## ${artifact.title}`);
      sections.push('');
      sections.push(`- 阶段：${artifact.stage}`);
      sections.push(`- 路径：${artifact.relativePath}`);
      sections.push('');
      sections.push(artifact.content.trim());
      sections.push('');
    }
    return `${sections.join('\n')}\n`;
  }

  private filterArtifacts(artifacts: ExportableArtifact[], mapping: RuntimeTemplateExportMappingEntry) {
    const allowed = new Set(mapping.artifactPaths);
    if (!allowed.size) {
      return artifacts;
    }
    return artifacts.filter((artifact) => allowed.has(artifact.relativePath));
  }

  private resolveOutputRoot(
    exportRoot: string,
    workspaceRoot: string,
    mapping: RuntimeTemplateExportMappingEntry,
    format: RuntimeExportFormat,
    templateId: string,
    timestamp: string
  ) {
    const outputPattern = applyTokenPattern(mapping.outputPathPattern?.trim() || format, {
      format,
      templateId,
      timestamp
    });
    const relativePattern = normalizeRelativeExportPattern(outputPattern, workspaceRoot);
    return relativePattern ? path.join(exportRoot, relativePattern) : exportRoot;
  }

  private resolveOutputFileName(
    mapping: RuntimeTemplateExportMappingEntry,
    format: RuntimeExportFormat,
    templateId: string,
    timestamp: string,
    artifact?: ExportableArtifact,
    index?: number
  ) {
    return applyTokenPattern(mapping.fileNamePattern?.trim() || `${format}.out`, {
      format,
      index,
      templateId,
      artifact,
      timestamp
    });
  }

  private async renderPdf(filePath: string, markdownContent: string) {
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-export-'));
    const htmlPath = path.join(tempRoot, 'delivery-package.html');
    try {
      const html = markdownToHtml(markdownContent);
      writeText(htmlPath, html);
      await window.loadFile(htmlPath);
      await window.webContents.executeJavaScript(
        'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
        true
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      let pdf: Buffer | null = null;
      let lastError: unknown;
      for (let attempt = 0; attempt < 2 && !pdf; attempt += 1) {
        try {
          pdf = await window.webContents.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            margins: {
              top: 0.4,
              bottom: 0.4,
              left: 0.45,
              right: 0.45
            }
          });
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
      if (!pdf) {
        throw lastError instanceof Error ? lastError : new Error('PDF 渲染失败');
      }
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, pdf);
    } finally {
      if (!window.isDestroyed()) {
        window.destroy();
      }
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  async exportDeterministicPackage(input: {
    rootPath: string;
    template: RuntimeTemplateAsset;
    artifactSchemas: ArtifactSchemaAsset[];
    changeName: string;
    changeRoot: string;
    roadmapPath: string;
  }): Promise<ExportPackageResult> {
    const blockers = this.artifactGovernance.listExportBlockers(input.rootPath);
    if (blockers.length) {
      this.artifactGovernance.persistExportBlock(input.rootPath, blockers);
      throw new Error(`Export blocked by invalidated artifacts: ${blockers.map((item) => item.artifactPath).join(', ')}`);
    }
    const workspaceRoot = resolveOpenSpecWorkspaceRoot(input.template);
    const exportRoot = path.join(
      input.rootPath,
      workspaceRoot,
      'exports',
      compactTimestampToken()
    );
    ensureDir(exportRoot);
    const schemaMap = new Map(input.artifactSchemas.map((schema) => [schema.id, schema]));
    const artifacts = this.collectArtifacts(input.rootPath, input.template, schemaMap);
    const exportMapping = resolveRuntimeExportMapping(input.template);
    const timestamp = compactTimestampToken();

    let markdownPath: string | null = null;
    let textPath: string | null = null;
    let pdfPath: string | null = null;
    let openspecRoot: string | null = null;
    const customPaths: string[] = [];

    for (const format of Object.keys(exportMapping) as RuntimeExportFormat[]) {
      const mapping = exportMapping[format];
      if (!mapping.enabled) continue;
      const selectedArtifacts = this.filterArtifacts(artifacts, mapping);
      if (!selectedArtifacts.length && format !== 'openspec') continue;

      const targetRoot = this.resolveOutputRoot(exportRoot, workspaceRoot, mapping, format, input.template.id, timestamp);
      ensureDir(targetRoot);

      if (format === 'markdown') {
        const filePath = path.join(
          targetRoot,
          this.resolveOutputFileName(mapping, format, input.template.id, timestamp)
        );
        writeText(filePath, this.buildMarkdownBundle(input.template, input.changeName, selectedArtifacts));
        markdownPath = filePath;
        continue;
      }

      if (format === 'text') {
        const filePath = path.join(
          targetRoot,
          this.resolveOutputFileName(mapping, format, input.template.id, timestamp)
        );
        writeText(filePath, stripMarkdown(this.buildMarkdownBundle(input.template, input.changeName, selectedArtifacts)));
        textPath = filePath;
        continue;
      }

      if (format === 'pdf') {
        const filePath = path.join(
          targetRoot,
          this.resolveOutputFileName(mapping, format, input.template.id, timestamp)
        );
        await this.renderPdf(filePath, this.buildMarkdownBundle(input.template, input.changeName, selectedArtifacts));
        pdfPath = filePath;
        continue;
      }

      if (format === 'openspec') {
        const bundleRoot = path.join(
          targetRoot,
          this.resolveOutputFileName(mapping, format, input.template.id, timestamp)
        );
        copyRecursive(input.roadmapPath, path.join(bundleRoot, 'roadmap.md'));
        copyRecursive(input.changeRoot, path.join(bundleRoot, 'changes', input.changeName));
        openspecRoot = bundleRoot;
        continue;
      }

      for (const [index, artifact] of selectedArtifacts.entries()) {
        const filePath = path.join(
          targetRoot,
          this.resolveOutputFileName(mapping, format, input.template.id, timestamp, artifact, index + 1)
        );
        writeText(filePath, artifact.content);
        customPaths.push(filePath);
      }
    }

    const manifestPath = path.join(exportRoot, 'manifest.json');
    writeText(
      manifestPath,
      JSON.stringify(
        {
          templateId: input.template.id,
          changeName: input.changeName,
          artifacts: artifacts.map((artifact) => ({
            stage: artifact.stage,
            title: artifact.title,
            path: artifact.relativePath
          })),
          exports: {
            markdownPath,
            textPath,
            pdfPath,
            openspecRoot,
            customPaths
          }
        },
        null,
        2
      )
    );

    return {
      exportRoot,
      markdownPath,
      textPath,
      pdfPath,
      openspecRoot,
      customPaths,
      manifestPath
    };
  }
}
