import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
import {ProfileScreen} from './ProfileScreen';
import { LoginScreen } from './LoginScreen';


export const App = () => {
  return (
    <Routes>
      <Route path="/privacy_policy" element={<PrivacyPolicy />} />
      {/* <Route path="/test" element={<Test />} /> */}
      <Route path="/submit" element={<ProfileScreen />} />
      <Route path="/login" element={<LoginScreen />} />
    </Routes>
  );
};
