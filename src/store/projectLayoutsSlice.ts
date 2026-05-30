import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ProjectLayout } from '../types';

const projectLayoutsSlice = createSlice({
  name: 'projectLayouts',
  initialState: { list: [] as ProjectLayout[] },
  reducers: {
    setProjectLayouts(state, action: PayloadAction<ProjectLayout[]>) {
      state.list = action.payload;
    },
    // Upsert — used when the editor moves cards / pans / expands.
    saveProjectLayout(state, action: PayloadAction<ProjectLayout>) {
      const idx = state.list.findIndex(l => l.id === action.payload.id);
      if (idx === -1) state.list.push(action.payload);
      else state.list[idx] = action.payload;
    },
    clearProjectLayout(state, action: PayloadAction<string>) {
      state.list = state.list.filter(l => l.id !== action.payload);
    },
  },
});

export const { setProjectLayouts, saveProjectLayout, clearProjectLayout } =
  projectLayoutsSlice.actions;
export default projectLayoutsSlice.reducer;
