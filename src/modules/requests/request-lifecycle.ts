export type RequestStatus = 'received' | 'in_progress' | 'closed' | 'cancelled';

/** Domain policy only: authorization and atomic persistence belong to the caller. */
export function canTransitionRequest(from: unknown, to: unknown): boolean {
  if (from === 'received') return to === 'in_progress' || to === 'cancelled';
  if (from === 'in_progress') return to === 'closed' || to === 'cancelled';
  return false;
}
