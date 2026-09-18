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
import RtdbMigrationTool from './RtdbMigrationTool';
import InvoiceBuilderPage from './InvoiceBuilderPage';
import DocumentsPage from './DocumentsPage';
import PartiesPage from './PartiesPage';
import ProfileCreationWorkspace from './ProfileCreationWorkspace';
import { RequireAuth } from './RequireAuth';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';
import { auth, fetchUserById, resetViewerAccessLevelCache } from './config';
import { clearStoredAccessRights, persistCanCreateProfiles, resolveAccess } from 'utils/accessLevel';
import { applyStoredAppSettings } from 'hooks/useAppSettings';

export const App = () => {

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null);
  const [canAccessAdd, setCanAccessAdd] = useState(false);
  const [canAccessInvoices, setCanAccessInvoices] = useState(false);
  const [isAccessResolved, setIsAccessResolved] = useState(false);
  // Стан входу окремо від рівня доступу: рівень читається з бази, тобто вже
  // після відповіді Firebase, а межа входу мусить спрацювати одразу — інакше
  // захищений екран устигне змонтуватись і почати читати базу без uid.
  const [authStatus, setAuthStatus] = useState('pending');
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

    if (isRootRoute || isUnauthorizedAddRoute) {
      // Екран, на який немає прав, не мовчить. Мовчазний редірект у «Мій
      // профіль» читався як поломка: людина відкривала адресу, а застосунок
      // без жодного слова показував їй її власну анкету — і відрізнити «прав
      // немає» від «щось зламалось» було ніяк. Лишився тут один такий екран —
      // адмінське `/add`; заводити картки може кожен, і `/matching/create-profile`
      // більше нікого не відсилає.
      if (isUnauthorizedAddRoute) {
        toast.error('Немає права на цей екран. Попросіть адміністратора відкрити доступ.', {
          id: 'route-access-denied',
        });
      }
      navigate('/my-profile');
    }
  }, [isLoggedIn, isAccessResolved, navigate, isAdmin, location.pathname, canAccessAdd]);

  // Special page for admin
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setAuthStatus(user ? 'in' : 'out');
      if (user) {
        localStorage.setItem('ownerId', user.uid);
        let accessLevel = '';
        let userRole = '';
        let canCreateProfilesForUser = false;
        try {
          const profile = await fetchUserById(user.uid);
          accessLevel = profile?.accessLevel || '';
          userRole = profile?.userRole || profile?.role || '';
          canCreateProfilesForUser = profile?.canCreateProfiles === true;
        } catch (error) {
          console.error('Failed to load access profile for routes', error);
        }

        const access = resolveAccess({ uid: user.uid, accessLevel, userRole, canCreateProfiles: canCreateProfilesForUser });
        setIsAdmin(access.isAdmin);
        setCanAccessAdd(access.canAccessAdd);
        setCanAccessInvoices(access.canAccessInvoices);
        localStorage.setItem('accessLevel', accessLevel);
        localStorage.setItem('userRole', userRole);
        persistCanCreateProfiles(canCreateProfilesForUser);
        setIsAccessResolved(true);
      } else {
        localStorage.removeItem('ownerId');
        localStorage.removeItem('accessLevel');
        localStorage.removeItem('userRole');
        // Позначка входу — теж стан сесії. Поки вона лишалась від попереднього
        // читача, форма входу бачила «вже увійшли» й відсилала його на
        // захищений екран, а той — назад на форму: два редиректи по колу.
        localStorage.removeItem('isLoggedIn');
        clearStoredAccessRights();
        // Прочитаний рівень доступу — теж стан входу: без цього наступний
        // читач у тій самій вкладці дістав би обіцянку, видану попередньому.
        resetViewerAccessLevelCache();
        setIsAdmin(false);
        setCanAccessAdd(false);
        setCanAccessInvoices(false);
        setIsAccessResolved(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Доки права не прочитані, адмінських маршрутів у таблиці ще немає — і
  // «такого маршруту немає» не можна плутати з «ще не знаємо». Інакше
  // адміністраторка, що відкрила посилання на `/edit/...`, поїхала б у «Мій
  // профіль» за мить до того, як її права приїхали з бази.
  const catchAllStatus = authStatus === 'in' && !isAccessResolved ? 'pending' : authStatus;

  return (
    <Routes>
      {/* Публічних екранів три, і всі вони не читають бази: форма входу,
          текст угоди (на нього веде кнопка «Умови» з самої форми) і зовнішня
          анкета подачі. Решта застосунку — про конкретних людей, тож стоїть за
          межею входу. */}
      <Route path="/login" element={<LoginScreen setIsLoggedIn={setIsLoggedIn} authStatus={authStatus} />} />
      <Route path="/policy" element={<PrivacyPolicy />} />
      <Route path="/submit" element={<SubmitForm />} />

      <Route path="/" element={<RequireAuth status={authStatus}>{canAccessAdd ? <AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /> : <PrivacyPolicy />}</RequireAuth>} />
      <Route path="/my-profile" element={<RequireAuth status={authStatus}><MyProfile /></RequireAuth>} />
      <Route path="/my-profile-new" element={<Navigate to="/my-profile" replace />} />
      {isAdmin && <Route path="/my-profile-old" element={<RequireAuth status={authStatus}><MyProfileOld isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /></RequireAuth>} />}
      {canAccessAdd && <Route path="/add" element={<RequireAuth status={authStatus}><AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /></RequireAuth>} />}
      <Route path="/matching" element={<RequireAuth status={authStatus}><Matching /></RequireAuth>} />
      {/* Заводити й доповнювати картки може кожен, хто увійшов: право
          `canCreateProfiles` більше цього екрана не стереже. За ним лишились
          лише службові читання цілих вузлів (перелік усіх чернеток, усі шари
          картки, перелік заявок) — вони й далі за прапорцем. */}
      <Route path="/matching/create-profile" element={<RequireAuth status={authStatus}><ProfileCreationWorkspace /></RequireAuth>} />
      {isAdmin && <Route path="/edit/:userId" element={<RequireAuth status={authStatus}><EditProfile /></RequireAuth>} />}
      {isAdmin && <Route path="/medications/:userId" element={<RequireAuth status={authStatus}><MedicationsPage /></RequireAuth>} />}
      {isAdmin && <Route path="/flow" element={<RequireAuth status={authStatus}><FlowManager ownerId={auth.currentUser?.uid} /></RequireAuth>} />}
      {/*
        Інструмент міграції нічого не пише у Firebase, але читає локальні копії
        обох колекцій цілком — тобто показує контакти всіх анкет. Тож маршрут
        адмінський, як і решта інструментів роботи з сирими даними.
      */}
      {isAdmin && <Route path="/rtdb-migration" element={<RequireAuth status={authStatus}><RtdbMigrationTool /></RequireAuth>} />}
      {isAdmin && <Route path="/budget" element={<RequireAuth status={authStatus}><BudgetPage isAdmin={isAdmin} /></RequireAuth>} />}
      {canAccessInvoices && <Route path="/invoices" element={<RequireAuth status={authStatus}><InvoiceBuilderPage isAdmin={canAccessInvoices} /></RequireAuth>} />}
      {canAccessInvoices && <Route path="/documents" element={<RequireAuth status={authStatus}><DocumentsPage isAdmin={canAccessInvoices} /></RequireAuth>} />}
      {canAccessInvoices && <Route path="/parties" element={<RequireAuth status={authStatus}><PartiesPage isAdmin={canAccessInvoices} /></RequireAuth>} />}

      {/* Маршрут, якого немає в цій таблиці, — це або чуже посилання, або
          екран, на який у читача немає прав. Обидва випадки закінчуються
          осмисленим екраном, а не білою сторінкою: незалогінений іде на вхід
          (і адреса їде з ним), залогінений — у «Мій профіль». */}
      <Route path="*" element={<RequireAuth status={catchAllStatus}><Navigate to="/my-profile" replace /></RequireAuth>} />
    </Routes>
  );
};
