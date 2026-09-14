import { configureStore } from '@reduxjs/toolkit';
import dataReducer from './dataSlice';
import authReducer from './authSlice';
import uiReducer from './uiSlice';
import { apiMiddleware } from './apiMiddleware';

export const store = configureStore({
  reducer: {
    data: dataReducer,
    auth: authReducer,
    ui: uiReducer,
  },
  middleware: (getDefault) =>
    getDefault({
      // Seed data is large and self-contained; skip expensive dev checks.
      serializableCheck: false,
      immutableCheck: false,
    }).concat(apiMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
