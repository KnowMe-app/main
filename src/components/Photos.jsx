import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  box-sizing: border-box;
  border: ${({ $compact }) => ($compact ? '2px solid #E8E8E2' : '3px solid #E8E8E2')};
  border-radius: ${({ $compact }) => ($compact ? '50%' : '8px')};
  overflow: hidden;
  background: #fff;
`;

const PhotoImage = styled.img`
  object-fit: cover;
  width: 100%;
  height: 100%;
  display: block;
  border-radius: ${({ $compact }) => ($compact ? '50%' : '6px')};
  cursor: pointer;
`;

const DeleteButton = styled.button`
  position: absolute;
  top: ${({ $compact }) => ($compact ? '0' : '5px')};
  right: ${({ $compact }) => ($compact ? '0' : '5px')};
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
  background: ${({ $compact }) => ($compact ? '#fff' : color.accent5)};
  color: ${({ $compact }) => ($compact ? '#7A7A72' : 'white')};
  border: ${({ $compact }) => ($compact ? '2px solid #E8E8E2' : 'none')};
  border-radius: ${({ $compact }) => ($compact ? '50%' : '5px')};
  box-shadow: none;
  cursor: pointer;
  text-align: center;
  font-size: ${({ $compact }) => ($compact ? '32px' : '16px')};
  font-weight: ${({ $compact }) => ($compact ? 500 : 'bold')};
  line-height: 1;
  flex-shrink: 0;

  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;

  &:hover {
    background: ${({ $compact }) => ($compact ? '#FFF8F0' : color.accent)};
    border-color: ${({ $compact }) => ($compact ? '#F5A24B' : 'transparent')};
    box-shadow: ${({ $compact }) => ($compact ? 'none' : '0 4px 12px rgba(0, 0, 0, 0.1)')};
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.96);
  }
`;

const HiddenFileInput = styled.input`
  display: none; /* Ховаємо справжній input */
`;


const PHOTO_CROP_SIZE = 1200;
const MIN_CROP_ZOOM = 0.6;
const DEFAULT_CROP_ZOOM = 1;
const DEFAULT_CROP_OFFSET = { x: 0, y: 0 };
const DEFAULT_CROP_ASPECT_RATIO = 1;

const CropModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483000;
  padding: 16px;
`;

const CropModalCard = styled.div`
  position: relative;
  z-index: 1;
  width: min(92vw, 520px);
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
`;

const CropModalTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 18px;
`;

const CropModalHint = styled.p`
  margin: 0 0 12px;
  color: ${color.gray3};
  font-size: 14px;
  line-height: 1.35;
`;

const CropPreview = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 12px;
  background: #f3f4f6;
  cursor: grab;
  user-select: none;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
`;

const CropPreviewImage = styled.img`
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${({ $displayWidth }) => `${$displayWidth}px`};
  height: ${({ $displayHeight }) => `${$displayHeight}px`};
  object-fit: cover;
  display: block;
  max-width: none;
  transform: ${({ $offsetX, $offsetY }) => `translate(calc(-50% + ${$offsetX}px), calc(-50% + ${$offsetY}px))`};
  transform-origin: center;
  pointer-events: none;
`;

const CropPreviewBlurImage = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  filter: blur(18px);
  transform: scale(1.08);
  transform-origin: center;
  pointer-events: none;
`;

const CropFocusFrame = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  width: 86%;
  aspect-ratio: ${({ $aspectRatio }) => $aspectRatio || DEFAULT_CROP_ASPECT_RATIO};
  max-height: 86%;
  transform: translate(-50%, -50%);
  border: 2px solid #fff;
  border-radius: 12px;
  box-shadow:
    0 0 0 9999px rgba(17, 24, 39, 0.48),
    inset 0 0 0 1px rgba(245, 162, 75, 0.85),
    0 8px 24px rgba(0, 0, 0, 0.28);
  pointer-events: none;
`;

const CropGrid = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  width: 86%;
  aspect-ratio: ${({ $aspectRatio }) => $aspectRatio || DEFAULT_CROP_ASPECT_RATIO};
  max-height: 86%;
  transform: translate(-50%, -50%);
  border-radius: 12px;
  overflow: hidden;
  pointer-events: none;
  background:
    linear-gradient(to right, transparent 33.333%, rgba(255,255,255,0.55) 33.333%, rgba(255,255,255,0.55) calc(33.333% + 1px), transparent calc(33.333% + 1px), transparent 66.666%, rgba(255,255,255,0.55) 66.666%, rgba(255,255,255,0.55) calc(66.666% + 1px), transparent calc(66.666% + 1px)),
    linear-gradient(to bottom, transparent 33.333%, rgba(255,255,255,0.55) 33.333%, rgba(255,255,255,0.55) calc(33.333% + 1px), transparent calc(33.333% + 1px), transparent 66.666%, rgba(255,255,255,0.55) 66.666%, rgba(255,255,255,0.55) calc(66.666% + 1px), transparent calc(66.666% + 1px));
