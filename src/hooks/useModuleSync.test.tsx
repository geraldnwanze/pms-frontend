import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_SYNC_MIN_GAP_MS, useModuleSync } from './useModuleSync';
import { makeTestStore } from '@/test/utils';

vi.mock('@/store/thunks', () => ({ syncModules: vi.fn(() => ({ type: 'test/syncModules' })) }));
import { syncModules } from '@/store/thunks';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const mount = () => renderHook(() => useModuleSync(), { wrapper: ({ children }: { children: ReactNode }) => <Provider store={makeTestStore()}>{children}</Provider> });
const focus = () => act(() => { window.dispatchEvent(new Event('focus')); });
const visibility = () => act(() => { document.dispatchEvent(new Event('visibilitychange')); });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  setVisibility('visible');
});
afterEach(() => vi.useRealTimers());

describe('useModuleSync', () => {
  it('does not check just because the app mounted', () => {
    mount();

    expect(syncModules).not.toHaveBeenCalled();
  });

  it('checks when the window regains focus', () => {
    mount();

    focus();

    expect(syncModules).toHaveBeenCalledTimes(1);
  });

  it('checks when the tab becomes visible again', () => {
    mount();

    visibility();

    expect(syncModules).toHaveBeenCalledTimes(1);
  });

  it('does not check when the tab is being hidden', () => {
    mount();
    setVisibility('hidden');

    visibility();
    focus();

    expect(syncModules).not.toHaveBeenCalled();
  });

  it('checks once when focus and visibility fire together, as browsers do', () => {
    mount();

    focus();
    visibility();

    expect(syncModules).toHaveBeenCalledTimes(1);
  });

  it('leaves at least the minimum gap between checks', () => {
    mount();
    focus();

    vi.advanceTimersByTime(MODULE_SYNC_MIN_GAP_MS - 1);
    focus();
    expect(syncModules).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    focus();
    expect(syncModules).toHaveBeenCalledTimes(2);
  });

  it('stops listening when the app unmounts', () => {
    const { unmount } = mount();
    unmount();

    focus();
    visibility();

    expect(syncModules).not.toHaveBeenCalled();
  });
});
