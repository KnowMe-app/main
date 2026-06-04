import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiX } from 'react-icons/fi';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import styled, { keyframes } from 'styled-components';
import {
  auth,
  fetchUserData,
  updateDataInFiresoreDB,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
} from './config';
import { pickerFields, getFieldLabel, getFieldPlaceholder, getOptionLabel, getOptionValue } from './formFields';
import { makeUploadedInfo } from './makeUploadedInfo';
import { inputUpdateValue } from './inputUpdatedValue';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import Photos from './Photos';
import { VerifyEmail } from './VerifyEmail';
import InfoModal from './InfoModal';
import { resolveAccess } from 'utils/accessLevel';
import { getCurrentDate } from './foramtDate';
import { authNotifications } from './authNotifications';
import { ExitButton, SubmitButton } from './MyProfile';

const Page = styled.div`
  --accent: #E8791A;
  --accent-light: #FFF0E0;
  --accent-mid: #F5A24B;
  --bg: #FAFAF8;
  --card: #FFFFFF;
  --text: #1A1A1A;
  --muted: #7A7A72;
  --border: #E8E8E2;
  --radius: 14px;
  --shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
`;
const Topbar = styled.div`
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
`;
const StickyHeader = styled.div`
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--card);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
`;
const STICKY_HEADER_OFFSET = 190;
const ProgressWrap = styled.div`padding: 16px 20px 0;`;
const Tabs = styled.div`padding:14px 20px;display:flex;gap:8px;overflow:auto;`;
const Tab = styled.button`
  flex-shrink: 0; padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 500;
  border: 1.5px solid ${({ $complete, $active }) => ($complete ? '#2E9B55' : $active ? 'var(--accent)' : 'var(--border)')};
  background: ${({ $active, $complete }) => ($active ? 'var(--accent)' : $complete ? '#EBF8EF' : 'var(--card)')};
  color: ${({ $active, $complete }) => ($active ? '#fff' : $complete ? '#2E9B55' : 'var(--muted)')};
`;
const Card = styled.div`margin:0 20px 16px;background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;scroll-margin-top:${STICKY_HEADER_OFFSET}px;`;
const FirstContentCard = styled(Card)`margin-top: 18px;`;
const Header = styled.div`display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg);`;
const FieldGroup = styled.div`padding:0 18px;`;
const Field = styled.div`padding:14px 0;border-bottom:1px solid var(--border); &:last-child{border-bottom:none;}`;
const Label = styled.div`font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:6px;`;
const Input = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 10px 38px 10px 14px;
  outline: none;
  &:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(232, 121, 26, .12); }
`;
const TextArea = styled.textarea`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 10px 38px 10px 14px;
  outline: none;
  min-height: 90px;
`;
const FieldControl = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
`;
const ClearFieldButton = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
`;
const ChipRow = styled.div`display:flex;flex-wrap:wrap;gap:6px;`;
const Chip = styled.button`
  padding: 6px 13px; border-radius: 99px; font-size: 13px; border: 1.5px solid ${({ selected }) => (selected ? 'var(--accent)' : 'var(--border)')};
  background: ${({ selected }) => (selected ? 'var(--accent-light)' : 'var(--card)')}; color: ${({ selected }) => (selected ? 'var(--accent)' : 'var(--muted)')};
`;
const SubmitWrap = styled.div`padding:20px;`;
const PhotoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0 20px 20px;
  padding: 18px;
  background: var(--card);
  border-radius: var(--radius);
  border: 1.5px dashed var(--border);
  box-shadow: var(--shadow);
  min-width: 0;
  scroll-margin-top: ${STICKY_HEADER_OFFSET}px;
`;
const SubmitBtn = styled.button`width:100%;padding:16px;background:linear-gradient(135deg,#E8791A 0%,#F5A24B 100%);color:#fff;border:none;border-radius:var(--radius);font-size:16px;font-weight:700;`;
const CustomOptionWrap = styled.div`margin-top:10px;`;
const DotsButton = styled.button`
  display:flex;align-items:center;justify-content:center;
  width:34px;height:34px;border-radius:8px;border:1px solid var(--border);
  background:var(--card);cursor:pointer;font-size:22px;line-height:1;color:var(--muted);
`;

