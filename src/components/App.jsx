import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate  } from 'react-router-dom';
import { LoginScreen } from './LoginScreen';
import PrimaryNavigation from './PrimaryNavigation';
import { PrimaryNavigationSlotProvider } from './PrimaryNavigationSlot';
import { RequireAuth, ScreenLoading } from './RequireAuth';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';
import { auth, fetchUserById, resetViewerAccessLevelCache } from './config';
import { clearStoredAccessRights, isReadOnlyAdminUid, persistCanCreateProfiles, resolveAccess } from 'utils/accessLevel';
import { applyStoredAppSettings } from 'hooks/useAppSettings';
import { clearMyProfileCache } from 'utils/myProfileCache';
import { ReadOnlyBadge } from './ReadOnlyBadge';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';

// Екрани вантажаться окремо від головного файлу. Доки вони стояли статичними
// імпортами, кожен відвідувач ще до форми входу качав 6,6 МБ JS (1,67 МБ gzip),
// зокрема PDF-, Excel- і Word-рушії адмінки, якими звичайний читач не
// користується ніколи: на повільному 4G середній телефон показував білий екран
// ~12 секунд. Форма входу лишається в головному файлі — вона перший екран
// новачка. Стрічку, «Мій профіль» і форму картки браузер довантажує у вільну
// хвилину (`webpackPrefetch`), тож після входу на них не чекають; адмінські
// екрани — лише тим, хто їх відкриває.
const pickNamed = (load, name) => () => load().then(module => ({ default: module[name] }));
const PrivacyPolicy = lazy(pickNamed(() => import('./PrivacyPolicy'), 'PrivacyPolicy'));
const SharedProfilePage = lazy(pickNamed(() => import('./SharedProfilePage'), 'SharedProfilePage'));
const MyProfile = lazy(pickNamed(() => import(/* webpackPrefetch: true */ './MyProfile'), 'MyProfile'));
const Matching = lazy(() => import(/* webpackPrefetch: true */ './Matching'));
const ProfileCreationWorkspace = lazy(() => import(/* webpackPrefetch: true */ './ProfileCreationWorkspace'));
const AddNewProfile = lazy(pickNamed(() => import('./AddNewProfile'), 'AddNewProfile'));
const EditProfile = lazy(() => import('./EditProfile'));
const MedicationsPage = lazy(() => import('./MedicationsPage'));
const FlowManager = lazy(() => import('./FlowManager'));
const BudgetPage = lazy(() => import('./BudgetPage'));
const InvoiceBuilderPage = lazy(() => import('./InvoiceBuilderPage'));
const DocumentsPage = lazy(() => import('./DocumentsPage'));
const PartiesPage = lazy(() => import('./PartiesPage'));

// Тестовий акаунт бачить адмінські екрани, але база його правок там не приймає.
// На матчингу він пише як звичайний користувач (своя анкета, реакції, нотатки,
// чернетки, доповнення), а в конструкторі документів — як редактор
// `documentsBuilder`, тож там позначка брехала б: правка зберігається. Перелік —
// саме екранів, де запис проходить: новий екран, якого тут немає, отримує
// позначку, а не мовчанку. На `/matching/create-profile` позначку ставить сама
// форма й лише над чужою чернеткою (її автозбереження пише у вузол авторки, а
// туди правила пускають лише повного адміна): своя картка й доповнення там
// зберігаються.
const READ_ONLY_INSPECTOR_WRITABLE_PATHS = ['/matching', '/matching/create-profile', '/my-profile', '/documents', '/parties'];

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

    // Корінь `/` сюди більше не потрапляє: він сам веде не-адміна в «Мій
    // профіль» (див. маршрут нижче). Поки корінь чекав на цей ефект, людина
    // бачила там текст угоди, а історія тримала `/`, і «назад» повертав на нього.
    const isUnauthorizedAddRoute = location.pathname === '/add' && !canAccessAdd;

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
        // Власна анкета з «Мого профілю» (`utils/myProfileCache`) — теж стан
        // входу: на спільному пристрої наступний читач її мати не мусить.
        clearMyProfileCache();
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
  const normalizedPathname = location.pathname.replace(/\/+$/, '') || '/';

  return (
    <PrimaryNavigationSlotProvider>
      {authStatus === 'in' && ['/matching', '/matching/create-profile', '/my-profile'].includes(normalizedPathname) && <PrimaryNavigation />}
      {authStatus === 'in' && isReadOnlyAdminUid(auth.currentUser?.uid) && !READ_ONLY_INSPECTOR_WRITABLE_PATHS.includes(normalizedPathname) ? (
        <ReadOnlyBadge />
      ) : null}
      <ScreenErrorBoundary resetKey={normalizedPathname}>
      <Suspense fallback={<ScreenLoading />}>
      <Routes>
      {/* Публічні екрани не читають бази: це форма входу та текст угоди, на
          який веде кнопка «Умови» з самої форми. Решта застосунку — про
          конкретних людей, тож стоїть за межею входу. */}
      <Route path="/login" element={<LoginScreen setIsLoggedIn={setIsLoggedIn} authStatus={authStatus} />} />
      <Route path="/policy" element={<PrivacyPolicy />} />
      {/* Анкета за посиланням: без входу, але читає рівно один вузол —
          знімок `profileShares/{token}/card`, який власниця сама випустила
          й може відкликати (`utils/profileShare`). Межа входу решти
          застосунку від цього не зрушує: каталогу звідси не перелічити. */}
      <Route path="/p/:token" element={<SharedProfilePage />} />

      {/* Корінь — робочий стіл адміна, решту він веде в «Мій профіль». Поки
          права не прочитані, тут очікування (`catchAllStatus`), а не текст
          угоди, який залогінена людина бачила тут до редиректу. */}
      <Route path="/" element={<RequireAuth status={catchAllStatus}>{isAdmin ? <AddNewProfile isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} /> : <Navigate to="/my-profile" replace />}</RequireAuth>} />
      <Route path="/my-profile" element={<RequireAuth status={authStatus}><MyProfile /></RequireAuth>} />
      <Route path="/my-profile-new" element={<Navigate to="/my-profile" replace />} />
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
      </Suspense>
      </ScreenErrorBoundary>
    </PrimaryNavigationSlotProvider>
  );
};
