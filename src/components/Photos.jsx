import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  deletePhotos,
  getUrlofUploadedAvatar,
  getAllUserPhotos,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
  updateDataInNewUsersRTDB,
} from './config';
import { color } from './styles';
import PhotoViewer from './PhotoViewer';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';
import { filterOutMedicationPhotos } from '../utils/photoFilters';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: ${({ $compact }) => ($compact ? 'stretch' : 'center')};
  padding-bottom: ${({ $compact }) => ($compact ? 0 : '10px')};
  max-width: ${({ $compact }) => ($compact ? '100%' : '400px')};
  width: 100%; /* Це забезпечує адаптивну ширину */
  margin: 0 auto; /* Центрує контейнер по горизонталі */
  min-width: 0;
`;

const PhotosWrapper = styled.div`
  display: flex;
  flex-wrap: ${({ $compact }) => ($compact ? 'nowrap' : 'wrap')};
  justify-content: ${({ $compact }) => ($compact ? 'flex-start' : 'center')};
  gap: ${({ $compact }) => ($compact ? '12px' : '10px')};
  overflow-x: ${({ $compact }) => ($compact ? 'auto' : 'visible')};
  padding: ${({ $compact }) => ($compact ? '4px 4px 8px' : 0)};
`;

const PhotoItem = styled.div`
  width: ${({ $compact }) => ($compact ? '72px' : '100px')};
  height: ${({ $compact }) => ($compact ? '72px' : '100px')};
  position: relative;
  flex-shrink: 0;
  border: ${({ $compact }) => ($compact ? 'none' : '3px solid')};
  border-image: ${({ $compact }) => ($compact ? 'none' : 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet) 1')};
  border-radius: ${({ $compact }) => ($compact ? '50%' : '5px')};
`;

const PhotoImage = styled.img`
  object-fit: cover;
  width: 100%;
  height: 100%;
  display: block;
  border-radius: ${({ $compact }) => ($compact ? '50%' : 0)};
  cursor: pointer;
`;

const DeleteButton = styled.button`
  position: absolute;
  top: ${({ $compact }) => ($compact ? '-3px' : '5px')};
  right: ${({ $compact }) => ($compact ? '-3px' : '5px')};
  background-color: ${({ $compact }) => ($compact ? '#fff' : 'red')};
  color: ${({ $compact }) => ($compact ? '#7A7A72' : 'white')};
  border: ${({ $compact }) => ($compact ? '1px solid #E8E8E2' : 'none')};
  border-radius: 50%;
  width: 20px;
  height: 20px;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
`;

const NoPhotosText = styled.p`
  text-align: center;
  color: ${color.gray3};
`;

const UploadButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: ${({ $compact }) => ($compact ? 0 : '20px')};
  flex-shrink: 0;
`;

const UploadButtonLabel = styled.label`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $compact }) => ($compact ? '72px' : 'auto')};
  height: ${({ $compact }) => ($compact ? '72px' : 'auto')};
  box-sizing: border-box;
  padding: ${({ $compact }) => ($compact ? 0 : '10px 20px')};
  background: ${({ $compact }) => ($compact ? 'linear-gradient(145deg, #FFFDF9 0%, #FFF1E2 100%)' : color.accent5)};
  color: ${({ $compact }) => ($compact ? '#E8791A' : 'white')};
  border: ${({ $compact }) => ($compact ? '2px dashed #F5A24B' : 'none')};
  border-radius: ${({ $compact }) => ($compact ? '50%' : '5px')};
  box-shadow: ${({ $compact }) => ($compact ? '0 4px 12px rgba(232, 121, 26, 0.14), inset 0 0 0 4px #FFF8F0' : 'none')};
  cursor: pointer;
  text-align: center;
  font-size: ${({ $compact }) => ($compact ? '32px' : '16px')};
  font-weight: ${({ $compact }) => ($compact ? 500 : 'bold')};
  line-height: 1;
  flex-shrink: 0;

  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;

  &:hover {
    background: ${({ $compact }) => ($compact ? 'linear-gradient(145deg, #FFF8F0 0%, #FFE4C7 100%)' : color.accent)};
    border-color: ${({ $compact }) => ($compact ? '#E8791A' : 'transparent')};
    box-shadow: ${({ $compact }) => ($compact ? '0 6px 16px rgba(232, 121, 26, 0.22), inset 0 0 0 4px #FFF8F0' : '0 4px 12px rgba(0, 0, 0, 0.1)')};
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.96);
  }
`;

const HiddenFileInput = styled.input`
  display: none; /* Ховаємо справжній input */
`;

export const Photos = ({ state, setState, collection, hideFirstPhoto = false, uploadInputId = 'file-upload', compact = false, maxPhotos = 9 }) => {
  const [viewerIndex, setViewerIndex] = useState(null);
  const photoKeys = Object.keys(state).filter(
    k => k.toLowerCase().startsWith('photo') && k !== 'photos'
  );
  const arraysEqual = (a = [], b = []) =>
    a.length === b.length && a.every((val, idx) => val === b[idx]);
  const photoValues = photoKeys.map(k => state[k]).join('|');

  const normalizePhotosArray = value => {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      return [value];
    }

    if (typeof value === 'object') {
      return Object.values(value);
    }

    return [];
  };

  const commitPhotosUpdate = updater => {
    setState(prevState => {
      const prevHasPhotos = Object.prototype.hasOwnProperty.call(prevState, 'photos');
      const prevUserId = prevState?.userId;
      const prevPhotosArrayRaw = normalizePhotosArray(prevState.photos);
      const prevPhotosArray = filterOutMedicationPhotos(prevPhotosArrayRaw, prevUserId);
      const nextRaw =
        typeof updater === 'function'
          ? updater(prevPhotosArray)
          : updater;
      const nextPhotosArray = filterOutMedicationPhotos(
        normalizePhotosArray(nextRaw),
        prevUserId,
      );

      if (nextPhotosArray.length === 0) {
        if (!prevHasPhotos) {
          return prevState;
        }

        const { photos, ...rest } = prevState;
        return rest;
      }

      if (arraysEqual(nextPhotosArray, prevPhotosArray) && prevHasPhotos && Array.isArray(prevState.photos)) {
        return prevState;
      }

      return { ...prevState, photos: nextPhotosArray };
    });
  };

  useEffect(() => {
    const load = async () => {
      if (state.userId) {
        try {
          const urls = await getAllUserPhotos(state.userId, collection);
          const filteredUrls = filterOutMedicationPhotos(urls, state.userId);
          if (filteredUrls.length > 0) {
            const currentPhotos = normalizePhotosArray(state.photos);
            const sanitizedCurrent = filterOutMedicationPhotos(currentPhotos, state.userId);
            if (!arraysEqual(filteredUrls, sanitizedCurrent)) {
              commitPhotosUpdate(filteredUrls);
            }
            return;
          }
        } catch (e) {
          console.error('Error loading photos:', e);
        }
      }

      if (state.photos) {
        const existingPhotos = Array.isArray(state.photos)
          ? state.photos
          : Object.values(state.photos || {});
        const converted = existingPhotos
          .map(convertDriveLinkToImage)
          .filter(Boolean);
        const filteredConverted = filterOutMedicationPhotos(converted, state.userId);
        const changed =
          filteredConverted.length !== existingPhotos.length ||
          filteredConverted.some((url, idx) => url !== existingPhotos[idx]);

        if (changed) {
          commitPhotosUpdate(filteredConverted);
        }
      } else {
        const links = Object.entries(state)
          .filter(([key, value]) =>
            key.toLowerCase().startsWith('photo') &&
            key !== 'photos' &&
            typeof value === 'string' &&
            value.trim() !== '',
          )
          .map(([, value]) => convertDriveLinkToImage(value))
          .filter(Boolean);

        if (links.length) {
          commitPhotosUpdate(filterOutMedicationPhotos(links, state.userId));
        }
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.userId, photoValues, setState, collection]);

  const savePhotoList = async updatedPhotos => {
    if (collection === 'newUsers') {
      await updateDataInNewUsersRTDB(
        state.userId,
        { photos: updatedPhotos },
        'update'
      );
    } else {
      await updateDataInRealtimeDB(
        state.userId,
        { photos: updatedPhotos },
        'update'
      );
      await updateDataInFiresoreDB(
        state.userId,
        { photos: updatedPhotos },
        'update'
      );
    }
  };

  const handleDeletePhoto = async index => {
    const photoUrl = state.photos[index];
    const newPhotos = state.photos.filter((_, i) => i !== index);

    try {
      await deletePhotos(state.userId, [photoUrl]);
      commitPhotosUpdate(newPhotos);

      await savePhotoList(newPhotos);
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  };

  const handleDeleteFromViewer = async index => {
    const newLength = state.photos.length - 1;
    await handleDeletePhoto(index);
    if (newLength <= 0) {
      setViewerIndex(null);
    } else if (index >= newLength) {
      setViewerIndex(newLength - 1);
    } else {
      setViewerIndex(index);
    }
  };

  const addPhoto = async event => {
    const currentPhotos = Array.isArray(state.photos) ? state.photos : [];
    const availableSlots = Math.max(maxPhotos - currentPhotos.length, 0);
    const photoArray = Array.from(event.target.files).slice(0, availableSlots);
    event.target.value = '';
    if (photoArray.length === 0) return;

    try {
      const newUrls = await Promise.all(
        photoArray.map(photo => getUrlofUploadedAvatar(photo, state.userId))
      );
      const updatedPhotos = [...currentPhotos, ...newUrls];
      commitPhotosUpdate(updatedPhotos);

      await savePhotoList(updatedPhotos);
    } catch (error) {
      console.error('Error uploading photos:', error);
    }
  };

  const handlePhotoClick = (url, index) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('drive.google.com')) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch {
      // ignore malformed URLs and fallback to viewer
    }
    setViewerIndex(index);
  };

  const allPhotos = Array.isArray(state.photos) ? state.photos : [];
  const displayedPhotos = hideFirstPhoto ? allPhotos.slice(1) : allPhotos;
  const canUploadMore = allPhotos.length < maxPhotos;

  const uploadButton = canUploadMore && (
    <UploadButtonWrapper $compact={compact}>
      <UploadButtonLabel
        $compact={compact}
        htmlFor={uploadInputId}
        aria-label="Додати фото"
      >
        {compact ? '+' : 'Додати фото'}
        <HiddenFileInput
          id={uploadInputId}
          type="file"
          multiple
          accept="image/*"
          onChange={addPhoto}
        />
      </UploadButtonLabel>
    </UploadButtonWrapper>
  );

  return (
    <Container $compact={compact}>
      <PhotosWrapper $compact={compact}>
        {displayedPhotos.map((url, index) => {
          const actualIndex = hideFirstPhoto ? index + 1 : index;
          return <PhotoItem $compact={compact} key={`${url}-${actualIndex}`}>
            <PhotoImage
              $compact={compact}
              src={url}
              alt={`Фото профілю ${actualIndex + 1}`}
              onClick={() => handlePhotoClick(url, actualIndex)}
              onError={e => {
                console.error('Image failed to load', url, e);
                e.target.onerror = null;
                e.target.src = '/logo192.png';
              }}
            />
            <DeleteButton
              $compact={compact}
              type="button"
              onClick={() => handleDeletePhoto(actualIndex)}
              aria-label={`Видалити фото ${actualIndex + 1}`}
            >
              ×
            </DeleteButton>
          </PhotoItem>;
        })}
        {compact && uploadButton}
      </PhotosWrapper>
      {!compact && displayedPhotos.length === 0 && (
        <NoPhotosText>Додайте свої фото, максимум {maxPhotos} шт</NoPhotosText>
      )}
      {!compact && uploadButton}
      {viewerIndex !== null && (
        <PhotoViewer
          photos={state.photos}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDeleteFromViewer}
        />
      )}
    </Container>
  );
};

export default Photos;
