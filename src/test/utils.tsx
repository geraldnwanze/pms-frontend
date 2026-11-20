import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import authReducer from '@/store/authSlice';
import dataReducer from '@/store/dataSlice';
import uiReducer from '@/store/uiSlice';

/** A real store with the app's reducers but none of the API write-through middleware, so tests never hit the network. */
export function makeTestStore() {
  return configureStore({
    reducer: { data: dataReducer, auth: authReducer, ui: uiReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

export type TestStore = ReturnType<typeof makeTestStore>;

export function renderWithStore(ui: ReactElement, store: TestStore = makeTestStore()) {
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

/** Pin "now" to a local calendar date at noon (timezone-independent). Pair with vi.useFakeTimers(). */
export function localNoon(y: number, month1: number, day: number): Date {
  return new Date(y, month1 - 1, day, 12, 0, 0);
}
