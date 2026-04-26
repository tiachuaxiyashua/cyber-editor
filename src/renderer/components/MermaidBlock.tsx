import { useEffect, useState } from 'react';
import { MERMAID_SECURITY_LEVEL, sanitizeRenderedMermaidSvg } from '../lib/mermaid-security';

type MermaidRuntime = {
  initialize: (config: {
    startOnLoad: false;
    theme: 'default' | 'dark';
    securityLevel: typeof MERMAID_SECURITY_LEVEL;
  }) => void;
  render: (id: string, chart: string) => Promise<{ svg: string }>;
};

declare global {
  interface Window {
    mermaid?: MermaidRuntime;
    __cyberEditorMermaidLoader?: Promise<MermaidRuntime>;
  }
}

let mermaidReady = false;

function mermaidConfig(theme: 'default' | 'dark') {
  return {
    startOnLoad: false as const,
    theme,
    securityLevel: MERMAID_SECURITY_LEVEL
  };
}

function ensureMermaid(theme: 'default' | 'dark', mermaid: MermaidRuntime) {
  mermaid.initialize(mermaidConfig(theme));
  mermaidReady = true;
}

function mermaidAssetUrl() {
  return new URL('./vendor/mermaid.min.js', window.location.href).toString();
}

function loadMermaidRuntime() {
  if (window.mermaid) {
    return Promise.resolve(window.mermaid);
  }
  if (window.__cyberEditorMermaidLoader) {
    return window.__cyberEditorMermaidLoader;
  }
  const existingScript = document.querySelector<HTMLScriptElement>('script[data-cyber-editor-mermaid="true"]');
  window.__cyberEditorMermaidLoader = new Promise<MermaidRuntime>((resolve, reject) => {
    const finalize = () => {
      if (window.mermaid) {
        resolve(window.mermaid);
        return;
      }
      reject(new Error('Mermaid runtime loaded but window.mermaid is unavailable.'));
    };

    if (existingScript) {
      existingScript.addEventListener('load', finalize, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Mermaid runtime.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = mermaidAssetUrl();
    script.async = true;
    script.dataset.cyberEditorMermaid = 'true';
    script.addEventListener('load', finalize, { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load Mermaid runtime.')), { once: true });
    document.head.appendChild(script);
  });
  return window.__cyberEditorMermaidLoader;
}

export function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
    loadMermaidRuntime()
      .then((mermaid) => {
        if (!mermaidReady) {
          ensureMermaid(theme, mermaid);
        } else {
          mermaid.initialize(mermaidConfig(theme));
        }
        return mermaid.render(`mermaid-${Math.random().toString(36).slice(2)}`, chart);
      })
      .then(({ svg }) => {
        if (active) {
          setSvg(sanitizeRenderedMermaidSvg(svg));
          setError('');
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message);
          setSvg('');
        }
      });

    return () => {
      active = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="special-block error-block">
        <div className="special-block-title">流程图渲染失败</div>
        <pre>{error}</pre>
        <pre>{chart}</pre>
      </div>
    );
  }

  return <div className="special-block mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />;
}
