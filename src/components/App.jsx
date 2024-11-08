import React, { useEffect, useState } from 'react';
import { Route, Routes, useNavigate  } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
import {ProfileScreen} from './ProfileScreen';
import { LoginScreen } from './LoginScreen';
import { SubmitForm } from './SubmitForm';
import {AddNewProfile} from './AddNewProfile';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config';

export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(false);
  console.log('isLoggedIn :>> ', isLoggedIn);

  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/profile');
    }
  }, [isLoggedIn, navigate]);

  // Special page for admin
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user && user.uid === process.env.REACT_APP_USER1) {
       setUser(true)
      } 
    });
    // Clean up the subscription on component unmount
    return () => unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={user ? <AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /> : <PrivacyPolicy />} />
      <Route path="/submit" element={<SubmitForm />} />
      <Route path="/profile"  element={<ProfileScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}/>} />
      <Route path="/login" element={<LoginScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />
      {user&& <Route path="/add" element={<AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />}
      {user&&<Route path="/policy" element={<PrivacyPolicy/>} />}
    </Routes>
  );
};
