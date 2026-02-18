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
import { auth } from './config';
import { getDatabase, get, ref } from 'firebase/database';

const MATCHING_ACCESS_LEVELS = new Set([
  'matching_view',
  'matching_view_write',
  'matching_add_profile_view',
  'matching_add_profile_view_write',
]);

const ADD_PROFILE_ACCESS_LEVELS = new Set([
  'matching_add_profile_view',
  'matching_add_profile_view_write',
]);

const normalizeAccessLevel = value => {
  if (Array.isArray(value)) {
    return (value[value.length - 1] || '').toString().trim().toLowerCase();
  }

  return (value || '').toString().trim().toLowerCase();
};

export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null);
  const [canAccessMatching, setCanAccessMatching] = useState(false);
  const [canAccessAddProfile, setCanAccessAddProfile] = useState(false);
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
      const resolveAccessLevel = async () => {
        const db = getDatabase();
        const newUsersSnapshot = await get(ref(db, `newUsers/${user.uid}/accessLevel`));
        if (newUsersSnapshot.exists()) {
          const accessLevelFromNewUsers = normalizeAccessLevel(newUsersSnapshot.val());
          if (accessLevelFromNewUsers) {
            return accessLevelFromNewUsers;
          }
        }

        const usersSnapshot = await get(ref(db, `users/${user.uid}/accessLevel`));
        return usersSnapshot.exists() ? normalizeAccessLevel(usersSnapshot.val()) : '';
      };

      if (user) {
        localStorage.setItem('ownerId', user.uid);
        if (user.uid === process.env.REACT_APP_USER1) {
          setIsAdmin(true);
          setCanAccessMatching(true);
          setCanAccessAddProfile(true);
        } else {
          setIsAdmin(false);

          resolveAccessLevel()
            .then(accessLevel => {
              setCanAccessMatching(MATCHING_ACCESS_LEVELS.has(accessLevel));
              setCanAccessAddProfile(ADD_PROFILE_ACCESS_LEVELS.has(accessLevel));
            })
            .catch(() => {
              setCanAccessMatching(false);
              setCanAccessAddProfile(false);
            });
        }
      } else {
        localStorage.removeItem('ownerId');
        setIsAdmin(false);
        setCanAccessMatching(false);
        setCanAccessAddProfile(false);
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
      {(isAdmin || canAccessAddProfile) && <Route path="/add" element={<AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />}
      {(isAdmin || canAccessMatching) && <Route path="/matching" element={<Matching />} />}
      {isAdmin && <Route path="/edit/:userId" element={<EditProfile />} />}
      {isAdmin && <Route path="/medications/:userId" element={<MedicationsPage />} />}
      <Route path="/policy" element={<PrivacyPolicy />} />
    </Routes>
  );
};
