import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Providers } from './providers';
import { store } from '@/store';
import { dismissToast, pushToast } from '@/store/uiSlice';

beforeEach(() => store.getState().ui.toasts.forEach((t) => store.dispatch(dismissToast(t.id))));

describe('Providers', () => {
  it('shows toasts on every page, including ones outside the app layout such as sign-in', () => {
    render(<Providers><p>a public page with no layout</p></Providers>);

    act(() => { store.dispatch(pushToast({ id: 'tp1', kind: 'error', message: 'These credentials do not match our records.' })); });

    expect(screen.getByText('These credentials do not match our records.')).toBeInTheDocument();
  });

  it('shows each toast exactly once', () => {
    render(<Providers><p>page</p></Providers>);

    act(() => { store.dispatch(pushToast({ id: 'tp2', kind: 'info', message: 'Only once please.' })); });

    expect(screen.getAllByText('Only once please.')).toHaveLength(1);
  });
});
