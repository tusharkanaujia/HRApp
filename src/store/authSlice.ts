import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppUser, UserRole } from '../types';
import { seedUsers } from '../data/seedUsers';

interface AuthState {
  users: AppUser[];
  currentUserId: string | null;
}

function loadInitial(): AuthState {
  try {
    const raw = localStorage.getItem('hrapp_auth');
    if (raw) return JSON.parse(raw) as AuthState;
  } catch {}
  return { users: seedUsers, currentUserId: null };
}

const authSlice = createSlice({
  name: 'auth',
  initialState: loadInitial,
  reducers: {
    login(state, action: PayloadAction<{ username: string; password: string }>) {
      const user = state.users.find(
        u => u.username === action.payload.username && u.password === action.payload.password,
      );
      if (user) state.currentUserId = user.id;
    },
    logout(state) {
      state.currentUserId = null;
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

export const { login, logout, setUserRole, addUser, removeUser, changePassword } = authSlice.actions;
export default authSlice.reducer;
