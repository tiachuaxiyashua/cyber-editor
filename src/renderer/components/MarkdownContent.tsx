import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ArtifactOpenPayload } from '../../shared/types';
import { MindMapBlock } from './MindMapBlock';
import { MermaidBlock } from './MermaidBlock';
import { UiPreviewBlock } from './UiPreviewBlock';

type MarkdownContentProps = {
  value: string;
  documentPath?: string;
  onOpenArtifact?: (filePath: string) => void;
};

function isLocalArtifactTarget(target: string) {
  const normalized = target.trim();
  if (!normalized || normalized.startsWith('#')) return false;
  return !/^(https?:|mailto:|data:)/i.test(normalized);
}

function fileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

function parseWikiReference(raw: string) {
  const [target, label] = raw.split('|');
  return {
    target: target?.trim() ?? '',
    label: label?.trim() || target?.trim() || ''
  };
}

function rewriteWikiLinks(value: string) {
  const segments = value.split(/(```[\s\S]*?```)/g);
  return segments.map((segment) => {
    if (segment.startsWith('```')) return segment;
    return segment
      .replace(/!\[\[([^\]]+)\]\]/g, (_match, rawTarget: string) => {
        const parsed = parseWikiReference(rawTarget);
        return parsed.target ? `![${parsed.label}](${parsed.target})` : _match;
      })
      .replace(/\[\[([^\]]+)\]\]/g, (_match, rawTarget: string) => {
        const parsed = parseWikiReference(rawTarget);
        return parsed.target ? `[${parsed.label}](${parsed.target})` : _match;
      });
  }).join('');
}

function EmbeddedArtifact({
  documentPath,
  target,
  alt,
  onOpenArtifact
}: {
  documentPath: string;
  target: string;
  alt?: string;
  onOpenArtifact?: (filePath: string) => void;
}) {
  const [artifact, setArtifact] = useState<ArtifactOpenPayload | null>(null);

  useEffect(() => {
    let active = true;
    void window.api.openArtifact(target, documentPath).then((payload) => {
      if (active) {
        setArtifact(payload);
      }
    }).catch(() => {
      if (active) {
        setArtifact({
          kind: 'unsupported',
          filePath: target,
          title: alt || target,
          editable: false,
          binary: false,
          errorMessage: '无法加载嵌入工件。'
        });
      }
    });
    return () => {
      active = false;
    };
  }, [alt, documentPath, target]);

  if (!artifact) {
    return <div className="embedded-artifact-card">正在加载嵌入工件…</div>;
  }

  const openTarget = () => onOpenArtifact?.(artifact.filePath);

  if (artifact.errorMessage) {
    return (
      <div className="embedded-artifact-card error">
        <strong>{artifact.title}</strong>
        <span>{artifact.errorMessage}</span>
      </div>
    );
  }

  if (artifact.kind === 'image') {
    return (
      <div className="embedded-artifact-card image">
        <img src={fileUrl(artifact.filePath)} alt={alt || artifact.title} />
        {onOpenArtifact ? <button type="button" className="button-secondary" onClick={openTarget}>打开原文件</button> : null}
      </div>
    );
  }

  if (artifact.kind === 'table' && artifact.table) {
    const table = artifact.table;
    const activeSheet = table.sheets.find((sheet) => sheet.id === table.activeSheetId) ?? table.sheets[0];
    const previewRows = activeSheet?.rows.slice(0, 5) ?? [];
    return (
      <div className="embedded-artifact-card">
        <div className="embedded-artifact-header">
          <strong>{artifact.title}</strong>
          <span>{activeSheet?.name ?? 'Sheet1'}</span>
          {onOpenArtifact ? <button type="button" className="button-secondary" onClick={openTarget}>打开</button> : null}
        </div>
        <div className="embedded-table-preview">
          <table>
            <thead>
              <tr>
                {(activeSheet?.columns ?? []).slice(0, 6).map((column) => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => (
                <tr key={`${artifact.filePath}-${rowIndex}`}>
                  {row.slice(0, 6).map((cell, cellIndex) => <td key={`${artifact.filePath}-${rowIndex}-${cellIndex}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (artifact.kind === 'diagram') {
    return (
      <div className="embedded-artifact-card">
        <div className="embedded-artifact-header">
          <strong>{artifact.title}</strong>
          {onOpenArtifact ? <button type="button" className="button-secondary" onClick={openTarget}>打开</button> : null}
        </div>
        <MermaidBlock chart={artifact.content ?? ''} />
      </div>
    );
  }

  if (artifact.kind === 'mindmap') {
    return (
      <div className="embedded-artifact-card">
        <div className="embedded-artifact-header">
          <strong>{artifact.title}</strong>
          {onOpenArtifact ? <button type="button" className="button-secondary" onClick={openTarget}>打开</button> : null}
        </div>
        <MindMapBlock raw={artifact.content ?? ''} />
      </div>
    );
  }

  return (
    <div className="embedded-artifact-card">
      <div className="embedded-artifact-header">
        <strong>{artifact.title}</strong>
        {onOpenArtifact ? <button type="button" className="button-secondary" onClick={openTarget}>打开</button> : null}
      </div>
      <p>{(artifact.content ?? '').slice(0, 180) || '该工件没有可预览的内容。'}</p>
    </div>
  );
}

export function MarkdownContent({ value, documentPath, onOpenArtifact }: MarkdownContentProps) {
  const normalizedValue = useMemo(() => rewriteWikiLinks(value), [value]);

  return (
    <div className="document-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const inline = Boolean((props as { inline?: boolean }).inline);
            const className = props.className ?? '';
            const match = /language-(\w+)/.exec(className);
            const code = String(props.children).replace(/\n$/, '');
            if (!inline && match?.[1] === 'mermaid') {
              return <MermaidBlock chart={code} />;
            }
            if (!inline && (match?.[1] === 'markmap' || match?.[1] === 'mindmap')) {
              return <MindMapBlock raw={code} />;
            }
            if (!inline && match?.[1] === 'ui') {
              return <UiPreviewBlock raw={code} />;
            }
            return <code className={className}>{props.children}</code>;
          },
          a(props) {
            const href = String(props.href ?? '');
            if (documentPath && isLocalArtifactTarget(href)) {
              return (
                <button
                  type="button"
                  className="inline-artifact-link"
                  onClick={() => {
                    void window.api.openArtifact(href, documentPath).then((artifact) => {
                      onOpenArtifact?.(artifact.filePath);
                    });
                  }}
                >
                  {props.children}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noreferrer">{props.children}</a>;
          },
          img(props) {
            const src = String(props.src ?? '');
            if (documentPath && isLocalArtifactTarget(src)) {
              return (
                <EmbeddedArtifact
                  documentPath={documentPath}
                  target={src}
                  alt={props.alt}
                  onOpenArtifact={onOpenArtifact}
                />
              );
            }
            return <img src={src} alt={props.alt ?? ''} />;
          }
        }}
      >
        {normalizedValue}
      </ReactMarkdown>
    </div>
  );
}
