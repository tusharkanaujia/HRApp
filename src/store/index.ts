import { configureStore } from '@reduxjs/toolkit';
import employeesReducer from './employeesSlice';
import projectsReducer from './projectsSlice';
import projectLayoutsReducer from './projectLayoutsSlice';
import appearanceReducer from './appearanceSlice';
import authReducer from './authSlice';
import activityReducer from './activitySlice';
import { firestoreMiddleware } from '../lib/firestoreSync';

export const store = configureStore({
  reducer: {
    employees:      employeesReducer,
    projects:       projectsReducer,
    projectLayouts: projectLayoutsReducer,
    appearance:     appearanceReducer,
    auth:           authReducer,
    activity:       activityReducer,
  },
  middleware: getDefault =>
    getDefault({ serializableCheck: false }).concat(firestoreMiddleware),
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
