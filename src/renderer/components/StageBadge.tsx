import type { AppStage } from '../../shared/types';

const STAGE_LABELS: Record<AppStage, string> = {
  discover: '发现',
  clarify: '澄清',
  plan: '规划',
  draft: '草拟',
  review: '审查',
  finalize: '定稿'
};

export function StageBadge({ stage }: { stage: AppStage }) {
  return (
    <span className="stage-badge" data-stage={stage}>
      {STAGE_LABELS[stage]}
    </span>
  );
}
