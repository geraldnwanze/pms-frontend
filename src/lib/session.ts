import type { ApiError } from '@/lib/api';

/** What to tell someone whose session the server has just ended. The API's own wording wins when it says more than "Unauthenticated.". */
export function sessionEndedMessage(err: ApiError): string {
  const said = err.message?.trim();
  return said && said !== 'Unauthenticated.' ? said : 'Your session has ended. Please sign in again.';
}
