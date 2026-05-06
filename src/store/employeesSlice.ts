import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Employee } from '../types';
import { loadExcelEmployees } from '../data/excelDataLoader';

interface EmployeesState {
  list: Employee[];
}

const initialState: EmployeesState = {
  list: loadExcelEmployees(),
};

const employeesSlice = createSlice({
  name: 'employees',
  initialState,
  reducers: {
    addEmployee(state, action: PayloadAction<Employee>) {
      state.list.push(action.payload);
    },
    updateEmployee(state, action: PayloadAction<Employee>) {
      const idx = state.list.findIndex(e => e.id === action.payload.id);
      if (idx !== -1) state.list[idx] = action.payload;
    },
    deleteEmployee(state, action: PayloadAction<string>) {
      state.list = state.list.filter(e => e.id !== action.payload);
      // Reassign direct reports to deleted employee's manager
      state.list.forEach(e => {
        if (e.managerId === action.payload) e.managerId = null;
      });
    },
  },
});

export const { addEmployee, updateEmployee, deleteEmployee } = employeesSlice.actions;
export default employeesSlice.reducer;