const AuthCard = styled(FirstContentCard)``;
const hintPulse = keyframes`
  0%, 100% { transform: translateX(0) scale(1); }
  25% { transform: translateX(-2px) scale(1.02); }
  50% { transform: translateX(2px) scale(1.03); }
  75% { transform: translateX(-1px) scale(1.02); }
`;
const StatusBadge = styled.button`
  border: none;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 99px;
  background: #FEE9E9;
  color: #D44;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
`;
const HighlightableLabel = styled(Label)`
  display: inline-block;
  ${({ $active }) => $active && `
    color: var(--accent);
    animation: ${hintPulse} .45s ease-in-out;
  `}
`;

const AuthIntro = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
`;
const AuthField = styled(Field)`
  ${({ $missing }) => $missing && `
    ${Input} {
      border-color: #D44;
      box-shadow: 0 0 0 3px rgba(221, 68, 68, .1);
    }
  `}
`;
const PasswordToggleButton = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;

  &:hover {
    color: var(--text);
  }
`;
const TermsRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 0;
  border-radius: 12px;
  ${({ $missing, $active }) => ($missing || $active) && `
    margin: 8px 0;
    padding: 14px 12px;
    background: rgba(221, 68, 68, .06);
    box-shadow: 0 0 0 3px rgba(221, 68, 68, .1);
    animation: ${hintPulse} .45s ease-in-out;
  `}
`;
const TermsCheckbox = styled.input`
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--accent);
  flex-shrink: 0;
  ${({ $missing, $active }) => ($missing || $active) && `
    outline: 2px solid #D44;
    outline-offset: 2px;
  `}
`;
const TermsText = styled.div`
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
`;
const TermsButton = styled.button`
  border: none;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  padding: 0;
  cursor: pointer;
`;
const AuthActionButton = styled(SubmitBtn)`
  margin: 4px 0 20px;
  ${({ $active }) => $active && `
    animation: ${hintPulse} .45s ease-in-out;
    box-shadow: 0 0 0 4px rgba(232, 121, 26, .16);
  `}
