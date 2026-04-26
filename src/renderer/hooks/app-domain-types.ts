import type {
  ArtifactOpenPayload,
  AppSettings,
  ConversationTargetContext,
  FlowPatch,
  FlowPlan,
  PlatformFlowAsset
} from '../../shared/types';
import type { ProviderProfileDraft } from '../components/ProviderProfilesDialog';

export type ViewMode = 'read' | 'edit' | 'source';
export type TopbarMenuKey = 'file' | 'edit' | 'view';

export type SettingsDraft = {
  theme: AppSettings['theme'];
  debug: AppSettings['debug'];
  activeProviderProfileId: string;
  providerProfiles: ProviderProfileDraft[];
};

export type LandingView = 'welcome' | 'resources';
export type ResourceCenterSource = 'welcome' | 'project-create';

export type FlowConversationPreviewState =
  | {
      mode: 'draft';
      prompt: string;
      target: ConversationTargetContext;
      flow: PlatformFlowAsset;
      plan: FlowPlan;
      draft: PlatformFlowAsset;
    }
  | {
      mode: 'patch';
      prompt: string;
      target: ConversationTargetContext;
      flow: PlatformFlowAsset;
      patch: FlowPatch;
      preview: PlatformFlowAsset;
    };

export type OpenDocumentState = {
  path: string;
  title: string;
  kind: 'text' | 'table' | 'image' | 'diagram' | 'mindmap' | 'unsupported';
  value: string;
  lastSavedValue: string;
  loading?: boolean;
  artifact?: ArtifactOpenPayload;
  lastSavedArtifactSignature?: string;
  lastKnownModifiedAt: number;
  ignoredConflictModifiedAt?: number;
};

export type TextRange = {
  start: number;
  end: number;
};
