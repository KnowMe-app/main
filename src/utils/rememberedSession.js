/**
 * Чи памʼятає цей пристрій сесію — і чию.
 *
 * Це не стан входу: стан входу — відповідь Firebase (`authStatus` в `App`), і
 * позначки нижче вона знімає, щойно скаже «користувача немає». Памʼять сесії
 * потрібна для одного: стрічка показує деку з кеша, поки Firebase ще
 * перевіряє сесію на сервері (а це круг до Google, і токен, бува, ще й
 * оновлюється). Базу до відповіді Firebase стрічка сама не питає.
 */
export const readRememberedViewerId = () => {
  try {
    if (localStorage.getItem('isLoggedIn') !== 'true') return '';
    return String(localStorage.getItem('ownerId') || '').trim();
  } catch {
    return '';
  }
};
