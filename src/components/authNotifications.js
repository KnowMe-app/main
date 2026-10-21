import toast from 'react-hot-toast';

export const authNotifications = {
  invalidEmail: () => toast.error('Введіть коректний емейл'),
  emailRequired: () => toast.error('Заповніть емейл'),
  passwordRequired: () => toast.error('Придумайте пароль'),
  wrongPassword: () => toast.error('Невірний пароль'),
  termsRequired: () => toast.error('Треба погодитись з умовами програми ☝️'),
  // Роль питається лише на вкладці «Створити акаунт». Це не помилка людини,
  // тож і тост не червоний.
  registrationRoleRequired: () => toast('Оберіть, хто ви, — від цього залежать поля анкети'),
  emailTrailingSpace: () => toast.error('Приберіть пробіл в кінці емейлу'),
  weakPassword: () => toast.error('Пароль має містити щонайменше 6 символів'),
  resetEmailRequired: () => toast.error('Введіть пошту, на яку зареєстровано акаунт, — надішлемо на неї лист для зміни пароля'),
  // Відповідь та сама для відомої й невідомої пошти: форма не розкриває, чи є
  // такий акаунт.
  passwordResetSent: email => toast.success(`Якщо акаунт з поштою ${email} існує, лист для зміни пароля вже в дорозі. Перевірте й «Спам».`, { duration: 8000 }),
  tooManyRequests: () => toast.error('Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз'),
  genericAuthError: () => toast.error('Не вдалося підтвердити дані. Перевірте поля і спробуйте ще раз'),
};

