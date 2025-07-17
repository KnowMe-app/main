import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { FiTrash2, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const Overlay = styled.div`
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

const FullImage = styled.img`
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
`;

const IconButton = styled.button`
  position: absolute;
  top: 20px;
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
`;

const CloseButton = styled(IconButton)`
  right: 20px;
`;

const DeleteButton = styled(IconButton)`
  right: 70px;
`;

const ArrowButton = styled(IconButton)`
  top: 50%;
  transform: translateY(-50%);
`;

const PrevButton = styled(ArrowButton)`
  left: 20px;
`;

const NextButton = styled(ArrowButton)`
  right: 20px;
`;

export const PhotoViewer = ({ photos = [], index = 0, onClose, onDelete }) => {
  const [current, setCurrent] = useState(index);
  const [startX, setStartX] = useState(null);

  const next = React.useCallback(() => {
    if (photos.length === 0) return;
    setCurrent(prev => (prev + 1) % photos.length);
  }, [photos.length]);

  const prev = React.useCallback(() => {
    if (photos.length === 0) return;
    setCurrent(prev => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'ArrowRight') {
        next();
      } else if (e.key === 'ArrowLeft') {
        prev();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [next, prev]);

  const handleTouchStart = e => {
    if (e.touches && e.touches.length > 0) {
      setStartX(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = e => {
    if (startX === null) return;
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startX;
    if (deltaX > 50) {
      prev();
    } else if (deltaX < -50) {
      next();
    }
    setStartX(null);
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(current);
    }
  };

  if (!photos.length) return null;

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <Overlay onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClick={handleOverlayClick}>
      <FullImage src={photos[current]} alt="full" />
      <PrevButton onClick={prev} aria-label="Previous">
        <FiChevronLeft size={40} />
      </PrevButton>
      <NextButton onClick={next} aria-label="Next">
        <FiChevronRight size={40} />
      </NextButton>
      <CloseButton onClick={onClose} aria-label="Close">
        <FiX size={30} />
      </CloseButton>
      {onDelete && (
        <DeleteButton onClick={handleDelete} aria-label="Delete">
          <FiTrash2 size={30} />
        </DeleteButton>
      )}
    </Overlay>
  );
};

export default PhotoViewer;
