/**
 * Фото, які застосунок сам дочитує на відкритій картці, — не правка.
 *
 * Картка з посилання (`/edit/{id}` з Telegram-сповіщення) стартує з самого
 * `{ userId }`, і одночасно йдуть два читання: анкета з бази й фото верхнього
 * блоку зі Storage (`renderTopBlock`). Форма відкидає відповідь бази, якщо стан
 * змінився після старту запиту, — щоб не затерти те, що адмін встиг набрати.
 * Поки дописані фото рахувались такою зміною, фото, що прийшли першими,
 * забирали анкету: картка лишалась з фото й без жодного поля (23.11, нова
 * анкета зі сповіщення). Тож фото пишуться з цим джерелом, а «чи є в стані
 * щось, крім заглушки» питає `hasProfileContentBeyondPhotos`.
 */
export const PHOTO_HYDRATION_SOURCE = 'photoHydration';

const PHOTO_HYDRATION_KEYS = new Set(['userId', 'photos', '__photosHydrated']);

export const hasProfileContentBeyondPhotos = state => Boolean(
  state
  && typeof state === 'object'
  && Object.keys(state).some(key => !PHOTO_HYDRATION_KEYS.has(key)),
);
