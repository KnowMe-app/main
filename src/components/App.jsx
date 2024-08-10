// import React, { useEffect, useState } from 'react';
// import { Route, Routes, Navigate, useNavigate  } from 'react-router-dom';
// import { PrivacyPolicy } from './PrivacyPolicy';
import {ProfileScreen} from './ProfileScreen';
// import { LoginScreen } from './LoginScreen';

import React, {  } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';


export const App = () => {

  // const [isLoggedIn, setIsLoggedIn] = useState(false);
  // console.log('isLoggedIn :>> ', isLoggedIn);

  // const navigate = useNavigate();

  // useEffect(() => {
  //   if (isLoggedIn) {
  //     navigate('/submit');
  //   }
  // }, [isLoggedIn, navigate]);

  // const loggedIn = localStorage.getItem('isLoggedIn');

  return (
    <Routes>
      {/* <Route path="/" element={<Navigate to="/privacy_policy" />} /> */}
      <Route path="/privacy_policy" element={<PrivacyPolicy />} />
      <Route path="/submit" element={<ProfileScreen />} />
      {/* <Route path="/submit"  element={(isLoggedIn && loggedIn) ? (
            <ProfileScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />
          ) : (
            <Navigate to="/login" />
          )} />
      <Route path="/login" element={(!isLoggedIn && !loggedIn) ? (
             <LoginScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />
          ) : (
            <Navigate to="/submit" />
          )} /> */}
    </Routes>
  );
};
