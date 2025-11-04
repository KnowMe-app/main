import { handleChange } from './actions';
import { utilCalculateMonthsAgo } from './utilCalculateMonthsAgo';
import { AttentionButton } from 'components/styles';
import { formatDateToDisplay } from 'components/inputValidations';

export const fieldDeliveryInfo = (setUsers, setState, userData) => {
  const { ownKids, lastDelivery, csection } = userData;
  const formattedLastDelivery = formatDateToDisplay(lastDelivery);

  // Функція для парсингу дати з формату дд.мм.рррр
  const parseCsectionDate = dateString => {
    // Перевірка формату дд.мм.рррр
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;

    if (!dateRegex.test(dateString)) {
      return null; // Повертаємо null, якщо формат не відповідає
    }

    const [day, month, year] = dateString.split('.').map(Number);

    // Перевірка на коректність дати
    const isValidDate = (d, m, y) => d > 0 && d <= 31 && m > 0 && m <= 12 && y > 0 && !isNaN(new Date(y, m - 1, d).getTime());

    if (!isValidDate(day, month, year)) {
      return null; // Повертаємо null, якщо дата некоректна
    }

    return dateString;
  };

  // Використовуємо `csection` як дату останніх пологів, якщо `lastDelivery` не задано
  const effectiveLastDelivery = formattedLastDelivery || (csection && parseCsectionDate(csection));

  // Додаємо перевірку перед викликом `split`
  let deliveryDate = null;
  if (effectiveLastDelivery && /^\d{2}\.\d{2}\.\d{4}$/.test(effectiveLastDelivery)) {
    const [day, month, year] = effectiveLastDelivery.split('.').map(Number);
    deliveryDate = new Date(year, month - 1, day); // JavaScript місяці починаються з 0
  }

  const monthsAgo = effectiveLastDelivery ? utilCalculateMonthsAgo(effectiveLastDelivery) : null;
  const daysUntilDelivery = (() => {
    if (!deliveryDate) return null;
    const now = new Date();
    if (deliveryDate <= now) return null;
    const diffMs = deliveryDate.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  })();

  const monthsToAdd = (() => {
    const val = (csection || '').toLowerCase().replace(/\s/g, '');
    return ['кс-', '-', 'no', 'ні', '0'].includes(val) ? 9 : 18;
  })();

  const whenGetInTouch = deliveryDate
    ? new Date(deliveryDate.getFullYear(), deliveryDate.getMonth() + monthsToAdd, deliveryDate.getDate())
    : null;

  // Форматування дати у формат "дд.мм.рррр"
  const formatDate = date =>
    date
      ? date
          .toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          .replace(/\//g, '.')
      : null;

  if (!ownKids && monthsAgo === null && !csection) return null;

  const parts = [];
  if (effectiveLastDelivery) parts.push(`${effectiveLastDelivery} пологи`);

  if (monthsAgo !== null) {
    if (monthsAgo > 24) {
      const years = Math.floor(monthsAgo / 12); // Округлення до меншого
      parts.push(`${years}рт, `);
    } else {
      parts.push(`${monthsAgo}м, `);
      if (daysUntilDelivery !== null) {
        parts[parts.length - 1] = parts[parts.length - 1].replace(
          /, $/,
          `/${daysUntilDelivery}д, `,
        );
      }
    }
  }

  if (ownKids) parts.push(`всього ${ownKids},`);

  // Повертаємо результат
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
      {parts.map((part, index) => (
        <span key={`part-${index}`} style={{ whiteSpace: 'nowrap' }}>
          {part}
        </span>
      ))}
      {csection && (
        <AttentionButton
          key="csection"
          onClick={() => {
            handleChange(
              setUsers,
              setState,
              userData.userId,
              'getInTouch',
              formatDate(whenGetInTouch),
              true,
            );
          }}
        >
          кс {csection}
        </AttentionButton>
      )}
    </div>
  );
};

// const renderCsection = (csection) => {

//   // if (csection === undefined) {
//   //   return ', кс ?';
//   // }

//   switch (csection) {
//     case undefined :
//     return '';
//     case '1':
//       return 'кс1, ';
//     case '2':
//       return 'кс2, ';
//     case 'No': case '0': case 'Ні': case '-':
//       return 'кс-, ';
//     case 'Yes': case 'Так': case '+':
//       return 'кс+, ';
//     default:
//       return `кс ${csection}, `|| '';
//   }
// };
