import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppUser, UserRole } from '../types';

// Sign-in is handled by Firebase Auth (see AuthContext). This slice only holds
// the tenant's user directory (roles / empId / disabled) loaded from Firestore.
// The "current user" is derived in useAuth by matching the signed-in Firebase
// user against this list.
interface AuthState {
  users: AppUser[];
}

const authSlice = createSlice({
  name: 'auth',
  initialState: (): AuthState => ({ users: [] }),
  reducers: {
    setUsers(state, action: PayloadAction<AppUser[]>) {
      state.users = action.payload;
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
    setUserDisabled(state, action: PayloadAction<{ userId: string; disabled: boolean }>) {
      const u = state.users.find(u => u.id === action.payload.userId);
      if (u) u.disabled = action.payload.disabled;
    },
    disableUserByEmpId(state, action: PayloadAction<{ empId: string; disabled: boolean }>) {
      const u = state.users.find(u => u.empId === action.payload.empId);
      if (u) u.disabled = action.payload.disabled;
    },
  },
});

export const { setUsers, setUserRole, addUser, removeUser, setUserDisabled, disableUserByEmpId } = authSlice.actions;
export default authSlice.reducer;
