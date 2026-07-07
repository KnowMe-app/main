import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate  } from 'react-router-dom';
import { PrivacyPolicy } from './PrivacyPolicy';
import { MyProfile } from './MyProfile';
import { MyProfileOld } from './MyProfileOld';
import { LoginScreen } from './LoginScreen';
import { SubmitForm } from './SubmitForm';
import { AddNewProfile } from './AddNewProfile';
import Matching from './Matching';
import EditProfile from './EditProfile';
import MedicationsPage from './MedicationsPage';
import FlowManager from './FlowManager';
import BudgetPage from './BudgetPage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, fetchUserById } from './config';
import { resolveAccess } from 'utils/accessLevel';
import { applyStoredAppSettings } from 'hooks/useAppSettings';

export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null);
  const [canAccessAdd, setCanAccessAdd] = useState(false);
  const [canAccessMatching, setCanAccessMatching] = useState(false);
  const [isAccessResolved, setIsAccessResolved] = useState(false);
  // console.log('isLoggedIn :>> ', isLoggedIn);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    applyStoredAppSettings();
    const stored = localStorage.getItem('isLoggedIn');
    if (stored === 'true') {
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !isAccessResolved || isAdmin !== false) {
      return;
    }

    const isRootRoute = location.pathname === '/';
    const isUnauthorizedAddRoute = location.pathname === '/add' && !canAccessAdd;
    const isUnauthorizedMatchingRoute = location.pathname === '/matching' && !canAccessMatching;

    if (isRootRoute || isUnauthorizedAddRoute || isUnauthorizedMatchingRoute) {
      navigate('/my-profile');
    }
  }, [isLoggedIn, isAccessResolved, navigate, isAdmin, location.pathname, canAccessAdd, canAccessMatching]);

  // Special page for admin
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        localStorage.setItem('ownerId', user.uid);
        let accessLevel = '';
        let userRole = '';
        try {
          const profile = await fetchUserById(user.uid);
          accessLevel = profile?.accessLevel || '';
          userRole = profile?.userRole || profile?.role || '';
        } catch (error) {
          console.error('Failed to load access profile for routes', error);
        }

        const access = resolveAccess({ uid: user.uid, accessLevel, userRole });
        setIsAdmin(access.isAdmin);
        setCanAccessAdd(access.canAccessAdd);
        setCanAccessMatching(access.canAccessMatching);
        localStorage.setItem('accessLevel', accessLevel);
        localStorage.setItem('userRole', userRole);
        setIsAccessResolved(true);
      } else {
        localStorage.removeItem('ownerId');
        localStorage.removeItem('accessLevel');
        localStorage.removeItem('userRole');
        setIsAdmin(false);
        setCanAccessAdd(false);
        setCanAccessMatching(false);
        setIsAccessResolved(true);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={canAccessAdd ? <AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /> : <PrivacyPolicy />} />
      <Route path="/login" element={<LoginScreen isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />
      <Route path="/submit" element={<SubmitForm />} />
      <Route path="/my-profile" element={<MyProfile />} />
      <Route path="/my-profile-new" element={<Navigate to="/my-profile" replace />} />
      {isAdmin && <Route path="/my-profile-old" element={<MyProfileOld isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />}
      {canAccessAdd && <Route path="/add" element={<AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />} />}
      {canAccessMatching && <Route path="/matching" element={<Matching />} />}
      {isAdmin && <Route path="/edit/:userId" element={<EditProfile />} />}
      {isAdmin && <Route path="/medications/:userId" element={<MedicationsPage />} />}
      {isAdmin && <Route path="/flow" element={<FlowManager ownerId={auth.currentUser?.uid} />} />}
      {isAdmin && <Route path="/budget" element={<BudgetPage isAdmin={isAdmin} />} />}
      <Route path="/policy" element={<PrivacyPolicy />} />
    </Routes>
  );
};
