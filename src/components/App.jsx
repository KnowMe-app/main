import React, { useEffect, useState } from 'react';
import { Route, Routes, useNavigate  } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
// import {ProfileScreen} from './ProfileScreen';
import { LoginScreen } from './LoginScreen';
import { SubmitForm } from './SubmitForm';

export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  console.log('isLoggedIn :>> ', isLoggedIn);

  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/profile');
    }
  }, [isLoggedIn, navigate]);

  return (
    <Routes>
      <Route path="/" element={<PrivacyPolicy />} />
      <Route path="/submit" element={<SubmitForm />} />
      {/* <Route path="/profile"  element={<ProfileScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}/>} /> */}
      <Route path="/login" element={<LoginScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />
    </Routes>
  );
};
