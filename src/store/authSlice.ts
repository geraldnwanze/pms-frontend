import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { setAuthToken } from '@/lib/api';

const USER_KEY = 'pms.currentUserId';
const TOKEN_KEY = 'pms.token';

interface AuthState {
  currentUserId: string | null;
  token: string | null;
  /** True once a bootstrap has populated the data store for this session. */
  dataReady: boolean;
}

function loadInitial(): AuthState {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const currentUserId = localStorage.getItem(USER_KEY);
    // A user id without a token is a stale/legacy session — start clean.
    if (!token) {
      localStorage.removeItem(USER_KEY);
      return { currentUserId: null, token: null, dataReady: false };
    }
    return { currentUserId, token, dataReady: false };
  } catch {
    return { currentUserId: null, token: null, dataReady: false };
  }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: loadInitial(),
  reducers: {
    /** Establish a session — the acting user id plus their Sanctum token. */
    login(state, action: PayloadAction<{ userId: string; token: string }>) {
      state.currentUserId = action.payload.userId;
      state.token = action.payload.token;
      state.dataReady = false;
      try {
        localStorage.setItem(USER_KEY, action.payload.userId);
        localStorage.setItem(TOKEN_KEY, action.payload.token);
      } catch {
        /* ignore */
      }
    },
    dataReady(state, action: PayloadAction<boolean>) {
      state.dataReady = action.payload;
    },
    logout(state) {
      state.currentUserId = null;
      state.token = null;
      state.dataReady = false;
      setAuthToken(null);
      try {
        localStorage.removeItem(USER_KEY);
      } catch {
        /* ignore */
      }
    },
  },
});

export const { login, logout, dataReady } = authSlice.actions;
export default authSlice.reducer;
