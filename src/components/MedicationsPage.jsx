import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { onValue } from 'firebase/database';
import { FiCopy } from 'react-icons/fi';
import MedicationSchedule from './MedicationSchedule';
import {
  deleteMedicationSchedule,
  fetchUserById,
  getMedicationScheduleRef,
  saveMedicationSchedule,
} from './config';
import { formatMedicationScheduleForClipboard } from '../utils/medicationClipboard';

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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  border: none;
  background-color: #ffb347;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease;
  padding: 0;

  &:hover:not(:disabled) {
    background-color: #ff9a1a;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const FillScheduleButton = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background-color: #ffb347;
  color: white;
  cursor: pointer;
  font-size: 14px;
  margin-left: auto;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
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
  const resetDistributionHandlerRef = useRef(null);
  const [hasResetDistribution, setHasResetDistribution] = useState(false);

  const hasScheduleData = useMemo(
    () =>
      Boolean(
        schedule &&
          Array.isArray(schedule?.rows) &&
          schedule.rows.length > 0 &&
          Array.isArray(schedule?.medicationOrder) &&
          schedule.medicationOrder.length > 0,
      ),
    [schedule],
  );

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

  const handleCopySchedule = useCallback(async () => {
    if (!hasScheduleData || !schedule) {
      toast.error('Немає даних для копіювання');
      return;
    }

    const clipboardText = formatMedicationScheduleForClipboard(schedule);
    if (!clipboardText) {
      toast.error('Немає даних для копіювання');
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(clipboardText);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = clipboardText;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand ? document.execCommand('copy') : false;
        document.body.removeChild(textarea);
        if (!successful) {
          throw new Error('Fallback clipboard copy failed');
        }
      } else {
        throw new Error('Clipboard API is unavailable');
      }
      toast.success('Графік ліків скопійовано до буферу обміну');
    } catch (error) {
      console.error('Failed to copy medication schedule', error);
      toast.error('Не вдалося скопіювати графік ліків');
    }
  }, [hasScheduleData, schedule]);

  const handleResetDistributionHandlerChange = useCallback(handler => {
    resetDistributionHandlerRef.current = handler;
    setHasResetDistribution(typeof handler === 'function');
  }, []);

  const handleResetDistributionClick = useCallback(() => {
    if (typeof resetDistributionHandlerRef.current === 'function') {
      resetDistributionHandlerRef.current();
    }
  }, []);

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

  const canCopySchedule = hasScheduleData && !isScheduleLoading;

  return (
    <PageContainer>
      <Header>
        <ButtonRow>
          <BackButton type="button" onClick={handleClose}>
            Назад
          </BackButton>
          <CopyButton
            type="button"
            onClick={handleCopySchedule}
            disabled={!canCopySchedule}
            aria-label="Скопіювати графік ліків"
            title="Скопіювати графік ліків"
          >
            <FiCopy size={18} />
          </CopyButton>
          <FillScheduleButton
            type="button"
            onClick={handleResetDistributionClick}
            disabled={!hasResetDistribution || isScheduleLoading}
          >
            Заповнити за графіком
          </FillScheduleButton>
          <DeleteButton
            type="button"
            onClick={handleDelete}
            disabled={!ownerId || !userId || isScheduleLoading}
          >
            Видалити весь графік прийому ліків
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
          onResetDistributionChange={handleResetDistributionHandlerChange}
        />
      )}
    </PageContainer>
  );
};

export default MedicationsPage;
