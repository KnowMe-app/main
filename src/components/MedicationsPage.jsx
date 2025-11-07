import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { onValue } from 'firebase/database';
import { FiCopy, FiImage, FiTrash2, FiUpload, FiX } from 'react-icons/fi';
import PhotoViewer from './PhotoViewer';
import MedicationSchedule from './MedicationSchedule';
import {
  deleteMedicationSchedule,
  fetchUserById,
  getMedicationScheduleRef,
  saveMedicationSchedule,
  getUrlofUploadedAvatar,
  getMedicationPhotos,
  deletePhotos,
  clearMedicationScheduleAfterDay,
} from './config';
import { formatMedicationScheduleForClipboard } from '../utils/medicationClipboard';
import { isMedicationPhotoUrl } from '../utils/photoFilters';

const normalizePhotosArray = rawPhotos => {
  if (Array.isArray(rawPhotos)) {
    return rawPhotos.filter(Boolean);
  }
  if (rawPhotos && typeof rawPhotos === 'object') {
    return Object.values(rawPhotos).filter(Boolean);
  }
  return [];
};

const splitPhotosByMedicationFolder = (rawPhotos, userId) => {
  const normalizedPhotos = normalizePhotosArray(rawPhotos);
  return normalizedPhotos.reduce(
    (acc, url) => {
      if (isMedicationPhotoUrl(url, userId)) {
        acc.medication.push(url);
      } else {
        acc.others.push(url);
      }
      return acc;
    },
    { medication: [], others: [] },
  );
};

const arePhotoListsEqual = (first = [], second = []) => {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((item, index) => item === second[index]);
};

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

