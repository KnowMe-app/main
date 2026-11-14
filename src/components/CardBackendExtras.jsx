import React, { useSyncExternalStore } from 'react';
import {
  CARD_BACKEND_EXTRAS_STATUS,
  getCardBackendExtras,
  subscribeCardBackendExtras,
} from 'utils/cardBackendExtras';

/*
 * Друга половина блоку «усі поля»: дані картки поза анкетою (нотатки,
 * відгуки, реакції, доповнення, програми), перечитані з бази тим самим
 * дотиком (`loadCardBackendExtras` у `renderTopBlock`). Поля малює той самий
 * `renderAllFields` — його передають пропом, бо модуль `ProfileForm`
 * імпортує цей компонент і прямий імпорт назад дав би цикл.
 */

const sectionStyle = { marginTop: '12px', paddingTop: '8px', borderTop: '1px solid currentColor' };
const headingStyle = { fontWeight: 700, marginBottom: '6px' };
const entryStyle = { marginBottom: '8px' };
const pathStyle = { fontSize: '11px', opacity: 0.7, wordBreak: 'break-all' };
const errorStyle = { color: '#d32f2f' };

const renderValue = (entry, renderFields) => {
  if (entry.error) return <div style={errorStyle}>{entry.error}</div>;
  if (entry.value === null || entry.value === undefined) return <div>—</div>;
  if (typeof entry.value === 'object' && typeof renderFields === 'function') {
    return <div style={{ paddingLeft: '8px' }}>{renderFields(entry.value)}</div>;
  }
  return <div>{String(entry.value)}</div>;
};

export const CardBackendExtras = ({ cardId, renderFields }) => {
  const extras = useSyncExternalStore(
    subscribeCardBackendExtras,
    () => getCardBackendExtras(cardId),
  );
  if (!cardId || !extras) return null;

  const loading = extras.status === CARD_BACKEND_EXTRAS_STATUS.loading;
  // Поки триває перечитування, попередня відповідь не показується: блок —
  // перевірка свіжого стану бази, і старі рядки під ним читались би як нові.
  const entries = loading ? [] : extras.entries || [];

  return (
    <div style={sectionStyle} data-testid="card-backend-extras">
      <div style={headingStyle}>
        Поза анкетою
        {loading ? ' · читаємо з бази…' : ''}
      </div>
      {entries.map(entry => (
        <div key={entry.id} style={entryStyle} data-testid={`card-backend-extra-${entry.id}`}>
          <strong>{entry.title}</strong>
          <div style={pathStyle}>{entry.path}</div>
          {renderValue(entry, renderFields)}
        </div>
      ))}
    </div>
  );
};

export default CardBackendExtras;
