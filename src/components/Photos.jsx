import React from 'react';
import styled from 'styled-components';
import { deletePhotos, getUrlofUploadedAvatar } from './config';
import { updateDataInFiresoreDB, updateDataInRealtimeDB } from './config';
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

const NoPhotosText = styled.p`
  text-align: center;
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

  const handleDeletePhoto = async photoUrl => {
    const newPhotos = state.photos.filter(url => url !== photoUrl);

    try {
      await deletePhotos(state.userId, [photoUrl]);
      setState(prevState => ({
        ...prevState,
        photos: newPhotos,
      }));
      await updateDataInRealtimeDB(state.userId, { photos: newPhotos });
      await updateDataInFiresoreDB(state.userId, { photos: newPhotos }, 'check');
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  };

  const addPhoto = async event => {
    const photoArray = Array.from(event.target.files);
    try {
      const newUrls = await Promise.all(photoArray.map(photo => getUrlofUploadedAvatar(photo, state.userId)));
      setState(prevState => ({
        ...prevState,
        photos: [...(prevState.photos || []), ...newUrls],
      }));
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
                <PhotoImage src={url} alt={`user avatar ${index}`} />
                <DeleteButton onClick={() => handleDeletePhoto(url)}>×</DeleteButton>
              </PhotoItem>
            ))}
          </PhotosWrapper>
        ) : (
          <NoPhotosText>Додайте свої фото, максимум 9 шт</NoPhotosText>
        )}
      </PhotosWrapper>
     {(state.photos && state.photos.length < 9) && <UploadButtonWrapper>
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
    </Container>
  );
};

export default Photos;