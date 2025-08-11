import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { deletePhotos, getUrlofUploadedAvatar, getAllUserPhotos } from './config';
import { updateDataInNewUsersRTDB } from './config';
import { color } from './styles';
import PhotoViewer from './PhotoViewer';

const convertDriveLinkToImage = link => {
  if (typeof link !== 'string') return null;

  try {
    const url = new URL(link);

    if (url.hostname.includes('drive.google.com')) {
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
      const fileId = fileMatch ? fileMatch[1] : url.searchParams.get('id');

      return fileId ? `https://drive.google.com/uc?id=${fileId}` : link;
    }

    return link;
  } catch (e) {
    return link;
  }
};

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
  const photoValues = photoKeys.map(k => state[k]);

  useEffect(() => {
    console.log('Photos effect triggered', { photoValues, photos: state.photos });
    const load = async () => {
      if (state.userId && state.userId.length <= 20) {
        try {
          const urls = await getAllUserPhotos(state.userId);
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
        const converted = existingPhotos
          .map(convertDriveLinkToImage)
          .filter(Boolean);
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

        if (links.length) {
          setState(prev => ({ ...prev, photos: links }));
        }
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.userId, state.photos, ...photoValues]);

  const savePhotoList = async updatedPhotos => {
    if (state.userId.length <= 20) {
      return;
    }
    await updateDataInNewUsersRTDB(state.userId, { photos: updatedPhotos }, 'update');
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
                  onClick={() => setViewerIndex(index)}
                  onLoad={() => console.log('loaded image', url)}
                  onError={e => {
                    console.error('failed image', url);
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