import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Project } from '../types';
import { seedProjects } from '../data/seedData';

interface ProjectsState {
  list: Project[];
}

const initialState: ProjectsState = {
  list: seedProjects,
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    addProject(state, action: PayloadAction<Project>) {
      state.list.push(action.payload);
    },
    updateProject(state, action: PayloadAction<Project>) {
      const idx = state.list.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) state.list[idx] = action.payload;
    },
    deleteProject(state, action: PayloadAction<string>) {
      state.list = state.list.filter(p => p.id !== action.payload);
    },
  },
});

export const { addProject, updateProject, deleteProject } = projectsSlice.actions;
export default projectsSlice.reducer;
