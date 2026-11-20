import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { sessionEndedMessage } from './session';

describe('sessionEndedMessage', () => {
  it('uses the server’s own wording when it says something specific', () => {
    expect(sessionEndedMessage(new ApiError('This account has been deactivated.', 401))).toBe('This account has been deactivated.');
  });

  it('falls back to a plain sentence for the generic "Unauthenticated."', () => {
    expect(sessionEndedMessage(new ApiError('Unauthenticated.', 401))).toBe('Your session has ended. Please sign in again.');
  });

  it('falls back when there is no message at all', () => {
    expect(sessionEndedMessage(new ApiError('', 401))).toBe('Your session has ended. Please sign in again.');
    expect(sessionEndedMessage(new ApiError('   ', 401))).toBe('Your session has ended. Please sign in again.');
  });
});
