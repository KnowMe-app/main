import { createSlice } from '@reduxjs/toolkit';

const filterSlice = createSlice({
  name: 'filter',
  initialState: '',
  reducers: {
    addFilter: (_, { payload }) => payload,
  },
});

export const filterReducer = filterSlice.reducer;
export const { addFilter } = filterSlice.actions;
export const getFilter = state => state.filter;
