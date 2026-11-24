import { configureStore } from '@reduxjs/toolkit';
import dataReducer from './dataSlice';
import authReducer from './authSlice';
import uiReducer from './uiSlice';
import { apiMiddleware } from './apiMiddleware';
import { moduleTurnedOff } from './thunks';
import { setModuleOffHandler } from '@/lib/api';

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

// When any request learns a module is off, reload what the app knows (see moduleTurnedOff).
setModuleOffHandler((module, message) => { void store.dispatch(moduleTurnedOff(module, message)); });

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
