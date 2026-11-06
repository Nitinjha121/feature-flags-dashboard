import type { Environment } from '@ff/shared';

const ENV_CLASSES: Record<Environment, string> = {
  dev: 'bg-badge-dev text-badge-dev-fg border-badge-dev-border',
  staging: 'bg-badge-staging text-badge-staging-fg border-badge-staging-border',
  prod: 'bg-badge-prod text-badge-prod-fg border-badge-prod-border',
};

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'px-1 py-px text-[9px]',
  md: 'px-2 py-0.5 text-[10px]',
};

interface EnvBadgeProps {
  environment: Environment;
  size?: 'sm' | 'md';
}

export function EnvBadge({ environment, size = 'md' }: EnvBadgeProps) {
  return (
    <span
      className={`inline-block rounded border font-mono font-semibold uppercase ${SIZE_CLASSES[size]} ${ENV_CLASSES[environment]}`}
    >
      {environment}
    </span>
  );
}
