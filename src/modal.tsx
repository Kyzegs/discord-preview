import type { ReactNode } from 'react';
import type { Look } from './shared.tsx';
import type { PreviewModal } from './types.ts';

// Filled in by later work: a modal dialog, shown instead of the message when the `modal` prop is set.
export function Modal(_: { m: PreviewModal; look: Look }): ReactNode {
  return null;
}
