import React from 'react';
import { auth, fetchUserComment } from '../config';
import { COMMENTS_UPDATED_EVENT } from '../../utils/commentsStorage';
import { peekPublicCommentsCached, readPublicCommentsCached } from '../../utils/publicCommentsMemory';

/**
 * Коментарі в блоці «всі поля».
 *
 * Блок показує все, що база тримає про цю картку, — а коментарі в самій картці
 * не лежать, і тому в дамп не потрапляли взагалі. Сховища при цьому два, і
 * плутати їх дорого: приватна нотатка живе в
 * `multiData/comments/{власник}/{картка}` і видна лише тому, хто її писав, а
 * публічний відгук — у `comments/{картка}/{id}`, підписаний автором і
 * відкритий кожному авторизованому.
 *
 * Читання тут **на вимогу того, хто вставив блок**: у відкритій картці вона
 * одна, і зайвий запит там — це рівно те, заради чого картку й відкрили; у
 * списку ж блок стоїть під кожним рядком (просто схований), тож там показується
 * те, що вже прочитала сама картка, а не робиться сотня запитів наосліп.
 *
 * Стан «ще не читали» називається словом. Порожнє місце на цьому екрані
 * означало б «коментарів немає», а це різні речі — і саме та різниця, заради
 * якої в дамп і дивляться.
 */
const sectionStyle = { marginTop: '10px' };
const headingStyle = { fontWeight: 700 };
const rowStyle = { marginBottom: '4px' };
const nestedStyle = { paddingLeft: '12px' };
const hintStyle = { opacity: 0.75 };

const NOT_READ = 'не прочитано';
const EMPTY = '—';

export const StoredCommentsSection = ({ cardId, load = false }) => {
  const [privateNote, setPrivateNote] = React.useState({ status: 'idle', text: '' });
  const [publicComments, setPublicComments] = React.useState({ status: 'idle', items: [] });
  const ownerId = auth.currentUser?.uid || '';

  React.useEffect(() => {
    if (!cardId) return undefined;
    let cancelled = false;

    const applyPrivate = text => {
      if (!cancelled) setPrivateNote({ status: 'loaded', text: String(text || '').trim() });
    };

    if (load && ownerId) {
      setPrivateNote({ status: 'loading', text: '' });
      // `Promise.resolve` тут не косметика: дамп малюється в картці, яку
      // рендерять з десятка місць, і читач коментаря може виявитись
      // підміненим (тести) або ще не готовим — падати через це блоку полів не
      // можна.
      Promise.resolve(typeof fetchUserComment === 'function' ? fetchUserComment(ownerId, cardId) : null)
        .then(comment => applyPrivate(comment?.text))
        .catch(() => {
          if (!cancelled) setPrivateNote({ status: 'failed', text: '' });
        });
    }

    // Запис нотатки (і перенесення легасі-коментаря) шле цю подію — дамп мусить
    // показувати те саме, що поле поруч, а не стан на момент відкриття.
    const syncPrivate = event => {
      if (event.detail?.cardId !== cardId) return;
      if (ownerId && event.detail?.ownerId && event.detail.ownerId !== ownerId) return;
      applyPrivate(event.detail.text);
    };
    window.addEventListener(COMMENTS_UPDATED_EVENT, syncPrivate);

    return () => {
      cancelled = true;
      window.removeEventListener(COMMENTS_UPDATED_EVENT, syncPrivate);
    };
  }, [cardId, load, ownerId]);

  React.useEffect(() => {
    if (!cardId) return undefined;
    let cancelled = false;

    const reader = load ? readPublicCommentsCached : peekPublicCommentsCached;
    let pending = null;
    try {
      pending = typeof reader === 'function' ? reader(cardId) : null;
    } catch (error) {
      // Читач відгуків — не частина дампа полів, і його поломка не має
      // забирати з екрана самі поля. Але й мовчати про неї не можна: інакше
      // «відгуків немає» сказало б неправду.
      console.warn('[StoredCommentsSection] не вдалося прочитати публічні відгуки', { cardId, error });
      setPublicComments({ status: 'failed', items: [] });
      return undefined;
    }
    if (!pending || typeof pending.then !== 'function') {
      setPublicComments({ status: 'idle', items: [] });
      return undefined;
    }

    setPublicComments(prev => (prev.status === 'loaded' ? prev : { status: 'loading', items: [] }));
    pending
      .then(items => {
        if (!cancelled) setPublicComments({ status: 'loaded', items: Array.isArray(items) ? items : [] });
      })
      .catch(() => {
        if (!cancelled) setPublicComments({ status: 'failed', items: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [cardId, load]);

  const describe = state => {
    if (state.status === 'idle') return NOT_READ;
    if (state.status === 'loading') return 'читаємо…';
    if (state.status === 'failed') return 'не вдалося прочитати';
    return null;
  };

  const privateHint = describe(privateNote);
  const publicHint = describe(publicComments);

  return (
    <div style={sectionStyle}>
      <div style={rowStyle}>
        <span style={headingStyle}>myComment (приватна нотатка · бачите тільки ви)</span>
        {': '}
        {privateHint ? <span style={hintStyle}>{privateHint}</span> : (privateNote.text || EMPTY)}
      </div>
      <div style={rowStyle}>
        <span style={headingStyle}>publicComments (відгуки · бачать усі)</span>
        {': '}
        {publicHint && <span style={hintStyle}>{publicHint}</span>}
        {!publicHint && publicComments.items.length === 0 && EMPTY}
      </div>
      {!publicHint && publicComments.items.length > 0 && (
        <div style={nestedStyle}>
          {publicComments.items.map((comment, index) => (
            <div key={comment?.id || `public-${index}`} style={rowStyle}>
              <strong>[{index}]</strong>
              {' '}
              {comment?.authorName || comment?.authorId || 'без автора'}
              {': '}
              {String(comment?.text || '').trim() || EMPTY}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StoredCommentsSection;
