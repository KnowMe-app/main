import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { auth, fetchUserData, updateDataInFiresoreDB, updateDataInRealtimeDB } from './config';
import { pickerFields, getFieldLabel, getFieldPlaceholder, getOptionLabel, getOptionValue } from './formFields';
import { makeUploadedInfo } from './makeUploadedInfo';
import { onAuthStateChanged } from 'firebase/auth';

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
const CompareBanner = styled.div`
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 100%);
  color: #fff;
  text-align: center;
  padding: 20px;
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
  width: 100%; background: var(--bg); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px; outline: none;
  &:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(232, 121, 26, .12); }
`;
const TextArea = styled.textarea`
  width: 100%; background: var(--bg); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px; outline: none; min-height: 90px;
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
  width:72px;height:72px;border-radius:50%;
  background: linear-gradient(135deg, #FFE0B2, #FFCC80);
  display:flex;align-items:center;justify-content:center;font-size:28px;
`;
const AvatarBadge = styled.div`
  position:absolute;bottom:0;right:0;width:22px;height:22px;border-radius:50%;
  background: var(--accent);border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;
`;
const PhotoBtn = styled.button`
  margin-left:auto;padding:8px 16px;background:var(--accent-light);color:var(--accent);
  border-radius:8px;font-size:13px;font-weight:600;border:none;
`;

const SubmitBtn = styled.button`width:100%;padding:16px;background:linear-gradient(135deg,#E8791A 0%,#F5A24B 100%);color:#fff;border:none;border-radius:var(--radius);font-size:16px;font-weight:700;`;
const CustomOptionWrap = styled.div`margin-top:10px;`;

