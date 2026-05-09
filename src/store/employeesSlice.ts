import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Employee } from '../types';

const employeesSlice = createSlice({
  name: 'employees',
  initialState: { list: [] as Employee[] },
  reducers: {
    setEmployees(state, action: PayloadAction<Employee[]>) {
      state.list = action.payload;
    },
    addEmployee(state, action: PayloadAction<Employee>) {
      state.list.push(action.payload);
    },
    updateEmployee(state, action: PayloadAction<Employee>) {
      const idx = state.list.findIndex(e => e.id === action.payload.id);
      if (idx !== -1) state.list[idx] = action.payload;
    },
    deleteEmployee(state, action: PayloadAction<string>) {
      state.list = state.list.filter(e => e.id !== action.payload);
      state.list.forEach(e => {
        if (e.managerId === action.payload) e.managerId = null;
      });
    },
  },
});

export const { setEmployees, addEmployee, updateEmployee, deleteEmployee } = employeesSlice.actions;
export default employeesSlice.reducer;
