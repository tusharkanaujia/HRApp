import { configureStore } from '@reduxjs/toolkit';
import employeesReducer from './employeesSlice';
import projectsReducer from './projectsSlice';
import authReducer from './authSlice';

export const store = configureStore({
  reducer: {
    employees: employeesReducer,
    projects: projectsReducer,
    auth: authReducer,
  },
});

// Persist auth slice to localStorage on every change
store.subscribe(() => {
  const { auth } = store.getState();
  localStorage.setItem('hrapp_auth', JSON.stringify(auth));
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
