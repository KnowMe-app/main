import React, { useEffect, useState } from 'react';
import { Route, Routes, useNavigate  } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
import { MyProfile } from './MyProfile';
import { SubmitForm } from './SubmitForm';
import { AddNewProfile } from './AddNewProfile';
import Matching from './Matching';
import EditProfile from './EditProfile';
import MedicationsPage from './MedicationsPage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, fetchUserById } from './config';
import { resolveAccess } from 'utils/accessLevel';

export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null);
  const [canAccessAdd, setCanAccessAdd] = useState(false);
  const [canAccessMatching, setCanAccessMatching] = useState(false);
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
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        localStorage.setItem('ownerId', user.uid);
        let accessLevel = '';
        try {
          const profile = await fetchUserById(user.uid);
          accessLevel = profile?.accessLevel || '';
        } catch (error) {
          console.error('Failed to load accessLevel for routes', error);
        }

        const access = resolveAccess({ uid: user.uid, accessLevel });
        setIsAdmin(access.isAdmin);
        setCanAccessAdd(access.canAccessAdd);
        setCanAccessMatching(access.canAccessMatching);
        localStorage.setItem('accessLevel', accessLevel);
      } else {
        localStorage.removeItem('ownerId');
        localStorage.removeItem('accessLevel');
        setIsAdmin(false);
        setCanAccessAdd(false);
        setCanAccessMatching(false);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={canAccessAdd ? <AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /> : <PrivacyPolicy />} />
      <Route path="/submit" element={<SubmitForm />} />
      <Route path="/my-profile"  element={<MyProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}/>} />
      {canAccessAdd && <Route path="/add" element={<AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />}
      {canAccessMatching && <Route path="/matching" element={<Matching />} />}
      {isAdmin && <Route path="/edit/:userId" element={<EditProfile />} />}
      {isAdmin && <Route path="/medications/:userId" element={<MedicationsPage />} />}
      <Route path="/policy" element={<PrivacyPolicy />} />
    </Routes>
  );
};
