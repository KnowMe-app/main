import toast from 'react-hot-toast';

export const authNotifications = {
  invalidEmail: () => toast.error('Введіть коректний емейл'),
  emailRequired: () => toast.error('Заповніть емейл'),
  passwordRequired: () => toast.error('Придумайте пароль'),
  wrongPassword: () => toast.error('Невірний пароль'),
  termsRequired: () => toast.error('Треба погодитись з умовами програми ☝️'),
  roleRequired: () => toast.error('Оберіть роль, щоб продовжити'),
  emailTrailingSpace: () => toast.error('Приберіть пробіл в кінці емейлу'),
  weakPassword: () => toast.error('Пароль має містити щонайменше 6 символів'),
  genericAuthError: () => toast.error('Не вдалося підтвердити дані. Перевірте поля і спробуйте ще раз'),
};

