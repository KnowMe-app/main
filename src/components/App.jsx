import React, { useEffect, useState } from 'react';
import { Route, Routes, useNavigate  } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
import {ProfileScreen} from './ProfileScreen';
import { LoginScreen } from './LoginScreen';


export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  console.log('isLoggedIn :>> ', isLoggedIn);

  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/submit');
    }
  }, [isLoggedIn, navigate]);


  return (
    <Routes>
      <Route path="/privacy_policy" element={<PrivacyPolicy />} />
      <Route path="/submit"  element={<ProfileScreen />} />
      <Route path="/login" element={<LoginScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />
    </Routes>
  );
};
