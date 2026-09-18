// Черга доповнень: усе, що читачі дописали в чужі картки й що ще ніхто не
// розсудив.
//
// Дописувати картки може кожен, хто увійшов (`multiData/edits/{картка}/{читач}`),
// а канонічним значення робить лише адмін. Доти шар лежить під карткою й видно
// його там, де на картку дивляться, — тобто рішення по ньому ухвалюють, лише
// випадково цю картку відкривши. Черга перевертає це: адмін заходить сюди й
// бачить **усі** такі картки одразу, з кожним дописаним значенням окремим
// рядком і двома кнопками — «прийняти» і «видалити».
//
// Рішення тут на **значення**, а не на картку цілком: із трьох дописаних
// телефонів один буває правильний, і «прийняти все» на таку картку записало б
// у неї два чужі номери. Кнопки на всю картку теж є — коли дописане перевірене
// й приймається разом, — але вони не єдині.
//
// Прийняте потрапляє в анкету тим самим писачем, що й форма
// (`utils/persistCanonicalCard`), і з журналу прибирається: значення тепер
// канонічне, і другий запис про нього — це вже не аудит, а шум. Видалене,
// навпаки, лишається в журналі (`editsHistory`): «чому цього немає в анкеті»
// — питання, на яке відповідати доводиться.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import styled from 'styled-components';

import {
  applyOverlayToCard,
  buildOverlayFieldEntries,
  getCanonicalCard,
  listPendingOverlayCards,
  normalizeOverlayFields,
  removeAllOverlaysForCard,
  acceptAllOverlaysForCard,
  settleOverlayValueForCard,
} from 'utils/multiAccountEdits';
import { persistCanonicalCard } from 'utils/persistCanonicalCard';
import { getFieldLabel, pickerFields } from './formFields';
import { fetchMatchingCardsByIds } from './config';
import { ToolButton, ToolCount, ToolDrawerNote } from './AddNewProfileAdminPanel.styled';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 8px 0;
`;

const QueueHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const QueueTitle = styled.h3`
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--km-font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--km-text);
`;

const QueueSpacer = styled.span`
  flex: 1;
`;

const CardShell = styled.article`
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius, 14px);
  background: var(--km-card);
  overflow: hidden;
`;

const CardHead = styled.header`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--km-border);
`;

const CardHeadText = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--km-text);
  overflow-wrap: anywhere;
`;

const CardMeta = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: var(--km-muted);
  overflow-wrap: anywhere;
`;

const FieldBlock = styled.div`
  padding: 8px 12px;

  & + & {
    border-top: 1px solid var(--km-border);
  }
`;

const FieldName = styled.div`
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--km-muted);
`;

const ValueRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 0;

  & + & {
    border-top: 1px dashed var(--km-border);
  }
`;

const ValueText = styled.div`
  flex: 1;
  min-width: 120px;
  font-size: 13px;
  color: var(--km-text);
  overflow-wrap: anywhere;
`;

// Дописане значення й те, що воно заміняє, стоять поруч: рішення «прийняти» —
// це завжди рішення про пару, а не про рядок.
const PreviousValue = styled.span`
  color: var(--km-muted);
  text-decoration: line-through;
  margin-right: 6px;
`;

const RemovalMark = styled.span`
  color: var(--km-danger);
  font-weight: 700;
  margin-right: 4px;
`;

const CardActions = styled.footer`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-top: 1px solid var(--km-border);
  background: var(--km-bg);
`;

const fieldsMap = new Map((pickerFields || []).map(field => [field?.name, field]));

/**
 * Що саме записати в анкету, приймаючи **одне** значення.
 *
 * Заміна (`{ from, to }`) мусить лишитись заміною: зведена до `added`, вона
 * дописала б нове значення поруч зі старим, і в анкеті замість «Львів» стояло
 * б «Київ, Львів» — тобто прийняття правки додавало б людині друге місто.
 * Дописування й прибирання окремих значень масиву, навпаки, стосуються рівно
 * того значення, на яке натиснули: сусідні пропозиції того ж поля лишаються
 * в черзі.
 */
const acceptedChangeForEntry = (overlaysByEditor, fieldName, entry) => {
  const change = normalizeOverlayFields(overlaysByEditor?.[entry.editorUserId]?.fields)[fieldName];
  if (change && 'to' in change) return { from: change.from ?? '', to: change.to ?? '' };
  return entry.isDeleted ? { removed: [entry.value] } : { added: [entry.value] };
};

const labelForField = fieldName => getFieldLabel(fieldsMap.get(fieldName) || { name: fieldName }) || fieldName;

