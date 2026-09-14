import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export type ThemePref = 'light' | 'dark' | 'system';

const THEME_KEY = 'pms.theme';

function readStoredTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* localStorage unavailable */
  }
  return 'system';
}

interface UiState {
  sidebarOpen: boolean; // mobile drawer
  sidebarCollapsed: boolean; // desktop rail
  toasts: Toast[];
  /** Active property filter applied across owner/admin dashboards */
  propertyFilter: string | 'all';
  /** Colour-scheme preference; 'system' follows the OS. Persisted to localStorage. */
  theme: ThemePref;
}

const initialState: UiState = {
  sidebarOpen: false,
  sidebarCollapsed: false,
  toasts: [],
  propertyFilter: 'all',
  theme: readStoredTheme(),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    toggleSidebarCollapsed(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    pushToast(state, action: PayloadAction<Toast>) {
      state.toasts.push(action.payload);
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setPropertyFilter(state, action: PayloadAction<string | 'all'>) {
      state.propertyFilter = action.payload;
    },
    setTheme(state, action: PayloadAction<ThemePref>) {
      state.theme = action.payload;
      try {
        localStorage.setItem(THEME_KEY, action.payload);
      } catch {
        /* localStorage unavailable */
      }
    },
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  toggleSidebarCollapsed,
  pushToast,
  dismissToast,
  setPropertyFilter,
  setTheme,
} = uiSlice.actions;
export default uiSlice.reducer;
