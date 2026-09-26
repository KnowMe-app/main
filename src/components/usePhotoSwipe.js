import { useCallback, useEffect, useRef, useState } from 'react';

// Поріг той самий, що й у свайпа реакції на рядку (`ProfileRow`): жест
// вбік має бути однаково впевненим, хоч гортає він фото, хоч ставить серце.
export const PHOTO_SWIPE_DISTANCE_PX = 40;
export const PHOTO_SWIPE_DOMINANCE = 1.35;

/**
 * Гортання фото картки свайпом — у рядку стрічки й у плитці галереї.
 *
 * Картка стрічки приходить з `matchingCards` з одним аватаром: решти фото в
 * проєкції немає навмисно (`docs/matching-feed-traffic.md`), і тягнути їх на
 * кожну показану картку означало б лістинг Storage на сорок анкет заради
 * жесту, який роблять на двох. Тож перелік просить сам жест: перший свайп
 * кличе `onRequestPhotos`, а крок, на який фото ще не приїхало, чекає на
 * нього й виконується, щойно перелік стане довшим. Сам файл знімка браузер
 * качає лише тоді, коли його показують, плюс один сусід наперед — і то вже
 * після того, як людина почала гортати.
 *
 * `complete` каже, що перелік уже повний (прийшов з бекенду): тоді свайп за
 * його кінцем нічого не питає, а картка з одним фото свайпу не перехоплює
 * зовсім — рядок лишає собі жест реакції.
 */
const usePhotoSwipe = ({ photos, complete: completeProp = false, onRequestPhotos }) => {
  // Без способу дочитати перелік те, що є, і є повним.
  const complete = completeProp || !onRequestPhotos;
  const list = Array.isArray(photos) ? photos : [];
  const [index, setIndex] = useState(0);
  const [pendingStep, setPendingStep] = useState(0);
  const [started, setStarted] = useState(false);
  const touchStartRef = useRef(null);
  const swipedRef = useRef(false);
  const requestedRef = useRef(false);

  const first = list[0] || '';
  // Інша людина в тому самому рядку (перевикористаний компонент) — інший
  // перелік: починаємо з її першого фото.
  useEffect(() => {
    setIndex(0);
    setPendingStep(0);
    setStarted(false);
    requestedRef.current = false;
  }, [first]);

  useEffect(() => {
    if (index > 0 && index >= list.length) setIndex(Math.max(0, list.length - 1));
  }, [index, list.length]);

  // Крок, відкладений до приїзду переліку: виконується, щойно є куди. Коли
  // перелік повний, а кроку все одно нема куди, — по колу.
  useEffect(() => {
    if (!pendingStep) return;
    const target = index + pendingStep;
    if (target >= 0 && target < list.length) {
      setIndex(target);
      setPendingStep(0);
    } else if (complete) {
      if (list.length > 1) setIndex(target < 0 ? list.length - 1 : 0);
      setPendingStep(0);
    }
  }, [complete, index, list.length, pendingStep]);

  const current = list[Math.min(index, Math.max(0, list.length - 1))] || '';
  const next = started ? list[index + 1] : '';
  useEffect(() => {
    if (!next || typeof Image === 'undefined') return;
    const image = new Image();
    image.decoding = 'async';
    image.src = next;
  }, [next]);

  const canSwipe = !complete || list.length > 1;

  const step = useCallback(direction => {
    setStarted(true);
    const target = index + direction;
    if (target >= 0 && target < list.length) {
      setIndex(target);
      return;
    }
    if (!complete && !requestedRef.current) {
      requestedRef.current = true;
      onRequestPhotos();
    }
    // Далі вирішує ефект вище: крок виконається, коли перелік приїде, а за
    // кінцем повного переліку гортання йде по колу.
    setPendingStep(direction);
  }, [complete, index, list.length, onRequestPhotos]);

  const onTouchStart = useCallback(event => {
    if (!canSwipe || !event.touches || event.touches.length !== 1) return;
    // Жест, що почався на фото, належить фото: рядок стрічки свайпом ставить
    // реакцію, і гортання знімків не має перетворюватись на серце чи хрестик.
    event.stopPropagation();
    touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, [canSwipe]);

  const onTouchEnd = useCallback(event => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !event.changedTouches || event.changedTouches.length !== 1) return;
    event.stopPropagation();
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < PHOTO_SWIPE_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * PHOTO_SWIPE_DOMINANCE) return;
    // Жест закінчується ще й кліком — його треба проковтнути, інакше свайп
    // по фото заодно відкривав би картку.
    swipedRef.current = true;
    step(dx < 0 ? 1 : -1);
  }, [step]);

  const onClickCapture = useCallback(event => {
    if (!swipedRef.current) return;
    swipedRef.current = false;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  return {
    current,
    index,
    total: list.length,
    loading: pendingStep !== 0,
    handlers: canSwipe ? { onTouchStart, onTouchEnd, onClickCapture } : {},
    step,
  };
};

export default usePhotoSwipe;
