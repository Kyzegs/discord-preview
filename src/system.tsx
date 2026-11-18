import type { ReactNode } from 'react';
import type { AreaProps } from './shared.tsx';
import type { PreviewMessage } from './types.ts';

// Filled in by later work: joins, boosts, pins and the other messages Discord writes itself.
export function isSystemMessage(_m: PreviewMessage): boolean {
  return false;
}

export function SystemMessage(_: AreaProps): ReactNode {
  return null;
}
