export type UiContractKind =
  | 'prototype'
  | 'layout'
  | 'action'
  | 'state'
  | 'latency'
  | 'manipulation'
  | 'graph'
  | 'delivery'
  | 'packaged';

export type UiSourceRef = {
  doc: string;
  section: string;
  prototypeRef?: string;
  prototypeEntry?: string;
};

export type UiContract = {
  id: string;
  pageId: string;
  kind: UiContractKind;
  gateIds: string[];
  sourceRefs: UiSourceRef[];
  precondition: {
    projectMode: 'none' | 'project';
    viewport: { width: number; height: number };
    theme?: 'light' | 'dark';
  };
  assert: {
    locator?: string;
    role?: string;
    name?: string;
    visible?: boolean;
    enabled?: boolean;
    routeTarget?: string;
    forbidden?: string[];
    geometry?: Record<string, string | number | boolean>;
    latencyMs?: number;
    persistence?: 'same-session' | 'reload' | 'reopen';
    drag?: Record<string, string | number | boolean>;
    graph?: Record<string, string | number | boolean>;
    quality?: Record<string, string | number | boolean>;
  };
};
