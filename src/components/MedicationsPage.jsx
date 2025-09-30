import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { onValue } from 'firebase/database';
import MedicationSchedule from './MedicationSchedule';
import { fetchUserById, getMedicationScheduleRef, saveMedicationSchedule } from './config';

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
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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
    if (from) {
      navigate(from);
      return;
    }
    navigate(-1);
  }, [navigate, location.state]);

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
        <BackButton type="button" onClick={handleClose}>
          Назад
        </BackButton>
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
        <Card>
          <MedicationSchedule
            data={schedule || {}}
            onChange={handleScheduleChange}
            onClose={handleClose}
            userLabel={userLabel}
            userId={userId}
            cycleStart={user?.lastCycle}
            stimulationSchedule={user?.stimulationSchedule}
          />
        </Card>
      )}
    </PageContainer>
  );
};

export default MedicationsPage;
