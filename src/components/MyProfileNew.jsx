import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiX } from 'react-icons/fi';
import styled from 'styled-components';
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
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Photos from './Photos';
import { VerifyEmail } from './VerifyEmail';
import InfoModal from './InfoModal';
import { resolveAccess } from 'utils/accessLevel';
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
const STICKY_HEADER_OFFSET = 150;
const ProgressWrap = styled.div`padding: 16px 20px 0;`;
const Tabs = styled.div`padding:14px 20px;display:flex;gap:8px;overflow:auto;`;
const Tab = styled.button`
  flex-shrink: 0; padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 500;
  border: 1.5px solid ${({ complete, active }) => (complete ? '#2E9B55' : active ? 'var(--accent)' : 'var(--border)')};
  background: ${({ active, complete }) => (active ? 'var(--accent)' : complete ? '#EBF8EF' : 'var(--card)')};
  color: ${({ active, complete }) => (active ? '#fff' : complete ? '#2E9B55' : 'var(--muted)')};
`;
const Card = styled.div`margin:0 20px 16px;background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;`;
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
  align-items: center;
  gap: 16px;
  margin: 0 20px 20px;
  padding: 18px;
  background: var(--card);
  border-radius: var(--radius);
  border: 1.5px dashed var(--border);
  box-shadow: var(--shadow);
`;
const AvatarRing = styled.div`position:relative;flex-shrink:0;`;
const AvatarImg = styled.div`
  width:72px;
  height:72px;
  border-radius:50%;
  background: ${({ $photo }) =>
    $photo
      ? `center / cover no-repeat url(${$photo})`
      : 'linear-gradient(135deg, #FFE0B2, #FFCC80)'};
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:28px;
  overflow:hidden;
`;
const AvatarActionBtn = styled.button`
  position:absolute;
  border:none;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#fff;
  cursor:pointer;
`;
const AvatarAddBtn = styled(AvatarActionBtn)`
  bottom:0;
  right:0;
  width:22px;
  height:22px;
  border-radius:50%;
  background: var(--accent);
  border:2px solid #fff;
  font-size:11px;
`;
const PhotoBtn = styled.button`
  margin-left:auto;padding:8px 16px;background:var(--accent-light);color:var(--accent);
  border-radius:8px;font-size:13px;font-weight:600;border:none;
