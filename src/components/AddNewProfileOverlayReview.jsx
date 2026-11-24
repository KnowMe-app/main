// Адмінська черга чернеток нових анкет і доповнень до наявних.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RULES_DEPLOY_HINT } from '../utils/rulesDeployHint';
import toast from 'react-hot-toast';
import styled from 'styled-components';

import {
  buildOverlayFieldEntries,
  getCanonicalCard,
  listPendingOverlayCards,
  sortOverlaysByAppliedOrder,
} from 'utils/multiAccountEdits';
import { INDEXABLE_DRAFT_STATUSES } from 'utils/profileDraftIndexing';
import { resolveCanonicalFieldName } from 'utils/profileNodeSchema';
import { profileProposalService } from 'utils/profileProposalRepository';
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

const CurrentValues = styled.div`
  padding: 6px 12px 0;
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

const getLinkedCreateDraft = (entry, activeDrafts, cards) => {
  if (cards[entry.cardUserId]) return null;
  const draft = activeDrafts.get(entry.cardUserId);
  if (!draft) return null;
  const linkedIds = Object.values(entry.recordsByEditor || {})
    .map(record => record?.proposal?.targetCreateProposalId)
    .filter(Boolean);
  return linkedIds.length === 0 || linkedIds.includes(draft.id) ? draft : null;
};

// Доповнення групуються за карткою, щоб адмін бачив усіх авторів разом.
// Для підписів достатньо карток стрічки. Повну анкету читаємо за запитом.
export const loadProposalReviewQueue = async () => {
  const [drafts, overlays] = await Promise.all([
    profileProposalService.listDrafts({ review: true, operation: 'create' }),
    listPendingOverlayCards({ includeRecords: true }),
  ]);
  const creates = drafts.filter(draft => draft.status === 'pendingReview');
  const { cards } = overlays.length
    ? await fetchMatchingCardsByIds(overlays.map(entry => entry.cardUserId))
    : { cards: {} };
  const activeDrafts = new Map(drafts.filter(draft => INDEXABLE_DRAFT_STATUSES.has(draft.status))
    .map(draft => [draft.reservedCardId, draft]));
  const entries = [
    ...creates.map(entry => ({ operation: 'create', key: entry.id, entry })),
    ...overlays.map(entry => ({
      operation: 'update', key: entry.cardUserId, entry,
      targetDraft: getLinkedCreateDraft(entry, activeDrafts, cards),
    })),
  ].sort((left, right) => (right.entry.updatedAt ?? 0) - (left.entry.updatedAt ?? 0));
  return { entries, cards };
};

const reviewValue = async (action, decision) => {
  if (!decision.expectedCurrent) throw Object.assign(new Error('REVISION_CONFLICT'), { code: 'REVISION_CONFLICT' });
  const result = await profileProposalService.reviewDraft({ operation: 'update', action, ...decision });
  if (!result) throw Object.assign(new Error('REVISION_CONFLICT'), { code: 'REVISION_CONFLICT' });
  return result;
};

const reviewAllValues = async (entry, action) => {
  for (const overlay of sortOverlaysByAppliedOrder(entry.overlaysByEditor)) {
    const { editorUserId } = overlay;
    const fields = buildOverlayFieldEntries({ [editorUserId]: overlay }, { recordsByEditor: entry.recordsByEditor });
    let expectedCurrent = entry.recordsByEditor?.[editorUserId];
    for (const [fieldName, rows] of Object.entries(fields)) {
      for (const row of rows) {
        // Наступний рядок спирається на щойно підтверджений залишок того
        // самого автора, а не на нове читання, що могло б прийняти чужу правку.
        // eslint-disable-next-line no-await-in-loop
        const result = await reviewValue(action, {
          cardUserId: entry.cardUserId, fieldName, ...rowDecision(row), expectedCurrent,
        });
        expectedCurrent = result.remainingOverlay;
      }
    }
  }
};

const rowDecision = ({ editorUserId, value, replacement }) => ({
  editorUserId, value, ...(replacement && { replacement }),
});

const proposalMeta = ({ author, revision, date }) => [
  author && `Автор ${author}`,
  Number.isSafeInteger(revision) && `Ревізія ${revision}`,
  date,
].filter(Boolean).join(' · ');

const currentValueLabel = value => {
  const values = (Array.isArray(value) ? value : [value]).filter(item => item !== '' && item != null);
  return values.length ? values.join(' · ') : 'Порожньо';
};

const ProposalCardHeader = ({ title, caption, metadata, busy, onOpen }) => (
  <CardHead>
    <CardHeadText>
      <CardName>{title}</CardName>
      <CardMeta>{caption}</CardMeta>
      {metadata && <CardMeta>{metadata}</CardMeta>}
    </CardHeadText>
    <ToolButton type="button" onClick={onOpen} disabled={busy}>
      Відкрити
    </ToolButton>
  </CardHead>
);

const CreateCard = ({ entry, busy, readOnly, onOpen, onAccept, onReject }) => {
  const { reservedCardId, createdBy, data, revision, updatedAt } = entry;
  return (
    <CardShell>
      <ProposalCardHeader
        title={describeCard(data) || reservedCardId}
        caption={`Нова анкета · ${reservedCardId}`}
        metadata={proposalMeta({ author: createdBy, revision, date: formatUpdatedAt(updatedAt) })}
        busy={busy}
        onOpen={() => onOpen(reservedCardId)}
      />
      <CardActions>
        <ToolButton type="button" $tone="primary" disabled={busy || readOnly} onClick={() => onAccept(entry)}>
          Створити анкету
        </ToolButton>
        <ToolButton type="button" $tone="danger" disabled={busy || readOnly} onClick={() => onReject(entry)}>
          Повернути автору
        </ToolButton>
      </CardActions>
    </CardShell>
  );
};

const OverlayCard = ({
  entry, card, targetDraft, busy, readOnly, onAcceptValue, onDiscardValue, onAcceptAll, onDiscardAll, onOpen,
}) => {
  const [showCurrent, setShowCurrent] = useState(false);
  const [current, setCurrent] = useState({ status: 'idle', values: null });
  useEffect(() => {
    if (!showCurrent) return undefined;
    let active = true;
    setCurrent({ status: 'loading', values: null });
    getCanonicalCard(entry.cardUserId).then(values => {
      if (active) setCurrent({ status: 'ready', values });
    }).catch(() => {
      if (active) setCurrent({ status: 'error', values: null });
    });
    return () => { active = false; };
  }, [entry, showCurrent]);
  // Та сама розкладка «по значенню», що й у формі редагування
  // (`buildOverlayFieldEntries`): рішення ухвалюють про значення, тож і список
  // мусить бути списком значень, а не полів.
  const pendingByField = useMemo(
    () => buildOverlayFieldEntries(entry.overlaysByEditor, { recordsByEditor: entry.recordsByEditor }),
    [entry.overlaysByEditor, entry.recordsByEditor],
  );
  const fieldNames = Object.keys(pendingByField);
  const targetsDraft = showCurrent && current.status === 'ready'
    ? current.values?.__profileMutationOperation === 'create'
    : Boolean(targetDraft);
  const targetLocation = targetsDraft ? 'в чернетку' : 'в анкету';
  const caption = [
    targetsDraft ? 'Доповнення до чернетки' : 'Зміни до анкети',
    entry.cardUserId,
    editorCountLabel(entry.editorIds.length),
    formatUpdatedAt(entry.updatedAt),
  ].filter(Boolean).join(' · ');

  return (
    <CardShell>
      <ProposalCardHeader
        title={describeCard(card ?? targetDraft?.data) || entry.cardUserId}
        caption={caption}
        busy={busy}
        onOpen={() => onOpen(entry.cardUserId)}
      />

      <CurrentValues>
        <ToolButton type="button" aria-expanded={showCurrent} onClick={() => setShowCurrent(value => !value)}>
          {showCurrent ? 'Сховати поточні значення' : 'Поточні значення'}
        </ToolButton>
        {showCurrent && current.status === 'loading' && <CardMeta role="status">Читаємо анкету…</CardMeta>}
        {showCurrent && current.status === 'error' && <CardMeta role="status">Не вдалося прочитати анкету.</CardMeta>}
      </CurrentValues>
      {fieldNames.map(fieldName => (
        <FieldBlock key={fieldName}>
          <FieldName>{labelForField(fieldName)}</FieldName>
          {showCurrent && current.status === 'ready' && (
            <CardMeta>
              Поточне значення · {currentValueLabel(current.values?.[resolveCanonicalFieldName(fieldName)] ?? current.values?.[fieldName])}
            </CardMeta>
          )}
          {pendingByField[fieldName].map(row => (
            <ValueRow key={JSON.stringify([row.editorUserId, row.value, row.isDeleted, row.replacement])}>
              <ValueText>
                {row.isDeleted && <RemovalMark aria-hidden="true">−</RemovalMark>}
                {row.previousValue != null && <PreviousValue>{row.previousValue}</PreviousValue>}
                {row.isDeleted ? <PreviousValue>{row.value}</PreviousValue> : row.value}
                <CardMeta>{proposalMeta({
                  author: row.editorUserId,
                  revision: entry.recordsByEditor?.[row.editorUserId]?.proposal?.revision,
                  date: formatUpdatedAt(entry.overlaysByEditor?.[row.editorUserId]?.updatedAt),
                })}</CardMeta>
              </ValueText>
              <ToolButton
                type="button"
                $tone="primary"
                disabled={busy || readOnly}
                onClick={() => onAcceptValue(entry, fieldName, row)}
                title={`Записати значення ${targetLocation} і прибрати з черги`}
              >
                Прийняти
              </ToolButton>
              <ToolButton
                type="button"
                $tone="danger"
                disabled={busy || readOnly}
                onClick={() => onDiscardValue(entry, fieldName, row)}
                title="Прибрати запропоноване значення з черги"
              >
                Видалити
              </ToolButton>
            </ValueRow>
          ))}
        </FieldBlock>
      ))}

      <CardActions>
        <ToolButton
          type="button"
          $tone="primary"
          disabled={busy || readOnly}
          onClick={() => onAcceptAll(entry)}
          title={`Записати всі запропоновані значення ${targetLocation}`}
        >
          Прийняти все
        </ToolButton>
        <ToolButton type="button" $tone="danger" disabled={busy || readOnly} onClick={() => onDiscardAll(entry)}>
          Видалити все
        </ToolButton>
      </CardActions>
    </CardShell>
  );
};

export const ProposalReviewQueue = ({ onOpenCard, onOpenDraft, readOnly = false }) => {
  const [state, setState] = useState({ status: 'idle', entries: [], cards: {}, error: '' });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'loading', error: '' }));
    try {
      const { entries, cards } = await loadProposalReviewQueue();
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
      if (error?.code === 'REVISION_CONFLICT') {
        toast.error('Анкету або пропозицію вже змінено. Перевірте оновлені дані.');
      } else if (error?.code === 'DUPLICATE_PROFILE') {
        toast.error('Анкета з такими контактами вже існує. Перевірте збіг перед публікацією.');
      } else {
        toast.error(`${failureMessage}: ${error?.code || error?.message || 'unknown'}`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const acceptValue = useCallback((entry, fieldName, row) => runAction(
    () => reviewValue('accept', {
      cardUserId: entry.cardUserId,
      fieldName,
      ...rowDecision(row),
      expectedCurrent: entry.recordsByEditor?.[row.editorUserId],
    }),
    `Прийнято: ${row.value}`,
    'Не вдалося прийняти доповнення',
  ), [runAction]);

  const discardValue = useCallback((entry, fieldName, row) => runAction(
    () => reviewValue('reject', {
      cardUserId: entry.cardUserId,
      fieldName,
      ...rowDecision(row),
      expectedCurrent: entry.recordsByEditor?.[row.editorUserId],
    }),
    `Видалено: ${row.value}`,
    'Не вдалося видалити доповнення',
  ), [runAction]);

  const acceptAll = useCallback(entry => runAction(
    () => reviewAllValues(entry, 'accept'),
    'Усі доповнення картки прийнято',
    'Не вдалося прийняти доповнення',
  ), [runAction]);

  const discardAll = useCallback(entry => runAction(
    () => reviewAllValues(entry, 'reject'),
    'Усі доповнення картки видалено',
    'Не вдалося видалити доповнення',
  ), [runAction]);

  const reviewCreate = (entry, action, successMessage, failureMessage) => runAction(
    () => profileProposalService.reviewDraft({
      operation: 'create', action, cardId: entry.reservedCardId, creatorUid: entry.createdBy,
      expectedRevision: entry.revision, expected: entry, ...(action === 'accept' && { finalData: entry.data }),
    }),
    successMessage,
    failureMessage,
  );

  return (
    <Wrap>
      <QueueHeader>
        <QueueTitle>
          Черга пропозицій
          {state.status === 'ready' && state.entries.length > 0 && (
            <ToolCount>{state.entries.length}</ToolCount>
          )}
        </QueueTitle>
        <QueueSpacer />
        <ToolButton type="button" onClick={refresh} disabled={busy || state.status === 'loading'}>
          {state.status === 'loading' ? 'Читаємо…' : 'Оновити'}
        </ToolButton>
      </QueueHeader>

      {state.status === 'loading' && <ToolDrawerNote>Читаємо пропозиції…</ToolDrawerNote>}

      {state.status === 'error' && (
        <ToolDrawerNote>
          Не вдалося прочитати чергу: {state.error}. {RULES_DEPLOY_HINT}.
        </ToolDrawerNote>
      )}

      {state.status === 'ready' && state.entries.length === 0 && (
        <ToolDrawerNote>Пропозицій на розгляд немає.</ToolDrawerNote>
      )}

      {state.entries.map(({ operation, key, entry, targetDraft }) => operation === 'create' ? (
        <CreateCard
          key={`${operation}:${key}`}
          entry={entry}
          busy={busy}
          readOnly={readOnly}
          onOpen={onOpenDraft}
          onAccept={draft => reviewCreate(draft, 'accept', 'Анкету створено', 'Не вдалося створити анкету')}
          onReject={draft => reviewCreate(draft, 'reject', 'Чернетку повернуто автору', 'Не вдалося повернути чернетку')}
        />
      ) : (
        <OverlayCard
          key={`${operation}:${key}`}
          entry={entry}
          card={state.cards[entry.cardUserId]}
          targetDraft={targetDraft}
          busy={busy}
          readOnly={readOnly}
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

export default ProposalReviewQueue;
