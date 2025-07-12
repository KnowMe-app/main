import React, { useEffect, useState } from 'react';
import { Route, Routes, useNavigate  } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
import { MyProfile } from './MyProfile';
import { SubmitForm } from './SubmitForm';
import {AddNewProfile} from './AddNewProfile';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config';

export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(false);
  // console.log('isLoggedIn :>> ', isLoggedIn);

  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('isLoggedIn');
    if (stored === 'true') {
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && !user) {
      navigate('/my-profile');
    }
  }, [isLoggedIn, navigate, user]);

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
      <Route path="/my-profile"  element={<MyProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}/>} />
      {user&& <Route path="/add" element={<AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />}
      <Route path="/policy" element={<PrivacyPolicy />} />
    </Routes>
  );
};