`;
const SubmitBtn = styled.button`width:100%;padding:16px;background:linear-gradient(135deg,#E8791A 0%,#F5A24B 100%);color:#fff;border:none;border-radius:var(--radius);font-size:16px;font-weight:700;`;
const CustomOptionWrap = styled.div`margin-top:10px;`;
const PhotoManagerModal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  visibility: ${({ $open }) => ($open ? 'visible' : 'hidden')};
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
`;
const PhotoManagerCard = styled.div`
  width: min(640px, 100%);
  max-height: 88vh;
  overflow: auto;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
`;
const PhotoManagerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
`;

const DotsButton = styled.button`
  display:flex;align-items:center;justify-content:center;
  width:34px;height:34px;border-radius:8px;border:1px solid var(--border);
  background:var(--card);cursor:pointer;font-size:22px;line-height:1;color:var(--muted);
`;

const IconPlainBtn = styled.button`
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const sections = [
  { key: 'personal', title: '👤 Особисті дані', fields: ['name', 'surname', 'birth', 'country', 'region', 'city', 'email', 'maritalStatus'] },
  { key: 'medical', title: '🏥 Медична інформація', fields: ['height', 'weight', 'blood', 'surgeries', 'chronicDiseases', 'allergy', 'ownKids', 'lastDelivery', 'csection', 'reward'] },
  { key: 'appearance', title: '✨ Зовнішність', fields: ['eyeColor', 'hairColor', 'hairStructure', 'bodyType', 'clothingSize', 'shoeSize', 'breastSize', 'glasses', 'race'] },
  { key: 'social', title: '📱 Соцмережі', fields: ['telegram', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'vk'] },
  { key: 'lifestyle', title: '🌿 Спосіб життя', fields: ['smoking', 'alcohol', 'education', 'profession', 'hobbies', 'twinsInFamily', 'moreInfo_main'] },
];

const visibleNonDonorFields = new Set(['name','surname','email','phone','telegram','facebook','instagram','tiktok','vk','country','region','city','moreInfo_main']);


export const MyProfileNew = () => {
  const [state, setState] = useState({});
  const navigate = useNavigate();
  const currentUid = auth.currentUser?.uid || localStorage.getItem('ownerId') || '';
  const access = resolveAccess({ uid: currentUid, accessLevel: state.accessLevel || localStorage.getItem('accessLevel') });
  const isAdmin = access.isAdmin;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [userId, setUserId] = useState('');
  const [activeTab, setActiveTab] = useState('personal');
  const [customOptionMode, setCustomOptionMode] = useState({});
  const [isPhotoManagerOpen, setIsPhotoManagerOpen] = useState(false);
  const sectionRefs = useRef({});
  const tabsRef = useRef(null);
  const tabRefs = useRef({});
  const isManualScrollRef = useRef(false);
  const latestFetchUidRef = useRef('');
  const saveQueueRef = useRef(Promise.resolve());
  const stateRef = useRef(state);
  const editedFieldsRef = useRef(new Set());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
      const nextState = { ...loadedData, userId: uid };

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
  const visibleSections = sections
    .map(section => ({ ...section, fields: section.fields.filter(name => isDonorRole || visibleNonDonorFields.has(name)) }))
    .filter(section => section.fields.length > 0);

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
    const entries = visibleSections
      .map(section => ({ key: section.key, node: sectionRefs.current[section.key] }))
      .filter(item => Boolean(item.node));

    if (entries.length === 0) return undefined;

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
  }, [visibleSections]);


  useEffect(() => {
    const tabsEl = tabsRef.current;
    const activeTabEl = tabRefs.current[activeTab];

    if (!tabsEl || !activeTabEl) return;

    activeTabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);

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

  const saveState = (nextState) => {
    if (!userId) return Promise.resolve();

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const { existingData } = await fetchUserData(userId);
        const { password: _password, ...profileData } = nextState;
        const uploadedInfo = makeUploadedInfo(existingData, profileData);
        delete uploadedInfo.password;
        await persistUserWithFallback(userId, uploadedInfo, 'check');
      });

    return saveQueueRef.current;
  };

  const triggerAutosave = (nextState) => {
    saveState(nextState).catch(error => {
      console.warn('Autosave failed in MyProfileNew.', error);
    });
  };

  const save = async () => {
    await saveState(state);
  };

  const mainProfilePhoto = Array.isArray(state.photos) && state.photos.length > 0 ? state.photos[0] : '';
  const uploadInputId = 'my-profile-new-photo-upload';

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
    const canUseCustomOption = isAppearanceField || isYesNoField;
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
          <div style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 99, background: '#FEE9E9', color: '#D44' }}>● Прихована</div>
          <DotsButton type='button' onClick={() => setShowInfoModal('dotsMenu')}>⋮</DotsButton>
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
        {visibleSections.map(s => {
          const info = sectionProgress[s.key] || {};
          return <Tab
            key={s.key}
            ref={node => { tabRefs.current[s.key] = node; }}
            active={activeTab === s.key}
            complete={Boolean(info.complete)}
            type="button"
            onClick={() => scrollToSection(s.key)}
          >
            {s.title}
          </Tab>;
        })}
      </Tabs>
    </StickyHeader>

    <PhotoSection>
      <AvatarRing>
        <AvatarImg $photo={mainProfilePhoto}>{mainProfilePhoto ? '' : '🧑'}</AvatarImg>
        <AvatarAddBtn
          type="button"
          onClick={() => setIsPhotoManagerOpen(true)}
          aria-label={mainProfilePhoto ? 'Редагувати фото профілю' : 'Додати фото профілю'}
        >
          {mainProfilePhoto ? <FiEdit2 size={12} /> : '+'}
        </AvatarAddBtn>
      </AvatarRing>
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>Фото профілю</h4>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Додайте до 5 фото.<br />Перше — головне.</p>
      </div>
      <PhotoBtn type="button" onClick={() => setIsPhotoManagerOpen(true)}>{mainProfilePhoto ? 'Редагувати фото' : 'Додати фото'}</PhotoBtn>
    </PhotoSection>


    {visibleSections.map(section => (
      <Card key={section.key} ref={node => { sectionRefs.current[section.key] = node; }}>
        <Header>
          <div>{section.title.split(' ')[0]}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{section.title.replace(/^\S+\s/, '')}</div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: sectionProgress[section.key]?.complete ? '#2E9B55' : 'var(--muted)', background: sectionProgress[section.key]?.complete ? '#EBF8EF' : 'var(--border)', padding: '2px 8px', borderRadius: 99 }}>
            {sectionProgress[section.key]?.filled || 0}/{sectionProgress[section.key]?.total || section.fields.length}
          </div>
        </Header>
        <FieldGroup>{section.fields.map(renderField)}</FieldGroup>
      </Card>
    ))}

    <PhotoManagerModal
      $open={isPhotoManagerOpen}
      onClick={e => { if (e.target === e.currentTarget) setIsPhotoManagerOpen(false); }}
    >
        <PhotoManagerCard>
          <PhotoManagerHeader>
            <div>Керування фотографіями</div>
            <IconPlainBtn type="button" onClick={() => setIsPhotoManagerOpen(false)} aria-label="Закрити">
              <FiX size={18} />
            </IconPlainBtn>
          </PhotoManagerHeader>
          <div style={{ padding: '12px 8px 18px' }}>
            <Photos
              state={{ ...state, userId }}
              setState={setState}
              hideFirstPhoto={Array.isArray(state.photos) && state.photos.length > 1}
              uploadInputId={uploadInputId}
            />
          </div>
        </PhotoManagerCard>
      </PhotoManagerModal>

    {showInfoModal && (
      <InfoModal
        onClose={() => setShowInfoModal(false)}
        text={showInfoModal}
        Context={dotsMenu}
      />
    )}

    <SubmitWrap>
      <SubmitBtn type="button" onClick={save}>Опублікувати анкету</SubmitBtn>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Анкету можна приховати або видалити будь-коли в налаштуваннях профілю.</p>
    </SubmitWrap>
  </Page>;
};
