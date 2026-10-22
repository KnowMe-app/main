import toast from 'react-hot-toast';
import { getStoredLanguage } from '../hooks/useAppSettings';
import { uiText } from '../utils/uiTranslations';

// Мову тост бере в момент показу: її можна перемкнути на самому екрані входу,
// ще до того, як людина увійшла.
const t = (text, vars) => uiText(text, getStoredLanguage(), vars);

export const authNotifications = {
  invalidEmail: () => toast.error(t('Введіть коректний емейл')),
  emailRequired: () => toast.error(t('Заповніть емейл')),
  passwordRequired: () => toast.error(t('Придумайте пароль')),
  wrongPassword: () => toast.error(t('Невірний пароль')),
  termsRequired: () => toast.error(t('Треба погодитись з умовами програми ☝️')),
  // Роль питається лише на вкладці «Створити акаунт». Це не помилка людини,
  // тож і тост не червоний.
  registrationRoleRequired: () => toast(t('Оберіть, хто ви, — від цього залежать поля анкети')),
  emailTrailingSpace: () => toast.error(t('Приберіть пробіл в кінці емейлу')),
  weakPassword: () => toast.error(t('Пароль має містити щонайменше 6 символів')),
  resetEmailRequired: () => toast.error(t('Введіть пошту, на яку зареєстровано акаунт, — надішлемо на неї лист для зміни пароля')),
  // Відповідь та сама для відомої й невідомої пошти: форма не розкриває, чи є
  // такий акаунт.
  passwordResetSent: email => toast.success(t('Якщо акаунт з поштою {email} існує, лист для зміни пароля вже в дорозі. Перевірте й «Спам».', { email }), { duration: 8000 }),
  tooManyRequests: () => toast.error(t('Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз')),
  genericAuthError: () => toast.error(t('Не вдалося підтвердити дані. Перевірте поля і спробуйте ще раз')),
};

