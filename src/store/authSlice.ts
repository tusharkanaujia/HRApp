import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppUser, UserRole } from '../types';
import { getTenantSlug } from '../lib/tenant';

interface AuthState {
  users: AppUser[];
  currentUserId: string | null;
}

function sessionKey() {
  return `wehive_session_${getTenantSlug()}`;
}

function loadSession(): string | null {
  try { return localStorage.getItem(sessionKey()) || null; } catch { return null; }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: (): AuthState => ({ users: [], currentUserId: loadSession() }),
  reducers: {
    setUsers(state, action: PayloadAction<AppUser[]>) {
      state.users = action.payload;
    },
    login(state, action: PayloadAction<{ username: string; password: string }>) {
      const user = state.users.find(
        u => u.username === action.payload.username && u.password === action.payload.password,
      );
      if (user) {
        state.currentUserId = user.id;
        try { localStorage.setItem(sessionKey(), user.id); } catch {}
      }
    },
    logout(state) {
      state.currentUserId = null;
      try { localStorage.removeItem(sessionKey()); } catch {}
    },
    setUserRole(state, action: PayloadAction<{ userId: string; role: UserRole }>) {
      const u = state.users.find(u => u.id === action.payload.userId);
      if (u) u.role = action.payload.role;
    },
    addUser(state, action: PayloadAction<AppUser>) {
      if (!state.users.find(u => u.username === action.payload.username))
        state.users.push(action.payload);
    },
    removeUser(state, action: PayloadAction<string>) {
      state.users = state.users.filter(u => u.id !== action.payload);
    },
    changePassword(state, action: PayloadAction<{ userId: string; password: string }>) {
      const u = state.users.find(u => u.id === action.payload.userId);
      if (u) u.password = action.payload.password;
    },
  },
});

export const { setUsers, login, logout, setUserRole, addUser, removeUser, changePassword } = authSlice.actions;
export default authSlice.reducer;
