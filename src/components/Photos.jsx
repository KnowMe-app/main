import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { deletePhotos, getUrlofUploadedAvatar, getAllUserPhotos } from './config';
import { updateDataInNewUsersRTDB } from './config';
import { color } from './styles';

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

const FullScreenOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const FullScreenImage = styled.img`
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: white;
  font-size: 32px;
  cursor: pointer;
`;

const FullDeleteButton = styled.button`
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M3 6h18M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6m-9 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

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

const FullScreenPhotoViewer = ({ url, onClose, onDelete }) => {
  const handleDelete = useCallback(
    e => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete]
  );

  useEffect(() => {
    const keyHandler = e => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [onClose]);

  return (
    <FullScreenOverlay onClick={onClose}>
      <FullScreenImage src={url} alt="full screen" />
      <CloseButton onClick={onClose}>×</CloseButton>
      <FullDeleteButton onClick={handleDelete}>
        <TrashIcon />
      </FullDeleteButton>
    </FullScreenOverlay>
  );
};

export const Photos = ({ state, setState }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);


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
          state.photos.map((url, index) => (
            <PhotoItem key={index}>
              <PhotoImage
                src={url}
                alt={`user avatar ${index}`}
                onClick={() => setSelectedPhoto(url)}
              />
              <DeleteButton onClick={() => handleDeletePhoto(url)}>×</DeleteButton>
            </PhotoItem>
          ))

        ) : (
          <NoPhotosText>Додайте свої фото, максимум 9 шт</NoPhotosText>
        )}
      </PhotosWrapper>
      {((state.photos && state.photos.length < 9) || !state.photos) && (
        <UploadButtonWrapper>
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
        </UploadButtonWrapper>
      )}
      {selectedPhoto && (
        <FullScreenPhotoViewer
          url={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onDelete={() => handleDeletePhoto(selectedPhoto)}
        />
      )}
    </Container>
  );
};

export default Photos;