const IconSquareButton = styled.button`
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

const CopyButton = styled(IconSquareButton)``;

const PhotosButton = styled(IconSquareButton)``;

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

const DeleteButtonsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-left: auto;
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

const ClearScheduleButton = styled(DeleteButton)`
  background-color: #f57c00;

  &:hover:not(:disabled) {
    background-color: #ef6c00;
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

const PhotosModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  box-sizing: border-box;
  z-index: 950;
`;

const PhotosModal = styled.div`
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  width: min(700px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PhotosModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
`;

const PhotosModalTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
`;

const CloseModalButton = styled.button`
  border: none;
  background: transparent;
  color: #333;
  cursor: pointer;
  padding: 4px;

  &:hover {
    color: #000;
  }
`;

const PhotosContent = styled.div`
  padding: 16px 20px 20px;
  overflow-y: auto;
`;

const PhotosGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
`;

const PhotoCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PhotoThumbnailButton = styled.button`
  border: none;
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #f2f2f2;
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover img {
    transform: scale(1.05);
  }
`;

const PhotoThumbnailImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
`;

const PhotoActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const PhotoDeleteButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 6px;
  border: none;
  border-radius: 6px;
  background-color: #d32f2f;
  color: #fff;
  cursor: pointer;
  transition: background-color 0.2s ease;
  font-size: 12px;

  &:hover:not(:disabled) {
    background-color: #b71c1c;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const UploadSection = styled.div`
  margin-top: 20px;
  display: flex;
  justify-content: center;
`;

const UploadLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  background-color: #ffb347;
  color: #fff;
  cursor: pointer;
  transition: background-color 0.2s ease;

  ${({ $disabled }) =>
    $disabled
      ? `
    opacity: 0.7;
    cursor: not-allowed;
    pointer-events: none;
  `
      : `
    &:hover {
      background-color: #ff9a1a;
    }
  `}
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const MedicationsPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => location.state?.user ?? null);
  const [isUserLoading, setIsUserLoading] = useState(!user);
  const [schedule, setSchedule] = useState(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const [medicationPhotos, setMedicationPhotos] = useState(() => {
    const initialUser = location.state?.user;
    if (!initialUser) {
      return [];
    }
    const { medication } = splitPhotosByMedicationFolder(initialUser.photos, initialUser.userId);
    return medication;
  });
  const [isMedicationPhotosLoading, setIsMedicationPhotosLoading] = useState(false);
  const [photosReloadKey, setPhotosReloadKey] = useState(0);
  const ownerId = useMemo(() => localStorage.getItem('ownerId'), []);
  const saveTimeoutRef = useRef(null);
  const [isPhotosModalOpen, setIsPhotosModalOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isClearingSchedule, setIsClearingSchedule] = useState(false);
  const [photoBeingDeleted, setPhotoBeingDeleted] = useState(null);

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
  const canShowPhotos = medicationPhotos.length > 0;

  const resolvedUserId = user?.userId || userId;

  useEffect(() => {
    if (!user?.userId) {
      return;
    }

    setUser(prev => {
      if (!prev || !prev.userId) {
        return prev;
      }
      const split = splitPhotosByMedicationFolder(prev.photos, prev.userId);
      if (arePhotoListsEqual(split.medication, medicationPhotos)) {
        return prev;
      }
      return { ...prev, photos: [...split.others, ...medicationPhotos] };
    });
  }, [medicationPhotos, user?.userId]);

  useEffect(() => {
    if (!resolvedUserId) {
      setMedicationPhotos([]);
      setIsMedicationPhotosLoading(false);
      return;
    }

    let isActive = true;
    const fetchMedicationPhotos = async () => {
      setIsMedicationPhotosLoading(true);
      try {
        const urls = await getMedicationPhotos(resolvedUserId);
        if (!isActive) return;

        setMedicationPhotos(prev => (arePhotoListsEqual(prev, urls) ? prev : urls));
        setUser(prev => {
          if (!prev || !prev.userId) {
            return prev;
          }
          const split = splitPhotosByMedicationFolder(prev.photos, prev.userId);
          if (arePhotoListsEqual(split.medication, urls)) {
            return prev;
          }
          return { ...prev, photos: [...split.others, ...urls] };
        });
      } catch (error) {
        console.error('Failed to load medication photos', error);
      } finally {
        if (isActive) {
          setIsMedicationPhotosLoading(false);
        }
      }
    };

    fetchMedicationPhotos();

    return () => {
      isActive = false;
    };
  }, [photosReloadKey, resolvedUserId]);

  const handleOpenPhotos = useCallback(() => {
    setPhotosReloadKey(prev => prev + 1);
    setIsPhotosModalOpen(true);
  }, []);

  const handleClosePhotos = useCallback(() => {
    setIsPhotosModalOpen(false);
    setViewerIndex(null);
  }, []);

  const handleOpenViewer = useCallback(index => {
    setViewerIndex(index);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewerIndex(null);
  }, []);

  const handleUploadPhotos = useCallback(
    async event => {
      if (!user?.userId) return;

      const files = Array.from(event.target.files || []).filter(Boolean);
      event.target.value = '';
      if (files.length === 0) {
        return;
      }

      setIsUploadingPhotos(true);
      try {
        await Promise.all(
          files.map(file =>
            getUrlofUploadedAvatar(file, user.userId, {
              subfolder: 'medication',
              disableCompression: true,
            }),
          ),
        );

        const refreshedMedicationPhotos = await getMedicationPhotos(user.userId);

        setMedicationPhotos(refreshedMedicationPhotos);
        setUser(prev => {
          if (!prev || !prev.userId) {
            return prev;
          }
          const split = splitPhotosByMedicationFolder(prev.photos, prev.userId);
          return { ...prev, photos: [...split.others, ...refreshedMedicationPhotos] };
        });
        toast.success('Фотографії успішно завантажено');
      } catch (error) {
        console.error('Failed to upload stimulation photos', error);
        toast.error('Не вдалося завантажити фото');
      } finally {
        setIsUploadingPhotos(false);
      }
    },
    [user?.userId],
  );

  const handleDeletePhoto = useCallback(
    async index => {
      if (!user?.userId || photoBeingDeleted) return;
      const currentPhotos = [...medicationPhotos];
      const photoUrl = currentPhotos[index];
      if (!photoUrl) {
        return;
      }

      setPhotoBeingDeleted(photoUrl);
      const { others: preservedPhotos } = splitPhotosByMedicationFolder(user?.photos, user?.userId);
      const updatedMedicationPhotos = currentPhotos.filter((_, i) => i !== index);
      const previousMergedPhotos = [...preservedPhotos, ...currentPhotos];

      setMedicationPhotos(updatedMedicationPhotos);
      setUser(prev => (prev ? { ...prev, photos: [...preservedPhotos, ...updatedMedicationPhotos] } : prev));

      try {
        await deletePhotos(user.userId, [photoUrl]);
        const refreshedMedicationPhotos = await getMedicationPhotos(user.userId);
        setMedicationPhotos(refreshedMedicationPhotos);
        setUser(prev => (prev ? { ...prev, photos: [...preservedPhotos, ...refreshedMedicationPhotos] } : prev));
        toast.success('Фото видалено');
        setViewerIndex(prev => {
          if (prev === null) return prev;
          if (prev === index) {
            if (refreshedMedicationPhotos.length === 0) {
              return null;
            }
            return Math.min(prev, refreshedMedicationPhotos.length - 1);
          }
          if (prev > index) {
            return prev - 1;
          }
          return prev;
        });
      } catch (error) {
        console.error('Failed to delete medication photo', error);
        toast.error('Не вдалося видалити фото');
        setUser(prev => (prev ? { ...prev, photos: previousMergedPhotos } : prev));
      } finally {
        setPhotoBeingDeleted(null);
      }
    },
    [medicationPhotos, photoBeingDeleted, user?.photos, user?.userId],
  );

  const handleDelete = useCallback(async () => {
    if (!ownerId || !userId) {
      toast.error('Не вдалося визначити користувача для видалення ліків');
      return;
    }

    const confirmed = window.confirm('Видалити розклад ліків цього пацієнта?');
    if (!confirmed) return;

    try {
      const { others: preservedPhotos } = splitPhotosByMedicationFolder(user?.photos, user?.userId);
      if (medicationPhotos.length > 0 && user?.userId) {
        try {
          await deletePhotos(user.userId, medicationPhotos);
        } catch (photoError) {
          console.error('Failed to delete medication photos when removing schedule', photoError);
        }
      }

      setMedicationPhotos([]);
      setUser(prev => (prev ? { ...prev, photos: preservedPhotos } : prev));

      await deleteMedicationSchedule(ownerId, userId);
      setSchedule(null);
      toast.success('Розклад ліків видалено');
      handleClose();
    } catch (error) {
      console.error('Failed to delete medication schedule', error);
      toast.error('Не вдалося видалити розклад ліків');
    }
  }, [handleClose, medicationPhotos, ownerId, user?.photos, user?.userId, userId]);

  const handleClearSchedule = useCallback(async () => {
    if (!ownerId || !userId) {
      toast.error('Увійдіть, щоб очистити графік ліків');
      return;
    }

    const rows = Array.isArray(schedule?.rows)
      ? schedule.rows
      : schedule?.rows && typeof schedule.rows === 'object'
        ? Object.values(schedule.rows)
        : [];

    if (rows.length <= 365) {
      toast('Графік не містить днів після 365-го');
      return;
    }

    const confirmed = window.confirm(
      'Очистити графік ліків після 365-го дня? Дані буде видалено безповоротно.',
    );
    if (!confirmed) return;

    setIsClearingSchedule(true);
    try {
      const changed = await clearMedicationScheduleAfterDay(ownerId, userId, 365);
      if (changed) {
        toast.success('Дані після 365-го дня очищено');
      } else {
        toast('Графік не містить днів після 365-го');
      }
    } catch (error) {
      console.error('Failed to clear medication schedule after day 365', error);
      toast.error('Не вдалося очистити графік після 365-го дня');
    } finally {
      setIsClearingSchedule(false);
    }
  }, [clearMedicationScheduleAfterDay, ownerId, schedule, userId]);

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
          <PhotosButton
            type="button"
            onClick={handleOpenPhotos}
            aria-label={
              canShowPhotos
                ? 'Переглянути або додати фотографії'
                : 'Додати фотографії'
            }
            title={
              canShowPhotos
                ? 'Переглянути або додати фотографії'
                : 'Додати фотографії'
            }
          >
            <FiImage size={18} />
          </PhotosButton>
          <DeleteButtonsWrapper>
            <DeleteButton
              type="button"
              onClick={handleDelete}
              disabled={!ownerId || !userId || isScheduleLoading || isClearingSchedule}
            >
              Видалити
            </DeleteButton>
            <ClearScheduleButton
              type="button"
              onClick={handleClearSchedule}
              disabled={!ownerId || !userId || isScheduleLoading || isClearingSchedule}
            >
              Очистити після 365-го дня
            </ClearScheduleButton>
          </DeleteButtonsWrapper>
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

      {isPhotosModalOpen && (
        <PhotosModalOverlay onClick={handleClosePhotos}>
          <PhotosModal onClick={event => event.stopPropagation()} role="dialog" aria-modal="true">
            <PhotosModalHeader>
              <PhotosModalTitle>Фотографії</PhotosModalTitle>
              <CloseModalButton onClick={handleClosePhotos} aria-label="Закрити">
                <FiX size={20} />
              </CloseModalButton>
            </PhotosModalHeader>
            <PhotosContent>
              {isMedicationPhotosLoading ? (
                <LoadingState>Завантаження фотографій…</LoadingState>
              ) : medicationPhotos.length === 0 ? (
                <Message>Фотографії відсутні.</Message>
              ) : (
                <PhotosGrid>
                  {medicationPhotos.map((photoUrl, index) => (
                    <PhotoCard key={`${photoUrl}-${index}`}>
                      <PhotoThumbnailButton
                        type="button"
                        onClick={() => handleOpenViewer(index)}
                        aria-label={`Переглянути фото ${index + 1}`}
                      >
                        <PhotoThumbnailImage src={photoUrl} alt={`Фото ${index + 1}`} />
                      </PhotoThumbnailButton>
                      <PhotoActions>
                        <PhotoDeleteButton
                          type="button"
                          onClick={() => handleDeletePhoto(index)}
                          aria-label={`Видалити фото ${index + 1}`}
                          disabled={photoBeingDeleted === photoUrl}
                        >
                          <FiTrash2 size={14} />
                        </PhotoDeleteButton>
                      </PhotoActions>
                    </PhotoCard>
                  ))}
                </PhotosGrid>
              )}
              <UploadSection>
                <UploadLabel htmlFor="medications-photos-upload" $disabled={isUploadingPhotos}>
                  <FiUpload size={16} />
                  {isUploadingPhotos ? 'Завантаження…' : 'Завантажити фото'}
                </UploadLabel>
                <HiddenFileInput
                  id="medications-photos-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadPhotos}
                  disabled={isUploadingPhotos}
                />
              </UploadSection>
            </PhotosContent>
          </PhotosModal>
        </PhotosModalOverlay>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={medicationPhotos}
          index={viewerIndex}
          onClose={handleCloseViewer}
          onDelete={handleDeletePhoto}
        />
      )}
    </PageContainer>
  );
};

export default MedicationsPage;
