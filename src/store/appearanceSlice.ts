import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppearanceConfig, Division } from '../types';

const initial: AppearanceConfig = {};

const appearanceSlice = createSlice({
  name: 'appearance',
  initialState: initial,
  reducers: {
    // Whole-doc replace — used by the Firestore subscription.
    setAppearance(_state, action: PayloadAction<AppearanceConfig>) {
      return action.payload;
    },
    setDivisionColor(state, action: PayloadAction<{ division: Division; color: string | null }>) {
      const { division, color } = action.payload;
      const next = { ...(state.divisions ?? {}) };
      if (color) next[division] = color;
      else       delete next[division];
      state.divisions = next;
      state.updatedAt = new Date().toISOString();
    },
    setDepartmentColor(state, action: PayloadAction<{ name: string; color: string | null }>) {
      const { name, color } = action.payload;
      const next = { ...(state.departments ?? {}) };
      if (color) next[name] = color;
      else       delete next[name];
      state.departments = next;
      state.updatedAt = new Date().toISOString();
    },
    setProjectColor(state, action: PayloadAction<{ projectId: string; color: string | null }>) {
      const { projectId, color } = action.payload;
      const next = { ...(state.projects ?? {}) };
      if (color) next[projectId] = color;
      else       delete next[projectId];
      state.projects = next;
      state.updatedAt = new Date().toISOString();
    },
  },
});

export const {
  setAppearance,
  setDivisionColor,
  setDepartmentColor,
  setProjectColor,
} = appearanceSlice.actions;
export default appearanceSlice.reducer;
