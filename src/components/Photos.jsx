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

const Container = styled.div`
  padding-bottom: 10px;
  max-width: 400px;

  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-bottom: 10px;
  max-width: 400px;
  width: 100%; /* Це забезпечує адаптивну ширину */
  margin: 0 auto; /* Центрує контейнер по горизонталі */
`;

const PhotosWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center; /* Вирівнювання фото по центру */
  gap: 10px; /* Відстань між фото */
`;

const PhotoItem = styled.div`
  width: 100px;
  height: 100px;
  position: relative;
  border: 3px solid;
  border-image: linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet) 1;
  border-radius: 5px;
`;

const PhotoImage = styled.img`
  object-fit: cover;
  width: 100%;
  height: 100%;
  display: block;
`;

const DeleteButton = styled.button`
  position: absolute;
  top: 5px;
  right: 5px;
  background-color: red;
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const NoPhotosText = styled.p`
  text-align: center;
  color: ${color.gray3};
`;

const UploadButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 20px;
`;

const UploadButtonLabel = styled.label`
  display: inline-block;
  padding: 10px 20px;
  background-color: ${color.accent5};
  color: white;
  border-radius: 5px;
  cursor: pointer;
  text-align: center;
  font-size: 16px;
  font-weight: bold;

  transition: background-color 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    background-color: ${color.accent}; 
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); 
  }

  &:active {
    transform: scale(0.98); 
  }
`;

const HiddenFileInput = styled.input`
  display: none; /* Ховаємо справжній input */
`;

export const Photos = ({ state, setState }) => {
  const [viewerIndex, setViewerIndex] = useState(null);
  const photoKeys = Object.keys(state).filter(
    k => k.toLowerCase().startsWith('photo') && k !== 'photos'
  );
  const photoValues = photoKeys.map(k => state[k]).join('|');

  useEffect(() => {
    console.log('useEffect triggered', {
      userId: state.userId,
      photos: state.photos,
      photoValues,
    });
    const load = async () => {
      if (state.userId && state.userId.length <= 20) {
        try {
          console.log('Fetching photos for user', state.userId);
          const urls = await getAllUserPhotos(state.userId);
          console.log('Fetched URLs', urls);
          if (urls.length > 0) {
            setState(prev => ({ ...prev, photos: urls }));
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
        console.log('Existing photos', existingPhotos);
        const converted = existingPhotos
          .map(convertDriveLinkToImage)
          .filter(Boolean);
        console.log('Converted photos', converted);
        const changed =
          converted.length !== existingPhotos.length ||
          converted.some((url, idx) => url !== existingPhotos[idx]);

        if (changed) {
          setState(prev => ({ ...prev, photos: converted }));
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
        console.log('Links from state', links);

        if (links.length) {
          setState(prev => ({ ...prev, photos: links }));
        }
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.userId, state.photos, photoValues, setState]);

  const savePhotoList = async updatedPhotos => {
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

    if (state.userId.length > 20) {
      await updateDataInNewUsersRTDB(
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
      setState(prevState => ({
        ...prevState,
        photos: newPhotos,
      }));

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
    const photoArray = Array.from(event.target.files);
    try {
      const newUrls = await Promise.all(
        photoArray.map(photo => getUrlofUploadedAvatar(photo, state.userId))
      );
      const updatedPhotos = [...(state.photos || []), ...newUrls];
      setState(prevState => ({
        ...prevState,
        photos: updatedPhotos,
      }));

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

  return (
    <Container>
      <PhotosWrapper>
        {state.photos && state.photos.length > 0 ? (
          <PhotosWrapper>
            {state.photos.map((url, index) => (
              <PhotoItem key={index}>
                <PhotoImage
                  src={url}
                  alt={`user avatar ${index}`}
                  onClick={() => handlePhotoClick(url, index)}
                  onLoad={() => console.log('Image loaded', url)}
                  onError={e => {
                    console.error('Image failed to load', url, e);
                    e.target.onerror = null;
                    e.target.src = '/logo192.png';
                  }}
                />
                <DeleteButton onClick={() => handleDeletePhoto(index)}>×</DeleteButton>
              </PhotoItem>
            ))}
          </PhotosWrapper>
        ) : (
          <NoPhotosText>Додайте свої фото, максимум 9 шт</NoPhotosText>
        )}
      </PhotosWrapper>
     {((state.photos && state.photos.length < 9) || (!state.photos)) && <UploadButtonWrapper>
        <UploadButtonLabel htmlFor="file-upload">
          Додати фото
          <HiddenFileInput
            id="file-upload"
            type="file"
            multiple
            accept="image/*"
            onChange={addPhoto}
          />
        </UploadButtonLabel>
      </UploadButtonWrapper>}
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