// Кількість дописувачів пишеться словом, а «2 дописувачів» — не слово: рядок
// стоїть під іменем людини, і граматика там помітна.
const editorCountLabel = count => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} дописувачів`;
  if (last === 1) return `${count} дописувач`;
  if (last >= 2 && last <= 4) return `${count} дописувачі`;
  return `${count} дописувачів`;
};

const formatUpdatedAt = updatedAt => {
  if (!updatedAt) return '';
  try {
    return new Date(Number(updatedAt)).toLocaleDateString('uk-UA');
  } catch (error) {
    return '';
  }
};

// Ім'я в черзі береться з картки стрічки, а не з анкети: черга показує десятки
// карток, а `matchingCards` — рівно той мінімум, який видно поза стрічкою, і
// коштує він на два порядки менше за повну анкету (docs/matching-feed-traffic.md).
const describeCard = card => {
  if (!card) return '';
  const values = [card.name, card.surname, card.surnameShort]
    .map(value => (Array.isArray(value) ? value[value.length - 1] : value))
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  return values.join(' ');
};

/**
 * Черга доповнень одним читанням кореня `multiData/edits` плюс картки стрічки
 * для підписів. Відмова не перетворюється на порожню чергу: викликач показує
 * причину, бо найімовірніша з них — нерозгорнуті правила бази, і «доповнень
 * немає» тоді означало б рівно протилежне до правди.
 */
export const loadOverlayReviewQueue = async () => {
  const entries = await listPendingOverlayCards();
  if (!entries.length) return { entries: [], cards: {} };

  const { cards } = await fetchMatchingCardsByIds(entries.map(entry => entry.cardUserId));
  return { entries, cards };
};

const OverlayCard = ({ entry, card, busy, onAcceptValue, onDiscardValue, onAcceptAll, onDiscardAll, onOpen }) => {
  // Та сама розкладка «по значенню», що й у формі редагування
  // (`buildOverlayFieldEntries`): рішення ухвалюють про значення, тож і список
  // мусить бути списком значень, а не полів.
  const pendingByField = useMemo(
    () => buildOverlayFieldEntries(entry.overlaysByEditor),
    [entry.overlaysByEditor],
  );
  const fieldNames = Object.keys(pendingByField);
  const title = describeCard(card) || entry.cardUserId;
  const updatedAt = formatUpdatedAt(entry.updatedAt);

  return (
    <CardShell>
      <CardHead>
        <CardHeadText>
          <CardName>{title}</CardName>
          <CardMeta>
            {entry.cardUserId}
            {' · '}
            {editorCountLabel(entry.editorIds.length)}
            {updatedAt ? ` · ${updatedAt}` : ''}
          </CardMeta>
        </CardHeadText>
        <ToolButton type="button" onClick={() => onOpen(entry.cardUserId)} disabled={busy}>
          Відкрити
        </ToolButton>
      </CardHead>

      {fieldNames.map(fieldName => (
        <FieldBlock key={fieldName}>
          <FieldName>{labelForField(fieldName)}</FieldName>
          {pendingByField[fieldName].map(row => (
            <ValueRow key={`${row.editorUserId}::${row.value}`}>
              <ValueText>
                {row.isDeleted && <RemovalMark aria-hidden="true">−</RemovalMark>}
                {row.isDeleted ? <PreviousValue>{row.value}</PreviousValue> : row.value}
              </ValueText>
              <ToolButton
                type="button"
                $tone="primary"
                disabled={busy}
                onClick={() => onAcceptValue(entry, fieldName, row)}
                title="Записати значення в анкету і прибрати з черги"
              >
                Прийняти
              </ToolButton>
              <ToolButton
                type="button"
                $tone="danger"
                disabled={busy}
                onClick={() => onDiscardValue(entry, fieldName, row)}
                title="Прибрати доповнення, анкету не міняти"
              >
                Видалити
              </ToolButton>
            </ValueRow>
          ))}
        </FieldBlock>
      ))}

      <CardActions>
        <ToolButton type="button" $tone="primary" disabled={busy} onClick={() => onAcceptAll(entry)}>
          Прийняти все
        </ToolButton>
        <ToolButton type="button" $tone="danger" disabled={busy} onClick={() => onDiscardAll(entry)}>
          Видалити все
        </ToolButton>
      </CardActions>
    </CardShell>
  );
};

export const OverlayReviewQueue = ({ onOpenCard }) => {
  const [state, setState] = useState({ status: 'idle', entries: [], cards: {}, error: '' });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'loading', error: '' }));
    try {
      const { entries, cards } = await loadOverlayReviewQueue();
      setState({ status: 'ready', entries, cards, error: '' });
    } catch (error) {
      // Відмова читання — не порожня черга. Найчастіша причина в тому, що
      // `database.rules.json` не викотили руками: код уже вміє читати корінь,
      // база ще ні.
      setState({
        status: 'error',
        entries: [],
        cards: {},
        error: error?.code || error?.message || 'unknown',
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAction = useCallback(async (action, successMessage, failureMessage) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await refresh();
    } catch (error) {
      toast.error(`${failureMessage}: ${error?.code || error?.message || 'unknown'}`);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  /**
   * Прийняти одне значення: спершу воно стає канонічним в анкеті, і лише
   * потім іде з черги.
   *
   * Порядок саме такий, бо `settleOverlayValueForCard` шар **прибирає** — і
   * прибране до запису анкети не лишило б сліду ніде: ані в картці, ані в
   * черзі. Записує його той самий писач, що й форма
   * (`utils/persistCanonicalCard`): шлях запису анкети мусить бути один, а тут
   * форми на екрані немає взагалі.
   */
  const acceptValue = useCallback((entry, fieldName, row) => runAction(
    async () => {
      const change = acceptedChangeForEntry(entry.overlaysByEditor, fieldName, row);
      const canonical = await getCanonicalCard(entry.cardUserId);
      await persistCanonicalCard(applyOverlayToCard(canonical, { [fieldName]: change }));
      const settled = await settleOverlayValueForCard({
        editorUserId: row.editorUserId,
        cardUserId: entry.cardUserId,
        fieldName,
        value: row.value,
        action: 'accept',
      });
      if (!settled) throw new Error('Пропозицію не вдалося зняти з черги');
    },
    `Прийнято: ${row.value}`,
    'Не вдалося прийняти доповнення',
  ), [runAction]);

  /**
   * Відхилити одне значення. Анкету це не міняє, але `searchId` — так:
   * ключ туди завів сам шар (`saveOverlayForUserCard`), і поки він там
   * лишається, прибраний номер далі знаходиться пошуком. Знімає його
   * `settleOverlayValueForCard`, і лише тоді, коли значення не стоїть ані в
   * анкеті, ані в чужому шарі на цій картці.
   */
  const discardValue = useCallback((entry, fieldName, row) => runAction(
    async () => {
      const settled = await settleOverlayValueForCard({
        editorUserId: row.editorUserId,
        cardUserId: entry.cardUserId,
        fieldName,
        value: row.value,
        action: 'discard',
      });
      if (!settled) throw new Error('Пропозицію не вдалося зняти з черги');
    },
    `Видалено: ${row.value}`,
    'Не вдалося видалити доповнення',
  ), [runAction]);

  const acceptAll = useCallback(entry => runAction(
    () => acceptAllOverlaysForCard({ cardUserId: entry.cardUserId, persistCard: persistCanonicalCard }),
    'Усі доповнення картки прийнято',
    'Не вдалося прийняти доповнення',
  ), [runAction]);

  const discardAll = useCallback(entry => runAction(
    () => removeAllOverlaysForCard(entry.cardUserId),
    'Усі доповнення картки видалено',
    'Не вдалося видалити доповнення',
  ), [runAction]);

  return (
    <Wrap>
      <QueueHeader>
        <QueueTitle>
          Черга доповнень
          {state.status === 'ready' && state.entries.length > 0 && (
            <ToolCount>{state.entries.length}</ToolCount>
          )}
        </QueueTitle>
        <QueueSpacer />
        <ToolButton type="button" onClick={refresh} disabled={busy || state.status === 'loading'}>
          {state.status === 'loading' ? 'Читаємо…' : 'Оновити'}
        </ToolButton>
      </QueueHeader>

      {state.status === 'loading' && <ToolDrawerNote>Читаємо всі шари доповнень…</ToolDrawerNote>}

      {state.status === 'error' && (
        <ToolDrawerNote>
          Не вдалося прочитати чергу: {state.error}. Найімовірніше, правила бази ще не
          викочені — <code>npx firebase deploy --only database</code>.
        </ToolDrawerNote>
      )}

      {state.status === 'ready' && state.entries.length === 0 && (
        <ToolDrawerNote>Нерозсуджених доповнень немає.</ToolDrawerNote>
      )}

      {state.entries.map(entry => (
        <OverlayCard
          key={entry.cardUserId}
          entry={entry}
          card={state.cards[entry.cardUserId]}
          busy={busy}
          onAcceptValue={acceptValue}
          onDiscardValue={discardValue}
          onAcceptAll={acceptAll}
          onDiscardAll={discardAll}
          onOpen={onOpenCard}
        />
      ))}
    </Wrap>
  );
};

export default OverlayReviewQueue;