const sections = [
  { key: 'personal', title: '👤 Особисті дані', fields: ['name', 'surname', 'birth', 'country', 'region', 'city', 'email', 'maritalStatus'] },
  { key: 'medical', title: '🏥 Медична інформація', fields: ['height', 'weight', 'blood', 'surgeries', 'chronicDiseases', 'allergy', 'ownKids', 'lastDelivery', 'csection', 'reward'] },
  { key: 'appearance', title: '✨ Зовнішність', fields: ['eyeColor', 'hairColor', 'hairStructure', 'bodyType', 'clothingSize', 'shoeSize', 'breastSize', 'glasses', 'race'] },
  { key: 'social', title: '📱 Соцмережі', fields: ['telegram', 'facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'vk'] },
  { key: 'lifestyle', title: '🌿 Спосіб життя', fields: ['smoking', 'alcohol', 'education', 'profession', 'hobbies', 'twinsInFamily', 'moreInfo_main'] },
];

export const MyProfileNew = () => {
  const [state, setState] = useState({});
  const [userId, setUserId] = useState('');
  const [activeTab, setActiveTab] = useState('personal');
  const sectionRefs = useRef({});

  const normalizeProfileData = (data = {}) => Object.entries(data).reduce((acc, [key, value]) => {
    if (key === 'password') {
      return acc;
    }

    if (key === 'photos' && Array.isArray(value)) {
      acc[key] = value;
      return acc;
    }

    acc[key] = Array.isArray(value) ? value[value.length - 1] : value;
    return acc;
  }, {});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const uid = user?.uid || localStorage.getItem('ownerId') || '';
      if (!uid) return;
      setUserId(uid);
      const { existingData } = await fetchUserData(uid);
      setState(normalizeProfileData(existingData || {}));
    });

    return () => unsubscribe();
  }, []);

  const fieldsMap = useMemo(() => new Map(pickerFields.map(field => [field.name, field])), []);
  const filledPct = useMemo(() => {
    const keys = sections.flatMap(s => s.fields);
    const filled = keys.filter(name => String(state[name] || '').trim() !== '').length;
    return Math.round((filled / keys.length) * 100);
  }, [state]);


  const sectionProgress = useMemo(() => sections.reduce((acc, section) => {
    const filled = section.fields.filter(name => String(state[name] || '').trim() !== '').length;
    const total = section.fields.length;
    acc[section.key] = {
      filled,
      total,
      complete: total > 0 && filled === total,
      progress: total > 0 ? Math.round((filled / total) * 100) : 0,
    };
    return acc;
  }, {}), [state]);

  const scrollToSection = (sectionKey) => {
    setActiveTab(sectionKey);
    const sectionEl = sectionRefs.current[sectionKey];
    if (!sectionEl) return;
    sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const save = async () => {
    if (!userId) return;
    const { existingData } = await fetchUserData(userId);
    const { password: _password, ...profileData } = state;
    const uploadedInfo = makeUploadedInfo(existingData, profileData);
    delete uploadedInfo.password;
    await updateDataInRealtimeDB(userId, uploadedInfo);
    await updateDataInFiresoreDB(userId, uploadedInfo, 'check');
  };

  const renderField = (name) => {
    const field = fieldsMap.get(name);
    if (!field) return null;
    const val = state[name] || '';
    const isTextArea = name === 'moreInfo_main';
    const isAppearanceField = sections.find(section => section.key === 'appearance')?.fields.includes(name);
    const optionValues = Array.isArray(field.options) ? field.options.map(getOptionValue).map(String) : [];
    const customSelected = isAppearanceField && String(val).trim() !== '' && !optionValues.includes(String(val));

    return <Field key={name}>
      <Label>{getFieldLabel(field)}</Label>
      {Array.isArray(field.options) && field.options.length > 0 ? (
        <ChipRow>
          {field.options.map(option => {
            const optionValue = getOptionValue(option);
            const selected = String(val) === String(optionValue);
            return <Chip
              key={`${name}-${optionValue}`}
              selected={selected}
              onClick={() => setState(prev => ({ ...prev, [name]: optionValue }))}
              type="button"
            >
              {getOptionLabel(option)}
            </Chip>;
          })}
          {isAppearanceField ? (
            <Chip
              key={`${name}-custom-option`}
              selected={customSelected}
              onClick={() => {
                if (!customSelected) {
                  setState(prev => ({ ...prev, [name]: '' }));
                }
              }}
              type="button"
            >
              Свій варіант
            </Chip>
          ) : null}
        </ChipRow>
        {isAppearanceField && customSelected ? (
          <CustomOptionWrap>
              <Input
              value={val}
              placeholder="Введіть свій варіант"
              onChange={e => setState(prev => ({ ...prev, [name]: e.target.value }))}
            />
          </CustomOptionWrap>
        ) : null}
      ) : isTextArea ? (
        <TextArea value={val} placeholder={getFieldPlaceholder(field)} onChange={e => setState(prev => ({ ...prev, [name]: e.target.value }))} />
      ) : (
        <Input value={val} placeholder={getFieldPlaceholder(field)} onChange={e => setState(prev => ({ ...prev, [name]: e.target.value }))} />
      )}
    </Field>;
  };

  return <Page>
    <CompareBanner>
      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, marginBottom: 6 }}>Редизайн <span style={{ color: '#F5A24B', fontStyle: 'italic' }}>анкети</span></h2>
      <p style={{ color: '#aaa', fontSize: 12 }}>Пропозиції покращення UI/UX</p>
    </CompareBanner>

    <StickyHeader>
      <Topbar>
        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18 }}>Know<span style={{ color: '#E8791A', fontStyle: 'italic' }}>Me</span></div>
        <div style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 99, background: '#FEE9E9', color: '#D44' }}>● Прихована</div>
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

      <Tabs>
        {sections.map(s => {
          const info = sectionProgress[s.key] || {};
          return <Tab
            key={s.key}
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
        <AvatarImg>🧑</AvatarImg>
        <AvatarBadge>+</AvatarBadge>
      </AvatarRing>
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>Фото профілю</h4>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Додайте до 5 фото.<br />Перше — головне.</p>
      </div>
      <PhotoBtn type="button">Додати</PhotoBtn>
    </PhotoSection>

    {sections.map(section => (
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

    <SubmitWrap>
      <SubmitBtn type="button" onClick={save}>Опублікувати анкету</SubmitBtn>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Анкету можна приховати або видалити будь-коли в налаштуваннях профілю.</p>
    </SubmitWrap>
  </Page>;
};
