import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { FiTrash2, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.92);
  touch-action: pan-y;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2147483001;
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

const Counter = styled.div`
  position: absolute;
  top: 26px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
`;

/*
 * Повноекранний перегляд фото: темне тло, свайп або стрілки вбік, Escape і
 * клік повз знімок закривають.
 *
 * Шар малюється порталом у `body`: його відкривають і з рядка стрічки, а там
 * батько з `transform` чи `overflow: hidden` обрізав би `position: fixed`. Події
 * порталу React усе одно несе вгору деревом компонентів, тож шар їх глушить:
 * інакше свайп по фото тут ставив би серце чи хрестик рядку під ним, а дотик
 * розгортав би його.
 *
 * `closeOnHistoryBack` — «назад» телефона закриває перегляд, а не сторінку:
 * відкриття кладе в історію свій запис.
 * `onReachEnd` — перелік ще не повний (стрічка несе один аватар): дійшовши до
 * кінця, просимо решту, а не йдемо по колу.
 */
export const PhotoViewer = ({ photos = [], index = 0, onClose, onDelete, closeOnHistoryBack = false, onReachEnd }) => {
  const [current, setCurrent] = useState(index);
  const [startX, setStartX] = useState(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Крок, що чекає на дочитаний перелік: щойно знімків стало більше, ніж було
  // в момент кроку, показуємо наступний.
  const pendingAdvanceRef = useRef(0);

  useEffect(() => {
    if (!pendingAdvanceRef.current || photos.length <= pendingAdvanceRef.current) return;
    const target = pendingAdvanceRef.current;
    pendingAdvanceRef.current = 0;
    setCurrent(target);
  }, [photos.length]);

  const next = React.useCallback(() => {
    if (photos.length === 0) return;
    if (onReachEnd && current >= photos.length - 1) {
      pendingAdvanceRef.current = photos.length;
      onReachEnd();
      return;
    }
    setCurrent(prev => (prev + 1) % photos.length);
  }, [current, onReachEnd, photos.length]);

  const prev = React.useCallback(() => {
    if (photos.length === 0) return;
    setCurrent(prev => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    if (current > 0 && current >= photos.length) setCurrent(Math.max(0, photos.length - 1));
  }, [current, photos.length]);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'ArrowRight') {
        next();
      } else if (e.key === 'ArrowLeft') {
        prev();
      } else if (e.key === 'Escape') {
        closeRef.current();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [next, prev]);

  // Запис в історії ставиться раз і знімається не прибиранням ефекту, а самим
  // закриттям: у режимі розробки React ставить і знімає ефекти двічі, і
  // `history.back()` з прибирання доїжджав подією `popstate` уже до другого
  // монтування — перегляд закривався, щойно відкрившись.
  useEffect(() => {
    if (!closeOnHistoryBack || typeof window === 'undefined') return undefined;
    if (!window.history.state?.photoViewer) window.history.pushState({ photoViewer: true }, '');
    const handlePopState = () => {
      if (onCloseRef.current) onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeOnHistoryBack]);

  // Закрили хрестиком, Escape чи кліком повз знімок — знімаємо власний запис,
  // і закриває вже `popstate`; інакше перше ж «назад» після перегляду не
  // робило б нічого.
  const close = React.useCallback(() => {
    if (closeOnHistoryBack && typeof window !== 'undefined' && window.history.state?.photoViewer) {
      window.history.back();
      return;
    }
    if (onCloseRef.current) onCloseRef.current();
  }, [closeOnHistoryBack]);
  const closeRef = useRef(close);
  closeRef.current = close;

  const handleTouchStart = e => {
    e.stopPropagation();
    if (e.touches && e.touches.length > 0) {
      setStartX(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = e => {
    e.stopPropagation();
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
    e.stopPropagation();
    if (e.target === e.currentTarget) close();
  };

  const shown = Math.min(current, photos.length - 1);
  const overlay = (
    <Overlay
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onTouchStart={handleTouchStart}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={handleTouchEnd}
      onClick={handleOverlayClick}
    >
      <FullImage src={photos[shown]} alt="full" />
      {photos.length > 1 && <Counter>{shown + 1} / {photos.length}</Counter>}
      <PrevButton onClick={prev} aria-label="Previous">
        <FiChevronLeft size={40} />
      </PrevButton>
      <NextButton onClick={next} aria-label="Next">
        <FiChevronRight size={40} />
      </NextButton>
      <CloseButton onClick={close} aria-label="Close">
        <FiX size={30} />
      </CloseButton>
      {onDelete && (
        <DeleteButton onClick={handleDelete} aria-label="Delete">
          <FiTrash2 size={30} />
        </DeleteButton>
      )}
    </Overlay>
  );

  return typeof document !== 'undefined' && document.body ? createPortal(overlay, document.body) : overlay;
};

export default PhotoViewer;
