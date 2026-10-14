import React from 'react';

// Тестовий акаунт бачить адмінські екрани, але база частини його правок не
// приймає. Без позначки відмова збереження читалась би як поломка екрана.
const READ_ONLY_BADGE_STYLE = {
  position: 'fixed',
  left: 8,
  bottom: 8,
  zIndex: 2147483000,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(200, 72, 62, 0.92)',
  color: '#fff',
  font: '600 12px/1.4 system-ui, sans-serif',
  pointerEvents: 'none',
};

export const READ_ONLY_BADGE_TEXT = 'Лише читання — зміни не зберігаються';

export const ReadOnlyBadge = () => (
  <div role="status" style={READ_ONLY_BADGE_STYLE}>{READ_ONLY_BADGE_TEXT}</div>
);

export default ReadOnlyBadge;
