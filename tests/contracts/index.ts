import { deliveryQualityContracts } from './delivery-quality.contracts.js';
import { dragResizeContracts } from './drag-resize.contracts.js';
import { packagedHandoffContracts } from './packaged-handoff.contracts.js';
import { pageActionContracts } from './page-actions.contracts.js';
import { pageLayoutContracts } from './page-layout.contracts.js';
import { pageStateContracts } from './page-states.contracts.js';
import { prototypeContracts } from './prototype-reference.contracts.js';
import { responseLatencyContracts } from './response-latency.contracts.js';
import { thinkingMapGraphContracts } from './thinking-map-graph.contracts.js';
import type { UiContract, UiContractKind } from './types.js';

export const allUiContracts: UiContract[] = [
  ...prototypeContracts,
  ...pageLayoutContracts,
  ...pageActionContracts,
  ...pageStateContracts,
  ...responseLatencyContracts,
  ...dragResizeContracts,
  ...thinkingMapGraphContracts,
  ...deliveryQualityContracts,
  ...packagedHandoffContracts,
];

const allKinds: UiContractKind[] = [
  'prototype',
  'layout',
  'action',
  'state',
  'latency',
  'manipulation',
  'graph',
  'delivery',
  'packaged',
];

export const contractsByKind = Object.fromEntries(
  allKinds.map((kind) => [
    kind,
    allUiContracts.filter((contract) => contract.kind === kind),
  ]),
) as Record<UiContractKind, UiContract[]>;

export const contractsByPage = Object.fromEntries(
  [...new Set(allUiContracts.map((contract) => contract.pageId))].map((pageId) => [
    pageId,
    allUiContracts.filter((contract) => contract.pageId === pageId),
  ]),
) as Record<string, UiContract[]>;

export function getContractsByPage(pageId: string) {
  return contractsByPage[pageId] ?? [];
}
