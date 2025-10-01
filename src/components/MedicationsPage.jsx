import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { onValue } from 'firebase/database';
import { ReactComponent as ClipboardIcon } from 'assets/icons/clipboard.svg';
import MedicationSchedule, { parseDateString } from './MedicationSchedule';
import { deriveScheduleDisplayInfo } from './StimulationSchedule';
import {
  deleteMedicationSchedule,
  fetchUserById,
  getMedicationScheduleRef,
  saveMedicationSchedule,
} from './config';

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  max-width: 960px;
  margin: 0 auto;
  box-sizing: border-box;
  color: black;
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
`;

const BackButton = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background-color: #ffb347;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #ff9a1a;
  }
`;

const CopyButton = styled.button`
  padding: 6px;
  border-radius: 6px;
  border: none;
  background-color: #ffb347;
  color: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;

  svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }

  &:hover {
    background-color: #ff9a1a;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
`;

const Subtitle = styled.span`
  font-size: 14px;
  color: #555;
`;

const DeleteButton = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background-color: #d32f2f;
  color: white;
  cursor: pointer;
  font-size: 14px;
  margin-left: auto;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background-color: #b71c1c;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Card = styled.div`
  background-color: #f9f9f9;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  padding: 20px;
`;

const Message = styled.p`
  margin: 0;
  font-size: 14px;
  color: #444;
`;

const LoadingState = styled.div`
  font-size: 14px;
  color: #666;