`;

const CropZoomRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  color: ${color.gray3};
  font-size: 14px;
`;

const CropZoomInput = styled.input`
  flex: 1;
`;

const CropActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
`;

const CropButton = styled.button`
  border: none;
  border-radius: 8px;
  padding: 9px 14px;
  cursor: pointer;
  font-weight: 700;
  background: ${({ $primary }) => ($primary ? color.accent5 : '#eef2f7')};
  color: ${({ $primary }) => ($primary ? '#fff' : '#334155')};
`;

const loadImage = file => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new window.Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = error => {
    URL.revokeObjectURL(url);
    reject(error);
  };
  image.src = url;
});

const canvasToBlob = (canvas, type = 'image/jpeg', quality = 0.92) => new Promise(resolve => {
  canvas.toBlob(resolve, type, quality);
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const resolveCropDisplay = ({ sourceWidth, sourceHeight, frameWidth, frameHeight, zoom }) => {
  if (!sourceWidth || !sourceHeight || !frameWidth || !frameHeight) {
    return { displayWidth: 0, displayHeight: 0, scale: 1 };
  }

  const baseScale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const scale = baseScale * zoom;
  return {
    displayWidth: sourceWidth * scale,
    displayHeight: sourceHeight * scale,
    scale,
  };
};

const getBoundedCropOffset = ({ offset, displayWidth, displayHeight, frameWidth, frameHeight }) => ({
  x: clamp(offset.x, -Math.max((displayWidth - frameWidth) / 2, 0), Math.max((displayWidth - frameWidth) / 2, 0)),
  y: clamp(offset.y, -Math.max((displayHeight - frameHeight) / 2, 0), Math.max((displayHeight - frameHeight) / 2, 0)),
});

const cropPhotoToStandardRatio = async (file, cropSettings) => {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return file;

  const {
    frameWidth = 1,
    frameHeight = 1,
    offset = DEFAULT_CROP_OFFSET,
    zoom = DEFAULT_CROP_ZOOM,
    aspectRatio = DEFAULT_CROP_ASPECT_RATIO,
  } = cropSettings || {};
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DEFAULT_CROP_ASPECT_RATIO;
  const { displayWidth, displayHeight } = resolveCropDisplay({
    sourceWidth,
    sourceHeight,
    frameWidth,
    frameHeight,
    zoom: Math.max(zoom, MIN_CROP_ZOOM),
  });
  const boundedOffset = getBoundedCropOffset({ offset, displayWidth, displayHeight, frameWidth, frameHeight });
  const outputWidth = PHOTO_CROP_SIZE;
  const outputHeight = Math.round(outputWidth / safeAspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  const backgroundScale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight) * 1.12;
  const backgroundWidth = sourceWidth * backgroundScale;
  const backgroundHeight = sourceHeight * backgroundScale;
  const backgroundX = (outputWidth - backgroundWidth) / 2;
  const backgroundY = (outputHeight - backgroundHeight) / 2;
  ctx.save();
  ctx.filter = 'blur(32px)';
  ctx.drawImage(image, backgroundX, backgroundY, backgroundWidth, backgroundHeight);
  ctx.restore();

  const mainWidth = (displayWidth / frameWidth) * outputWidth;
  const mainHeight = (displayHeight / frameHeight) * outputHeight;
  const mainX = (outputWidth - mainWidth) / 2 + (boundedOffset.x / frameWidth) * outputWidth;
  const mainY = (outputHeight - mainHeight) / 2 + (boundedOffset.y / frameHeight) * outputHeight;
  ctx.drawImage(image, mainX, mainY, mainWidth, mainHeight);
  const blob = await canvasToBlob(canvas);
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg') || 'profile-photo.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
};

export const Photos = ({ state, setState, collection, hideFirstPhoto = false, uploadInputId = 'file-upload', compact = false, maxPhotos = 9, cropAspectRatio = DEFAULT_CROP_ASPECT_RATIO }) => {
  const [viewerIndex, setViewerIndex] = useState(null);
  const [pendingCropFiles, setPendingCropFiles] = useState([]);
  const [croppedPendingFiles, setCroppedPendingFiles] = useState([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [cropPreviewUrl, setCropPreviewUrl] = useState('');
  const [cropOffset, setCropOffset] = useState(DEFAULT_CROP_OFFSET);
  const [cropZoom, setCropZoom] = useState(DEFAULT_CROP_ZOOM);
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const [cropFrameSize, setCropFrameSize] = useState({ width: 0, height: 0 });
  const dragStateRef = useRef(null);
  const cropFrameRef = useRef(null);
  const photoKeys = Object.keys(state).filter(
    k => k.toLowerCase().startsWith('photo') && k !== 'photos'
  );
  const arraysEqual = (a = [], b = []) =>
    a.length === b.length && a.every((val, idx) => val === b[idx]);
  const photoValues = photoKeys.map(k => state[k]).join('|');
  const pendingCropFile = pendingCropFiles[0] || null;
  const safeCropAspectRatio = Number.isFinite(cropAspectRatio) && cropAspectRatio > 0 ? cropAspectRatio : DEFAULT_CROP_ASPECT_RATIO;
  const cropDisplay = resolveCropDisplay({
    sourceWidth: cropImageSize.width,
    sourceHeight: cropImageSize.height,
    frameWidth: cropFrameSize.width,
    frameHeight: cropFrameSize.height,
    zoom: cropZoom,
  });
  const boundedCropOffset = getBoundedCropOffset({
    offset: cropOffset,
    displayWidth: cropDisplay.displayWidth,
    displayHeight: cropDisplay.displayHeight,
    frameWidth: cropFrameSize.width,
    frameHeight: cropFrameSize.height,
  });

  useEffect(() => {
    if (!pendingCropFile) {
      setCropPreviewUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(pendingCropFile);
    setCropPreviewUrl(url);
    setCropOffset(DEFAULT_CROP_OFFSET);
    setCropZoom(DEFAULT_CROP_ZOOM);
    setCropImageSize({ width: 0, height: 0 });
    setCropFrameSize({ width: 0, height: 0 });
    return () => URL.revokeObjectURL(url);
  }, [pendingCropFile]);

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
            const hasLocalPreviewPhotos = currentPhotos.some(url => typeof url === 'string' && url.startsWith('blob:'));
            if (isUploadingPhotos || hasLocalPreviewPhotos || currentPhotos.length > filteredUrls.length) {
              return;
            }
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
  }, [state.userId, photoValues, setState, collection, isUploadingPhotos]);

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
    const currentPhotos = Array.isArray(state.photos) ? state.photos : [];
    const photoUrl = currentPhotos[index];
    const newPhotos = currentPhotos.filter((_, i) => i !== index);

    commitPhotosUpdate(newPhotos);

    try {
      await deletePhotos(state.userId, [photoUrl]);
      await savePhotoList(newPhotos);
    } catch (error) {
      commitPhotosUpdate(currentPhotos);
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

  const uploadPreparedPhotos = async files => {
    const currentPhotos = Array.isArray(state.photos) ? state.photos : [];
    setIsUploadingPhotos(true);
    const previewUrls = files.map(file => URL.createObjectURL(file));
    commitPhotosUpdate([...currentPhotos, ...previewUrls]);

    try {
      const newUrls = await Promise.all(
        files.map(photo => getUrlofUploadedAvatar(photo, state.userId))
      );
      const updatedPhotos = [...currentPhotos, ...newUrls];
      commitPhotosUpdate(updatedPhotos);
      await savePhotoList(updatedPhotos);
    } catch (error) {
      commitPhotosUpdate(currentPhotos);
      console.error('Error uploading photos:', error);
    } finally {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setIsUploadingPhotos(false);
    }
  };

  const addPhoto = event => {
    const currentPhotos = Array.isArray(state.photos) ? state.photos : [];
    const availableSlots = Math.max(maxPhotos - currentPhotos.length, 0);
    const photoArray = Array.from(event.target.files).slice(0, availableSlots);
    event.target.value = '';
    if (photoArray.length === 0) return;
    setCroppedPendingFiles([]);
    setPendingCropFiles(photoArray);
  };

  const updateCropFrameSize = element => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setCropFrameSize({ width: rect.width, height: rect.height });
  };

  const handleCropPreviewPointerDown = event => {
    updateCropFrameSize(cropFrameRef.current);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: boundedCropOffset,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPreviewPointerMove = event => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const nextOffset = {
      x: dragState.startOffset.x + event.clientX - dragState.startX,
      y: dragState.startOffset.y + event.clientY - dragState.startY,
    };
    setCropOffset(getBoundedCropOffset({
      offset: nextOffset,
      displayWidth: cropDisplay.displayWidth,
      displayHeight: cropDisplay.displayHeight,
      frameWidth: cropFrameSize.width,
      frameHeight: cropFrameSize.height,
    }));
  };

  const handleCropPreviewPointerUp = event => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const handleCropImageLoad = event => {
    const image = event.currentTarget;
    setCropImageSize({
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    });
    updateCropFrameSize(cropFrameRef.current);
  };

  const handleCropZoomChange = event => {
    const nextZoom = Number(event.target.value);
    setCropZoom(nextZoom);
    const nextDisplay = resolveCropDisplay({
      sourceWidth: cropImageSize.width,
      sourceHeight: cropImageSize.height,
      frameWidth: cropFrameSize.width,
      frameHeight: cropFrameSize.height,
      zoom: nextZoom,
    });
    setCropOffset(currentOffset => getBoundedCropOffset({
      offset: currentOffset,
      displayWidth: nextDisplay.displayWidth,
      displayHeight: nextDisplay.displayHeight,
      frameWidth: cropFrameSize.width,
      frameHeight: cropFrameSize.height,
    }));
  };

  const cancelCrop = () => {
    setPendingCropFiles([]);
    setCroppedPendingFiles([]);
  };

  const confirmCurrentCrop = async () => {
    if (!pendingCropFile) return;
    const croppedFile = await cropPhotoToStandardRatio(pendingCropFile, {
      aspectRatio: safeCropAspectRatio,
      frameWidth: cropFrameSize.width,
      frameHeight: cropFrameSize.height,
      offset: boundedCropOffset,
      zoom: cropZoom,
    });
    const remainingFiles = pendingCropFiles.slice(1);
    const readyFiles = [...croppedPendingFiles, croppedFile];

    if (remainingFiles.length > 0) {
      setCroppedPendingFiles(readyFiles);
      setPendingCropFiles(remainingFiles);
      return;
    }

    setPendingCropFiles([]);
    setCroppedPendingFiles([]);
    await uploadPreparedPhotos(readyFiles);
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

  const cropModal = pendingCropFile ? (
    <CropModalOverlay onClick={cancelCrop}>
      <CropModalCard onClick={event => event.stopPropagation()}>
        <CropModalTitle>Обрізати фото до стандартного розміру</CropModalTitle>
        <CropModalHint>Перетягніть фото всередині рамки та змініть масштаб, щоб обрати найвдалішу частину для картки.</CropModalHint>
        <CropPreview
          onPointerDown={handleCropPreviewPointerDown}
          onPointerMove={handleCropPreviewPointerMove}
          onPointerUp={handleCropPreviewPointerUp}
          onPointerCancel={handleCropPreviewPointerUp}
        >
          {cropPreviewUrl && (
            <>
              <CropPreviewBlurImage
                src={cropPreviewUrl}
                alt=""
                aria-hidden="true"
              />
              <CropPreviewImage
                src={cropPreviewUrl}
                alt="Попередній перегляд обрізання"
                $displayWidth={cropDisplay.displayWidth || cropFrameSize.width}
                $displayHeight={cropDisplay.displayHeight || cropFrameSize.height}
                $offsetX={boundedCropOffset.x}
                $offsetY={boundedCropOffset.y}
                onLoad={handleCropImageLoad}
              />
            </>
          )}
          <CropFocusFrame ref={cropFrameRef} $aspectRatio={safeCropAspectRatio} />
          <CropGrid $aspectRatio={safeCropAspectRatio} />
        </CropPreview>
        <CropZoomRow>
          Масштаб
          <CropZoomInput
            type="range"
            min={MIN_CROP_ZOOM}
            max="3"
            step="0.01"
            value={cropZoom}
            onChange={handleCropZoomChange}
          />
        </CropZoomRow>
        <CropActions>
          <CropButton type="button" onClick={cancelCrop}>Скасувати</CropButton>
          <CropButton type="button" $primary onClick={confirmCurrentCrop}>
            {pendingCropFiles.length > 1 ? 'Зберегти й наступне' : 'Зберегти'}
          </CropButton>
        </CropActions>
      </CropModalCard>
    </CropModalOverlay>
  ) : null;

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
                e.target.src = '/favicon2.ico';
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
      {cropModal && typeof document !== 'undefined' ? createPortal(cropModal, document.body) : cropModal}
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
