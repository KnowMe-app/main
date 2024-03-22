import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
import { SubmitForm } from './SubmitForm';

export const App = () => {
  return (
    <Routes>
      <Route path="/" element={<PrivacyPolicy />} />
      <Route path="/submit" element={<SubmitForm />} />
    </Routes>
  );
};