`;

const normalizeClipboardDate = (value, referenceDate) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const normalized = new Date(value);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) {
      fromNumber.setHours(0, 0, 0, 0);
      return fromNumber;
    }
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, yearStr, monthStr, dayStr] = isoMatch;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const fromIso = new Date(year, month - 1, day);
      if (!Number.isNaN(fromIso.getTime())) {
        fromIso.setHours(0, 0, 0, 0);
        return fromIso;
      }
    }
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    direct.setHours(0, 0, 0, 0);
    return direct;
  }

  const base = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : null;
  const parsed = parseDateString(trimmed, base);
  if (!parsed) return null;
  const normalized = new Date(parsed);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const extractScheduleEntries = (scheduleSource, baseDate) => {
  const entries = [];
  let reference = baseDate instanceof Date && !Number.isNaN(baseDate.getTime()) ? baseDate : null;

  const pushEntry = (rawDate, rawLabel) => {
    const resolvedDate = normalizeClipboardDate(rawDate, reference || baseDate);
    if (!resolvedDate) return;
    reference = resolvedDate;
    entries.push({
      date: resolvedDate,
      label: rawLabel === null || rawLabel === undefined ? '' : String(rawLabel),
    });
  };

  if (typeof scheduleSource === 'string') {
    const lines = scheduleSource
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    lines.forEach(line => {
      const parts = line.split('\t');
      if (!parts.length) return;
      const datePart = parts[0];
      const labelPart = parts.slice(parts.length > 2 ? 2 : 1).join('\t');
      pushEntry(datePart, labelPart);
    });
  } else if (Array.isArray(scheduleSource)) {
    scheduleSource.forEach(item => {
      if (!item) return;
      pushEntry(item.date || item.day || '', item.label || '');
    });
  } else if (scheduleSource && typeof scheduleSource === 'object') {
    Object.values(scheduleSource).forEach(item => {
      if (!item) return;
      pushEntry(item.date || item.day || '', item.label || '');
    });
  }

  return entries
    .filter(entry => entry.date instanceof Date && !Number.isNaN(entry.date.getTime()))
    .sort((a, b) => a.date - b.date);
};

const buildStimulationClipboardText = (scheduleSource, baseDate) => {
  const entries = extractScheduleEntries(scheduleSource, baseDate);
  if (!entries.length) {
    return '';
  }

  const lines = [];
  let currentYear = null;

  entries.forEach(entry => {
    const year = entry.date.getFullYear();
    if (year !== currentYear) {
      lines.push(String(year));
      currentYear = year;
    }

    const info = deriveScheduleDisplayInfo({ date: entry.date, label: entry.label });
    const segments = [];
    const prefix = `${info.dateStr} ${info.weekday}`.trim();
    if (prefix) {
      segments.push(prefix);
    }
    if (info.secondaryLabel) {
      segments.push(info.secondaryLabel);
    }
    const detail = info.displayLabel || info.labelValue || '';
    if (detail) {
      segments.push(detail);
    }

    const line = segments.join(' ').replace(/\s+/g, ' ').trim();
    if (line) {
      lines.push(line);
    }
  });

  return lines.join('\n').trim();
};

const MedicationsPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => location.state?.user ?? null);
  const [isUserLoading, setIsUserLoading] = useState(!user);
  const [schedule, setSchedule] = useState(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const ownerId = useMemo(() => localStorage.getItem('ownerId'), []);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    if (!userId) {
      setIsUserLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsUserLoading(true);
    fetchUserById(userId)
      .then(result => {
        if (!isMounted) return;
        setUser(result || null);
        setIsUserLoading(false);
      })
      .catch(error => {
        console.error('Failed to fetch user for medications page', error);
        if (isMounted) {
          setIsUserLoading(false);
          toast.error('Не вдалося завантажити профіль користувача');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    setIsScheduleLoading(true);

    if (!ownerId || !userId) {
      setSchedule(null);
      setIsScheduleLoading(false);
      return undefined;
    }

    const scheduleRef = getMedicationScheduleRef(ownerId, userId);
    if (!scheduleRef) {
      setIsScheduleLoading(false);
      return undefined;
    }

    const unsubscribe = onValue(
      scheduleRef,
      snapshot => {
        setSchedule(snapshot.exists() ? snapshot.val() : null);
        setIsScheduleLoading(false);
      },
      error => {
        console.error('Failed to subscribe to medication schedule', error);
        toast.error('Не вдалося завантажити розклад ліків');
        setIsScheduleLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [ownerId, userId]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    },
    [],
  );

  const handleClose = useCallback(() => {
    const from = location.state?.from;
    const userFromState = location.state?.user;

    const navigateWithUser = target => {
      if (userFromState) {
        navigate(target, { state: { user: userFromState } });
      } else {
        navigate(target);
      }
    };

    if (from) {
      if (typeof from === 'string') {
        if (from.includes('userId=') || !userFromState?.userId) {
          navigateWithUser(from);
        } else {
          navigateWithUser(`/add?userId=${userFromState.userId}`);
        }
        return;
      }

      const pathname = from.pathname ?? '';
      const search = from.search ?? '';
      if (pathname) {
        if (search.includes('userId=') || !userFromState?.userId) {
          navigateWithUser({ pathname, search });
        } else {
          navigateWithUser({ pathname, search: `?userId=${userFromState.userId}` });
        }
        return;
      }
    }

    if (userFromState?.userId) {
      navigateWithUser(`/add?userId=${userFromState.userId}`);
      return;
    }

    navigate(-1);
  }, [navigate, location.state]);

  const handleCopyStimulationSchedule = useCallback(async () => {
    const scheduleSource = user?.stimulationSchedule;
    if (!scheduleSource) {
      toast.error('Немає графіку стимуляції для копіювання');
      return;
    }

    if (!navigator?.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      toast.error('Копіювання не підтримується в цьому браузері');
      return;
    }

    const baseDate = parseDateString(user?.lastCycle || '');
    const text = buildStimulationClipboardText(scheduleSource, baseDate);

    if (!text) {
      toast.error('Не вдалося підготувати графік стимуляції для копіювання');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Графік стимуляції скопійовано');
    } catch (error) {
      console.error('Failed to copy stimulation schedule', error);
      toast.error('Не вдалося скопіювати графік стимуляції');
    }
  }, [user?.stimulationSchedule, user?.lastCycle]);

  const handleDelete = useCallback(async () => {
    if (!ownerId || !userId) {
      toast.error('Не вдалося визначити користувача для видалення ліків');
      return;
    }

    const confirmed = window.confirm('Видалити розклад ліків цього пацієнта?');
    if (!confirmed) return;

    try {
      await deleteMedicationSchedule(ownerId, userId);
      setSchedule(null);
      toast.success('Розклад ліків видалено');
      handleClose();
    } catch (error) {
      console.error('Failed to delete medication schedule', error);
      toast.error('Не вдалося видалити розклад ліків');
    }
  }, [ownerId, userId, handleClose]);

  const handleScheduleChange = useCallback(
    updatedSchedule => {
      setSchedule(updatedSchedule);

      if (!ownerId || !userId) {
        toast.error('Увійдіть, щоб зберігати зміни по ліках');
        return;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveMedicationSchedule(ownerId, userId, updatedSchedule).catch(error => {
          console.error('Failed to save medication schedule', error);
          toast.error('Не вдалося зберегти зміни по ліках');
        });
      }, 400);
    },
    [ownerId, userId],
  );

  const userLabel = useMemo(() => {
    if (location.state?.label) return location.state.label;
    if (!user) return '';
    const parts = [user.surname, user.name, user.fathersname].filter(Boolean);
    return parts.join(' ');
  }, [location.state, user]);

  const isReady = !isScheduleLoading && !!ownerId;

  return (
    <PageContainer>
      <Header>
        <ButtonRow>
          <BackButton type="button" onClick={handleClose}>
            Назад
          </BackButton>
          <CopyButton
            type="button"
            onClick={handleCopyStimulationSchedule}
            disabled={!user?.stimulationSchedule}
            aria-label="Скопіювати графік стимуляції"
            title="Скопіювати графік стимуляції"
          >
            <ClipboardIcon />
          </CopyButton>
          <DeleteButton
            type="button"
            onClick={handleDelete}
            disabled={!ownerId || !userId || isScheduleLoading}
          >
            Видалити
          </DeleteButton>
        </ButtonRow>
        <TitleBlock>
          <Title>Ліки</Title>
          {userLabel && <Subtitle>{userLabel}</Subtitle>}
        </TitleBlock>
      </Header>

      {!ownerId && (
        <Card>
          <Message>Щоб працювати з розкладом ліків, увійдіть до системи.</Message>
        </Card>
      )}

      {isUserLoading && <LoadingState>Завантаження профілю…</LoadingState>}

      {isScheduleLoading && ownerId && <LoadingState>Завантаження розкладу…</LoadingState>}

      {isReady && (
        <MedicationSchedule
          data={schedule || {}}
          onChange={handleScheduleChange}
          cycleStart={user?.lastCycle}
          stimulationSchedule={user?.stimulationSchedule}
        />
      )}
    </PageContainer>
  );
};

export default MedicationsPage;