`;

const baseSections = [
  { key: 'personal', title: '👤 Особисті дані', fields: ['name', 'surname', 'birth', 'country', 'region', 'city', 'maritalStatus'] },
  { key: 'medical', title: '🏥 Медична інформація', fields: ['height', 'weight', 'blood', 'surgeries', 'chronicDiseases', 'allergy', 'ownKids', 'lastDelivery', 'csection', 'reward'] },
  { key: 'appearance', title: '✨ Зовнішність', fields: ['eyeColor', 'hairColor', 'hairStructure', 'bodyType', 'clothingSize', 'shoeSize', 'breastSize', 'glasses', 'race'] },
  { key: 'social', title: '📱 Соцмережі', fields: ['telegram', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'vk'] },
  { key: 'lifestyle', title: '🌿 Спосіб життя', fields: ['smoking', 'alcohol', 'education', 'profession', 'hobbies', 'twinsInFamily', 'moreInfo_main'] },
];

const visibleNonDonorFields = new Set(['name','surname','email','phone','telegram','facebook','instagram','tiktok','vk','country','region','city','moreInfo_main']);


export const MyProfileNew = () => {
  const [state, setState] = useState(() => {
    const savedDraft = localStorage.getItem('myProfileDraft');
    if (!savedDraft) return {};

    try {
      const parsedDraft = JSON.parse(savedDraft);
      return { ...parsedDraft, password: '' };
    } catch (error) {
      console.warn('Failed to load MyProfileNew draft.', error);
      localStorage.removeItem('myProfileDraft');
      return {};
    }
  });
  const navigate = useNavigate();
  const currentUid = auth.currentUser?.uid || localStorage.getItem('ownerId') || '';
  const access = resolveAccess({ uid: currentUid, accessLevel: state.accessLevel || localStorage.getItem('accessLevel') });
  const isAdmin = access.isAdmin;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [userId, setUserId] = useState('');
  const [activeTab, setActiveTab] = useState('auth');
  const [customOptionMode, setCustomOptionMode] = useState({});
  const [missing, setMissing] = useState({});
  const [hasAgreed, setHasAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authHintStep, setAuthHintStep] = useState('');
  const sectionRefs = useRef({});
  const tabsRef = useRef(null);
  const tabRefs = useRef({});
  const isManualScrollRef = useRef(false);
  const latestFetchUidRef = useRef('');
  const saveQueueRef = useRef(Promise.resolve());
  const stateRef = useRef(state);
  const editedFieldsRef = useRef(new Set());
  const authHintTimersRef = useRef([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);


  useEffect(() => {
    if (userId || state.userId) return;

    const { password: _password, ...draftState } = state;
    localStorage.setItem('myProfileDraft', JSON.stringify(draftState));
  }, [state, userId]);

  useEffect(() => () => {
    authHintTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
  }, []);

  const normalizeProfileData = (data = {}) => Object.entries(data).reduce((acc, [key, value]) => {
    if (key === 'password') {
      return acc;
    }

    if (key === 'photos' && Array.isArray(value)) {
      acc[key] = value;
      return acc;
    }

    if (Array.isArray(value)) {
      acc[key] = value.length > 0 ? value[value.length - 1] : '';
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});

  const mergeLoadedProfileData = (loadedData, uid) => {
    setState(prevState => {
      const protectedFields = editedFieldsRef.current;
      const nextState = { userRole: 'ed', ...loadedData, userId: uid };

      protectedFields.forEach(fieldName => {
        if (Object.prototype.hasOwnProperty.call(prevState, fieldName)) {
          nextState[fieldName] = prevState[fieldName];
        }
      });

      stateRef.current = nextState;
      return nextState;
    });
  };

  const updateFieldValue = (name, value, field) => {
    const updatedValue = inputUpdateValue(value, field);
    editedFieldsRef.current.add(name);

    setState(prevState => {
      const nextState = {
        ...prevState,
        [name]: updatedValue,
      };

      stateRef.current = nextState;
      return nextState;
    });
  };

  const saveFieldValue = (name, value, field) => {
    const updatedValue = inputUpdateValue(value, field);
    editedFieldsRef.current.add(name);

    const nextState = {
      ...stateRef.current,
      [name]: updatedValue,
    };

    stateRef.current = nextState;
    setState(nextState);
    triggerAutosave(nextState);
  };

  const clearFieldValue = (name, field) => {
    saveFieldValue(name, '', field);
  };

  const normalizedRole = String(state.userRole || state.role || '').trim().toLowerCase();
  const isDonorRole = !normalizedRole || ['ed', 'donor', 'до'].includes(normalizedRole);
  const isProfileAccessConfirmed = Boolean(userId || state.userId);
  const sections = useMemo(() => baseSections.map(section => {
    if (section.key !== 'personal' || !isProfileAccessConfirmed || section.fields.includes('email')) {
      return section;
    }

    const fields = [...section.fields];
    fields.splice(2, 0, 'email');
    return { ...section, fields };
  }), [isProfileAccessConfirmed]);
  const visibleSections = sections
    .map(section => ({ ...section, fields: section.fields.filter(name => isDonorRole || visibleNonDonorFields.has(name)) }))
    .filter(section => section.fields.length > 0);
  const firstSectionKey = visibleSections[0]?.key || 'personal';
  const navSections = useMemo(() => [
    ...(!isProfileAccessConfirmed ? [{ key: 'auth', title: '🔐 Доступ до анкети', fields: ['email', 'password', 'terms'], isVirtual: true }] : []),
    { key: 'photo', title: '📷 Фото', fields: ['photos'], isVirtual: true },
    ...visibleSections,
  ], [isProfileAccessConfirmed, visibleSections]);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const uid = user?.uid || localStorage.getItem('ownerId') || '';
      if (!uid) return;
      latestFetchUidRef.current = uid;
      setUserId(uid);
      const { existingData } = await fetchUserData(uid);

      if (!isMounted || latestFetchUidRef.current !== uid) {
        return;
      }

      mergeLoadedProfileData(normalizeProfileData(existingData || {}), uid);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setIsEmailVerified(Boolean(user?.emailVerified));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (state.areTermsConfirmed && !hasAgreed) {
      setHasAgreed(true);
    }
  }, [state.areTermsConfirmed, hasAgreed]);

  const handleExit = async () => {
    await signOut(auth);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('ownerId');
    navigate('/');
  };

  const dotsMenu = () => (
    <>
      {(isAdmin || access.canAccessAdd || access.canAccessMatching) && (
        <>
          <SubmitButton onClick={() => navigate('/my-profile')}>my profile</SubmitButton>
          <SubmitButton onClick={() => navigate('/my-profile-new')}>my profile new</SubmitButton>
          {(isAdmin || access.canAccessAdd) && <SubmitButton onClick={() => navigate('/add')}>add</SubmitButton>}
          {(isAdmin || access.canAccessMatching) && <SubmitButton onClick={() => navigate('/matching')}>matching</SubmitButton>}
        </>
      )}
      {isAdmin && <SubmitButton onClick={() => navigate('/flow')}>flow</SubmitButton>}
      {!isEmailVerified && <VerifyEmail />}
      <ExitButton onClick={handleExit}>exit</ExitButton>
    </>
  );

  const fieldsMap = useMemo(() => new Map(pickerFields.map(field => [field.name, field])), []);
  const filledPct = useMemo(() => {
    const keys = visibleSections.flatMap(s => s.fields);
    const filled = keys.filter(name => String(state[name] || '').trim() !== '').length;
    return Math.round((filled / keys.length) * 100);
  }, [state, visibleSections]);


  const sectionProgress = useMemo(() => visibleSections.reduce((acc, section) => {
    const filled = section.fields.filter(name => String(state[name] || '').trim() !== '').length;
    const total = section.fields.length;
    acc[section.key] = {
      filled,
      total,
      complete: total > 0 && filled === total,
      progress: total > 0 ? Math.round((filled / total) * 100) : 0,
    };
    return acc;
  }, {}), [state, visibleSections]);


  const scrollToSection = (sectionKey) => {
    setActiveTab(sectionKey);
    const sectionEl = sectionRefs.current[sectionKey];
    if (!sectionEl) return;
    isManualScrollRef.current = true;

    const sectionTop = sectionEl.getBoundingClientRect().top + window.scrollY;
    const targetTop = Math.max(0, sectionTop - STICKY_HEADER_OFFSET);
    window.scrollTo({ top: targetTop, behavior: 'smooth' });

    window.setTimeout(() => {
      isManualScrollRef.current = false;
    }, 500);
  };

  useEffect(() => {
    const entries = navSections
      .map(section => ({ key: section.key, node: sectionRefs.current[section.key] }))
      .filter(item => Boolean(item.node));

    if (entries.length === 0 || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (isManualScrollRef.current) return;

        const visible = observerEntries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length === 0) return;

        const current = entries.find(item => item.node === visible[0].target);
        if (current?.key) {
          setActiveTab(prev => (prev === current.key ? prev : current.key));
        }
      },
      {
        root: null,
        rootMargin: `-${STICKY_HEADER_OFFSET}px 0px -45% 0px`,
        threshold: [0.15, 0.3, 0.5, 0.7],
      },
    );

    entries.forEach(item => observer.observe(item.node));

    return () => observer.disconnect();
  }, [navSections]);


  useEffect(() => {
    if (navSections.some(section => section.key === activeTab)) return;
    setActiveTab(firstSectionKey);
  }, [activeTab, firstSectionKey, navSections]);


  useEffect(() => {
    const tabsEl = tabsRef.current;
    const activeTabEl = tabRefs.current[activeTab];

    if (!tabsEl || !activeTabEl) return;

    activeTabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);

  const handleAuthBadgeClick = () => {
    if (isProfileAccessConfirmed) return;

    authHintTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    scrollToSection('auth');
    const sequence = ['email', 'password', 'terms', 'submit'];
    setAuthHintStep('');
    authHintTimersRef.current = sequence.flatMap((step, index) => ([
      window.setTimeout(() => setAuthHintStep(step), 60 + index * 520),
      window.setTimeout(() => setAuthHintStep(''), 460 + index * 520),
    ]));
  };

  const isValidEmail = email => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  };

  const isPermissionDeniedError = error => {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return code.includes('permission-denied') || code.includes('permission_denied') || message.includes('permission_denied');
  };

  const persistUserWithFallback = async (targetUserId, nextUploadedInfo, firestoreCondition = 'update') => {
    let shouldWriteFullProfileToNewUsers = false;

    try {
      await updateDataInRealtimeDB(targetUserId, nextUploadedInfo, firestoreCondition === 'update' ? 'update' : undefined);
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }
      shouldWriteFullProfileToNewUsers = true;
      console.warn('No write access to users/$uid, fallback to newUsers.');
    }

    try {
      await updateDataInFiresoreDB(targetUserId, nextUploadedInfo, firestoreCondition);
    } catch (error) {
      shouldWriteFullProfileToNewUsers = true;
      console.warn('Firestore write failed, fallback to newUsers.', error);
    }

    await updateDataInNewUsersRTDB(
      targetUserId,
      shouldWriteFullProfileToNewUsers ? nextUploadedInfo : { lastLogin2: nextUploadedInfo.lastLogin2 },
      'update'
    );
  };

  const handleAuthConfirm = async () => {
    const currentState = stateRef.current || {};
    const normalizedEmail = String(currentState.email || '').trim();
    const password = String(currentState.password || '');
    const miss = {};

    if (!normalizedEmail) {
      miss.email = true;
      authNotifications.emailRequired();
    } else if (!isValidEmail(normalizedEmail)) {
      miss.email = true;
      authNotifications.invalidEmail();
    }

    if (!password.trim()) {
      miss.password = true;
      authNotifications.passwordRequired();
    }

    if (!hasAgreed) {
      miss.terms = true;
      authNotifications.termsRequired();
    }

    setMissing(miss);

    if (Object.keys(miss).length) return;

    try {
      const { todayDays, todayDash } = getCurrentDate();
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      let userCredential;
      let uploadedInfo;
      const { password: _password, userId: _userId, ...draftProfileData } = stateRef.current;

      if (methods.length > 0) {
        userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        uploadedInfo = {
          ...draftProfileData,
          email: normalizedEmail,
          areTermsConfirmed: todayDays,
          lastLogin: todayDays,
          lastLogin2: todayDash,
          userId: userCredential.user.uid,
          userRole: 'ed',
        };
        await persistUserWithFallback(userCredential.user.uid, uploadedInfo, 'update');
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await sendEmailVerification(userCredential.user);
        uploadedInfo = {
          ...draftProfileData,
          email: normalizedEmail,
          areTermsConfirmed: todayDays,
          registrationDate: todayDays,
          lastLogin: todayDays,
          lastLogin2: todayDash,
          userId: userCredential.user.uid,
          userRole: 'ed',
        };
        await persistUserWithFallback(userCredential.user.uid, uploadedInfo, 'set');
      }

      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userEmail', normalizedEmail);
      localStorage.setItem('ownerId', userCredential.user.uid);
      localStorage.removeItem('myProfileDraft');

      setHasAgreed(true);
      setUserId(userCredential.user.uid);
      setMissing({});
      const nextState = {
        ...stateRef.current,
        ...uploadedInfo,
        password: stateRef.current.password,
      };
      stateRef.current = nextState;
      setState(nextState);
    } catch (error) {
      const errorCode = String(error?.code || '');

      if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        setMissing(prev => ({ ...prev, password: true }));
        authNotifications.wrongPassword();
      } else if (errorCode === 'auth/invalid-email') {
        setMissing(prev => ({ ...prev, email: true }));
        authNotifications.invalidEmail();
      } else if (errorCode === 'auth/weak-password') {
        setMissing(prev => ({ ...prev, password: true }));
        authNotifications.weakPassword();
      } else {
        console.error('auth error', error);
        authNotifications.genericAuthError();
      }
    }
  };

  const saveState = (nextState, { directFields = [] } = {}) => {
    const targetUserId = userId || nextState?.userId || stateRef.current.userId;
    if (!targetUserId) return Promise.resolve();

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const { existingData } = await fetchUserData(targetUserId);
        const { password: _password, ...profileData } = nextState;
        const normalizedProfileData = {
          ...profileData,
          userRole: profileData.userRole || 'ed',
        };
        const uploadedInfo = makeUploadedInfo(existingData, normalizedProfileData);
        directFields.forEach(field => {
          if (Object.prototype.hasOwnProperty.call(normalizedProfileData, field)) {
            uploadedInfo[field] = normalizedProfileData[field];
          }
        });
        delete uploadedInfo.password;
        await persistUserWithFallback(targetUserId, uploadedInfo, 'check');
      });

    return saveQueueRef.current;
  };

  const triggerAutosave = (nextState) => {
    saveState(nextState).catch(error => {
      console.warn('Autosave failed in MyProfileNew.', error);
    });
  };

  const publishProfile = async () => {
    if (!isProfileAccessConfirmed) {
      await handleAuthConfirm();
      if (!stateRef.current.userId && !userId) {
        return;
      }
    }

    const nextState = { ...stateRef.current, publish: true };
    stateRef.current = nextState;
    setState(nextState);

    try {
      await saveState(nextState, { directFields: ['publish'] });
      localStorage.removeItem('myProfileDraft');
    } catch (error) {
      console.error('publish error', error);
      throw error;
    }
  };

  const renderField = (name) => {
    const field = fieldsMap.get(name);
    if (!field) return null;
    const val = state[name] || '';
    const isTextArea = name === 'moreInfo_main';
    const isAppearanceField = sections.find(section => section.key === 'appearance')?.fields.includes(name);
    const optionValues = Array.isArray(field.options) ? field.options.map(getOptionValue).map(String) : [];
    const optionLabels = Array.isArray(field.options) ? field.options.map(getOptionLabel).map(String) : [];
    const isYesNoField = optionValues.includes('No')
      && optionValues.includes('Yes')
      && optionLabels.includes('Ні')
      && optionLabels.includes('Так');
    const canUseCustomOption = isAppearanceField || isYesNoField || name === 'csection';
    const customSelected = canUseCustomOption
      && (Boolean(customOptionMode[name]) || (String(val).trim() !== '' && !optionValues.includes(String(val))));

    return <Field key={name}>
      <Label>{getFieldLabel(field)}</Label>
      {Array.isArray(field.options) && field.options.length > 0 ? (
        <>
          <ChipRow>
            {field.options.map(option => {
              const optionValue = getOptionValue(option);
              const selected = String(val) === String(optionValue);
              return <Chip
                key={`${name}-${optionValue}`}
                selected={selected}
                onClick={() => {
                  setCustomOptionMode(prev => ({ ...prev, [name]: false }));
                  const isSelected = String(state[name] || '') === String(optionValue);
                  const nextState = { ...stateRef.current, [name]: isSelected ? '' : optionValue };
                  editedFieldsRef.current.add(name);
                  stateRef.current = nextState;
                  setState(nextState);
                  triggerAutosave(nextState);
                }}
                type="button"
              >
                {getOptionLabel(option)}
              </Chip>;
            })}
            {canUseCustomOption ? (
              <Chip
                key={`${name}-custom-option`}
                selected={customSelected}
                onClick={() => {
                  setCustomOptionMode(prev => ({ ...prev, [name]: true }));
                  if (!customSelected) {
                    updateFieldValue(name, '', field);
                  }
                }}
                type="button"
              >
                Свій варіант
              </Chip>
            ) : null}
          </ChipRow>
          {canUseCustomOption && customSelected ? (
            <CustomOptionWrap>
              <FieldControl>
                <Input
                  value={val}
                  placeholder="Введіть свій варіант"
                  onChange={e => updateFieldValue(name, e.target.value, field)}
                  onBlur={e => saveFieldValue(name, e.target.value, field)}
                />
                {val ? (
                  <ClearFieldButton
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => clearFieldValue(name, field)}
                    aria-label="Очистити поле"
                  >
                    <FiX size={16} />
                  </ClearFieldButton>
                ) : null}
              </FieldControl>
            </CustomOptionWrap>
          ) : null}
        </>
      ) : isTextArea ? (
        <FieldControl>
          <TextArea
            value={val}
            placeholder={getFieldPlaceholder(field)}
            onChange={e => updateFieldValue(name, e.target.value, field)}
            onBlur={e => saveFieldValue(name, e.target.value, field)}
          />
          {val ? (
            <ClearFieldButton
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => clearFieldValue(name, field)}
              aria-label="Очистити поле"
            >
              <FiX size={16} />
            </ClearFieldButton>
          ) : null}
        </FieldControl>
      ) : (
        <FieldControl>
          <Input
            value={val}
            placeholder={getFieldPlaceholder(field)}
            onChange={e => updateFieldValue(name, e.target.value, field)}
            onBlur={e => saveFieldValue(name, e.target.value, field)}
          />
          {val ? (
            <ClearFieldButton
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => clearFieldValue(name, field)}
              aria-label="Очистити поле"
            >
              <FiX size={16} />
            </ClearFieldButton>
          ) : null}
        </FieldControl>
      )}
    </Field>;
  };

  return <Page>
    <StickyHeader>
      <Topbar>
        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18 }}>Know<span style={{ color: '#E8791A', fontStyle: 'italic' }}>Me</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge type="button" $clickable={!isProfileAccessConfirmed} onClick={handleAuthBadgeClick}>
            ● {isProfileAccessConfirmed ? 'Прихована' : 'Логін не відбувся'}
          </StatusBadge>
          {isProfileAccessConfirmed && <DotsButton type='button' onClick={() => setShowInfoModal('dotsMenu')}>⋮</DotsButton>}
        </div>
      </Topbar>

      <ProgressWrap>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Заповнено анкету</span>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{filledPct}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
        <div style={{ width: `${filledPct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-mid) 100%)' }} />
      </div>
    </ProgressWrap>

      <Tabs ref={tabsRef}>
        {navSections.map(s => {
          const info = s.key === 'photo'
            ? { complete: Array.isArray(state.photos) && state.photos.length > 0 }
            : sectionProgress[s.key] || {};
          return <Tab
            key={s.key}
            ref={node => { tabRefs.current[s.key] = node; }}
            $active={activeTab === s.key}
            $complete={Boolean(info.complete)}
            type="button"
            onClick={() => scrollToSection(s.key)}
          >
            {s.title}
          </Tab>;
        })}
      </Tabs>
    </StickyHeader>

    {!isProfileAccessConfirmed && <AuthCard ref={node => { sectionRefs.current.auth = node; }}>
      <Header>
        <div>🔐</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Доступ до анкети</div>
      </Header>
      <FieldGroup>
        <Field>
          <AuthIntro>
            Введіть email і пароль, щоб продовжити заповнення анкети. Якщо акаунт уже існує — ми виконаємо вхід, якщо ні — створимо профіль донора.
          </AuthIntro>
        </Field>
        <AuthField $missing={missing.email}>
          <HighlightableLabel $active={authHintStep === 'email'}>Email</HighlightableLabel>
          <FieldControl>
            <Input
              type="email"
              name="email"
              value={state.email || ''}
              placeholder="Введіть емейл"
              autoComplete="email"
              onChange={e => {
                const value = e.target.value;
                editedFieldsRef.current.add('email');
                setMissing(prev => ({ ...prev, email: false }));
                setState(prevState => {
                  const nextState = { ...prevState, email: value };
                  stateRef.current = nextState;
                  return nextState;
                });
              }}
            />
            {state.email ? (
              <ClearFieldButton
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  editedFieldsRef.current.add('email');
                  setState(prevState => {
                    const nextState = { ...prevState, email: '' };
                    stateRef.current = nextState;
                    return nextState;
                  });
                }}
                aria-label="Очистити email"
              >
                <FiX size={16} />
              </ClearFieldButton>
            ) : null}
          </FieldControl>
        </AuthField>
        <AuthField $missing={missing.password}>
          <HighlightableLabel $active={authHintStep === 'password'}>Password</HighlightableLabel>
          <FieldControl>
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={state.password || ''}
              placeholder="Придумайте / введіть пароль"
              autoComplete="new-password"
              onChange={e => {
                const value = e.target.value;
                setMissing(prev => ({ ...prev, password: false }));
                setState(prevState => {
                  const nextState = { ...prevState, password: value };
                  stateRef.current = nextState;
                  return nextState;
                });
              }}
            />
            <PasswordToggleButton type="button" onClick={() => setShowPassword(prev => !prev)} aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'}>
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </PasswordToggleButton>
          </FieldControl>
        </AuthField>
        <TermsRow $missing={missing.terms} $active={authHintStep === 'terms'}>
          <TermsCheckbox
            id="my-profile-new-terms"
            type="checkbox"
            checked={hasAgreed}
            $missing={missing.terms}
            $active={authHintStep === 'terms'}
            onChange={e => {
              setHasAgreed(e.target.checked);
              setMissing(prev => ({ ...prev, terms: false }));
            }}
          />
          <TermsText>
            <label htmlFor="my-profile-new-terms">Я підтверджую згоду з умовами програми. </label>
            <TermsButton type="button" onClick={() => navigate('/policy')}>Умови</TermsButton>
          </TermsText>
        </TermsRow>
        <AuthActionButton type="button" $active={authHintStep === 'submit'} onClick={handleAuthConfirm}>Підтвердити і продовжити</AuthActionButton>
      </FieldGroup>
    </AuthCard>}

    <PhotoSection ref={node => { sectionRefs.current.photo = node; }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Додайте до 5 фото. Перше — головне</p>
      <Photos
        state={{ ...state, userId }}
        setState={setState}
        uploadInputId="my-profile-new-photo-upload"
        compact
        maxPhotos={5}
      />
    </PhotoSection>


    {visibleSections.map(section => {
      const SectionCard = !isProfileAccessConfirmed && section.key === firstSectionKey ? FirstContentCard : Card;
      return (
      <SectionCard key={section.key} ref={node => { sectionRefs.current[section.key] = node; }}>
        <Header>
          <div>{section.title.split(' ')[0]}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{section.title.replace(/^\S+\s/, '')}</div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: sectionProgress[section.key]?.complete ? '#2E9B55' : 'var(--muted)', background: sectionProgress[section.key]?.complete ? '#EBF8EF' : 'var(--border)', padding: '2px 8px', borderRadius: 99 }}>
            {sectionProgress[section.key]?.filled || 0}/{sectionProgress[section.key]?.total || section.fields.length}
          </div>
        </Header>
        <FieldGroup>{section.fields.map(renderField)}</FieldGroup>
      </SectionCard>
      );
    })}



    {showInfoModal && (
      <InfoModal
        onClose={() => setShowInfoModal(false)}
        text={showInfoModal}
        Context={dotsMenu}
      />
    )}

    <SubmitWrap>
      <SubmitBtn type="button" onClick={publishProfile}>Опублікувати анкету</SubmitBtn>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Анкету можна приховати або видалити будь-коли в налаштуваннях профілю.</p>
    </SubmitWrap>
  </Page>;
};
