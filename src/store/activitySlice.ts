import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ActivityEntry } from '../types';

const activitySlice = createSlice({
  name: 'activity',
  initialState: { log: [] as ActivityEntry[] },
  reducers: {
    setActivityLog(state, action: PayloadAction<ActivityEntry[]>) {
      state.log = action.payload;
    },
    addActivity(state, action: PayloadAction<ActivityEntry>) {
      state.log.unshift(action.payload);
      if (state.log.length > 500) state.log.length = 500;
    },
    clearActivity(state) {
      state.log = [];
    },
  },
});

export const { setActivityLog, addActivity, clearActivity } = activitySlice.actions;
export default activitySlice.reducer;
