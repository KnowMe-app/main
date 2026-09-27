import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Поріг той самий, що й у свайпа реакції на рядку (`ProfileRow`): жест
// вбік має бути однаково впевненим, хоч гортає він фото, хоч ставить серце.
export const PHOTO_SWIPE_DISTANCE_PX = 40;
export const PHOTO_SWIPE_DOMINANCE = 1.35;
// Короткий швидкий змах гортає й без повного порогу — так поводиться
// будь-яка галерея в телефоні, і рука цього чекає.
export const PHOTO_FLICK_MIN_PX = 18;
export const PHOTO_FLICK_VELOCITY = 0.45; // px/ms
// Там, куди гортати нема чого, фото тягнеться з опором, а не стоїть мертво:
// так видно, що жест почули, але далі кінець.
export const PHOTO_EDGE_RESISTANCE = 0.32;
// Запасна стеля для анімації: `animationend` не приходить при
// `prefers-reduced-motion` і у фоновій вкладці, а шар, що виїжджає, не має
// лишатись у DOM назавжди.
export const PHOTO_SETTLE_FALLBACK_MS = 700;
export const PHOTO_SNAP_BACK_MS = 320;

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
  // Фаза жесту: 'drag' — фото їде за пальцем, 'snap' — вертається на місце.
  // Покадрове зміщення в стан не йде: рядок стрічки важкий, і перемальовувати
  // його на кожен touchmove означало б ривки саме там, де має бути плавно.
  // Зміщення пишеться CSS-змінною прямо на сцену (`stageRef`).
  const [dragPhase, setDragPhase] = useState('idle');
  const [transition, setTransition] = useState(null);
  const touchStartRef = useRef(null);
  const swipedRef = useRef(false);
  const requestedRef = useRef(false);
  const stageRef = useRef(null);
  const dragOffsetRef = useRef(0);
  const releaseOffsetRef = useRef(0);
  const lastDirectionRef = useRef(0);
  const snapTimerRef = useRef(null);
  const settleTimerRef = useRef(null);

  const first = list[0] || '';
  // Інша людина в тому самому рядку (перевикористаний компонент) — інший
  // перелік: починаємо з її першого фото.
  useEffect(() => {
    setIndex(0);
    setPendingStep(0);
    setStarted(false);
    setTransition(null);
    requestedRef.current = false;
  }, [first]);

  useEffect(() => () => {
    clearTimeout(snapTimerRef.current);
    clearTimeout(settleTimerRef.current);
  }, []);

  useEffect(() => {
    if (index > 0 && index >= list.length) setIndex(Math.max(0, list.length - 1));
  }, [index, list.length]);

  // Крок, відкладений до приїзду переліку: виконується, щойно є куди. Коли
  // перелік повний, а кроку все одно нема куди, — по колу.
  useEffect(() => {
    if (!pendingStep) return;
    const target = index + pendingStep;
    if (target >= 0 && target < list.length) {
      lastDirectionRef.current = pendingStep;
      setIndex(target);
      setPendingStep(0);
    } else if (complete) {
      lastDirectionRef.current = pendingStep;
      if (list.length > 1) setIndex(target < 0 ? list.length - 1 : 0);
      setPendingStep(0);
    }
  }, [complete, index, list.length, pendingStep]);

  const current = list[Math.min(index, Math.max(0, list.length - 1))] || '';

  // Зміна знімка — це перехід: старий виїжджає, новий заїжджає з того місця,
  // де його відпустив палець. Layout-ефект, а не звичайний: інакше один кадр
  // новий знімок стояв би на місці без анімації й лише потім стрибав убік.
  const shownRef = useRef({ photo: current, first });
  useLayoutEffect(() => {
    const shown = shownRef.current;
    shownRef.current = { photo: current, first };
    if (!shown.photo || shown.photo === current || shown.first !== first) return;
    const direction = lastDirectionRef.current || 1;
    const offset = releaseOffsetRef.current;
    releaseOffsetRef.current = 0;
    lastDirectionRef.current = 0;
    setTransition(prev => ({ id: (prev?.id || 0) + 1, from: shown.photo, direction, offset }));
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => setTransition(null), PHOTO_SETTLE_FALLBACK_MS);
  }, [current, first]);

  const onSettled = useCallback(() => {
    clearTimeout(settleTimerRef.current);
    setTransition(null);
  }, []);
  const next = started ? list[index + 1] : '';
  useEffect(() => {
    if (!next || typeof Image === 'undefined') return;
    const image = new Image();
    image.decoding = 'async';
    image.src = next;
  }, [next]);

  const canSwipe = !complete || list.length > 1;

  // Сусіди, яких видно під час перетягування. За кінцем повного переліку
  // гортання йде по колу — тож і сусід там той, що на іншому кінці.
  const wraps = complete && list.length > 1;
  const prevPhoto = index > 0 ? list[index - 1] : (wraps ? list[list.length - 1] : '');
  const nextPhoto = index + 1 < list.length ? list[index + 1] : (wraps ? list[0] : '');

  const writeDragOffset = useCallback(offset => {
    dragOffsetRef.current = offset;
    const node = stageRef.current;
    if (node) node.style.setProperty('--photo-drag', `${offset}px`);
  }, []);

  const step = useCallback(direction => {
    setStarted(true);
    const target = index + direction;
    lastDirectionRef.current = direction;
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
    clearTimeout(snapTimerRef.current);
    // Новий жест посеред переходу доводить перехід до кінця одразу: палець
    // бере вже новий знімок, а не той, що ще їде.
    clearTimeout(settleTimerRef.current);
    setTransition(null);
    touchStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      at: Date.now(),
      axis: null,
    };
  }, [canSwipe]);

  // Опір там, де сусіда немає: фото тягнеться, але все повільніше.
  const resist = useCallback(dx => {
    const hasNeighbor = dx < 0 ? Boolean(nextPhoto) : Boolean(prevPhoto);
    return hasNeighbor ? dx : dx * PHOTO_EDGE_RESISTANCE;
  }, [nextPhoto, prevPhoto]);

  const onTouchMove = useCallback(event => {
    const start = touchStartRef.current;
    if (!start || !event.touches || event.touches.length !== 1) return;
    event.stopPropagation();
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (!start.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Вісь вирішується раз на жест: вертикальний рух — це прокрутка
      // сторінки, і фото під пальцем не має хитатись убік.
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (start.axis === 'x') setDragPhase('drag');
    }
    if (start.axis !== 'x') return;
    writeDragOffset(resist(dx));
  }, [resist, writeDragOffset]);

  const snapBack = useCallback(() => {
    writeDragOffset(0);
    setDragPhase('snap');
    clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => setDragPhase('idle'), PHOTO_SNAP_BACK_MS);
  }, [writeDragOffset]);

  const onTouchEnd = useCallback(event => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !event.changedTouches || event.changedTouches.length !== 1) return;
    event.stopPropagation();
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    const elapsed = Math.max(1, Date.now() - start.at);
    const isFlick = start.axis === 'x'
      && Math.abs(dx) >= PHOTO_FLICK_MIN_PX
      && Math.abs(dx) / elapsed >= PHOTO_FLICK_VELOCITY;
    const isSwipe = Math.abs(dx) >= PHOTO_SWIPE_DISTANCE_PX
      && Math.abs(dx) >= Math.abs(dy) * PHOTO_SWIPE_DOMINANCE;
    if (!isFlick && !isSwipe) {
      if (start.axis === 'x') snapBack();
      return;
    }
    // Жест закінчується ще й кліком — його треба проковтнути, інакше свайп
    // по фото заодно відкривав би картку.
    swipedRef.current = true;
    const direction = dx < 0 ? 1 : -1;
    const hasNeighbor = direction > 0 ? Boolean(nextPhoto) : Boolean(prevPhoto);
    if (hasNeighbor) {
      // Новий знімок заїжджає з того місця, де його відпустив палець, а не
      // з краю кадру: інакше на відпусканні він стрибав би назад.
      releaseOffsetRef.current = dragOffsetRef.current;
      writeDragOffset(0);
      clearTimeout(snapTimerRef.current);
      setDragPhase('idle');
    } else {
      // Сусід ще їде з бекенду: поточне фото вертається на місце й тьмяніє,
      // а перехід почнеться з центру, щойно перелік приїде.
      releaseOffsetRef.current = 0;
      snapBack();
    }
    step(direction);
  }, [nextPhoto, prevPhoto, snapBack, step, writeDragOffset]);

  const onTouchCancel = useCallback(() => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start?.axis === 'x') snapBack();
  }, [snapBack]);

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
    handlers: canSwipe ? { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onClickCapture } : {},
    step,
    // Для сцени (`PhotoSwipeStage`): що малювати поруч і чим анімувати.
    stageRef,
    dragPhase,
    prevPhoto: dragPhase === 'idle' ? '' : prevPhoto,
    nextPhoto: dragPhase === 'idle' ? '' : nextPhoto,
    transition,
    onSettled,
  };
};

export default usePhotoSwipe;
