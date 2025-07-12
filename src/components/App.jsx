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
  const [isAdmin, setIsAdmin] = useState(null);
  // console.log('isLoggedIn :>> ', isLoggedIn);

  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('isLoggedIn');
    if (stored === 'true') {
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && isAdmin === false) {
      navigate('/my-profile');
    }
  }, [isLoggedIn, navigate, isAdmin]);

  // Special page for admin
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user && user.uid === process.env.REACT_APP_USER1) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
    // Clean up the subscription on component unmount
    return () => unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={isAdmin ? <AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /> : <PrivacyPolicy />} />
      <Route path="/submit" element={<SubmitForm />} />
      <Route path="/my-profile"  element={<MyProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}/>} />
      {isAdmin && <Route path="/add" element={<AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />}
      <Route path="/policy" element={<PrivacyPolicy />} />
    </Routes>
  );
};
