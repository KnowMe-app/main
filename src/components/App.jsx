// import React, { useEffect, useState } from 'react';
// import { Route, Routes, Navigate, useNavigate  } from 'react-router-dom';
// import { PrivacyPolicy } from './PrivacyPolicy';
// import {ProfileScreen} from './ProfileScreen';
// import { LoginScreen } from './LoginScreen';

import React, {  } from 'react';
import { Route, Routes, Navigate,  } from 'react-router-dom';
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


  return (
    <Routes>
      <Route path="/" element={<Navigate to="/privacy_policy" />} />
      <Route path="/privacy_policy" element={<PrivacyPolicy />} />
      {/* <Route path="/submit"  element={<ProfileScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}/>} /> */}
      {/* <Route path="/login" element={<LoginScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} /> */}
    </Routes>
  );
};
