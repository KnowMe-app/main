import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { FiCornerUpLeft, FiCornerUpRight, FiSettings } from 'react-icons/fi';
import { auth } from './config';
import { InfoModal } from './InfoModal';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import Collapsible from './Collapsible';
import {
  Backdrop,
  DangerBtn,
  Dialog,
  DialogActions,
  DialogText,
  GhostBtn,
  IconBtn,
  OfflineNote,
  PrimaryBtn,
  ScaledContent,
  Segmented,
  SegmentBtn,
  Sheet,
  SheetGrip,
  SheetHead,
  SheetSection,
  TextInput,
  TopBar,
  TopSpacer,
  Wrap,
  Card,
} from './FlowManager.styled';
import {
  AptChip,
  AptChips,
  Amount,
  Block,
  BlockHead,
  Calc,
  CalcBlock,
  CalcLine,
  CarryAll,
  CarryBtn,
  DateLine,
  Dot,
  EditorCard,
  EditorHead,
  ErrorText,
  ExtraRow,
  FieldLabel,
  FieldRow,
  Foot,
  Hint,
  HistoryTitle,
  InitGrid,
  LinkBtn,
  Missing,
  MonthCard,
  MonthHead,
  MonthResult,
  NumInput,
  PasteBlock,
  PasteHead,
  PasteText,
  SettingRow,
  SignBtn,
  Status,
  SummaryBig,
  SummaryKicker,
  Tag,
  Title,
  Trio,
} from './UtilitiesPage.styled';
import { UTILITIES_IMPORT_SAMPLE, planUtilitiesImport } from 'utils/utilitiesImport';
import { enqueueUtilitiesPatch, fetchUtilitiesData, listUtilitiesOwners } from './utilitiesRemote';
import { ADMIN_UIDS, isAdminUid, readStoredAccessLevel, readStoredCanCreateProfiles, resolveAccess } from 'utils/accessLevel';
import { listPendingOutboxPatches, subscribeWriteOutbox } from 'utils/writeOutbox';
import {
  applyUtilitiesPatch,
  buildInverseUtilitiesPatch,
  clearUtilitiesCache,
  countPendingUtilitiesWrites,
  overlayPendingUtilitiesWrites,
  readUtilitiesCache,
  utilitiesRootPath,
  writeUtilitiesCache,
} from 'utils/utilitiesOfflineWrites';
import {
  CATEGORY_TYPES,
  MONTHS,
  MONTHS_GEN,
  MONTHS_LOC,
  buildNewApartment,
  buildTenantText,
  capitalize,
  computeMonth,
  evalUtilityExpr,
  fieldStatus,
  formatDm,
  formatDmy,
  formatExpr,
  formatMoney,
  formatNumber,
  formatSigned,
  getPath,
  hasValue,
  isFormula,
  isNumber,
  listApartments,
  listCarryFields,
  listCategories,
  listClosedMonths,
  listExtras,
  listMissing,
  listSuggestions,
  monthIndex,
  monthName,
  nextMonthKey,
  parseDmy,
  paymentDateLabel,
  prevReading,
  resolveOpenMonth,
  setPath,
  todayIso,
  zonesOf,
} from 'utils/utilitiesModel';

/*
 * «Комуналка» (17.11, на прохання власниці продукту — замість таблиці Excel).
 * Модель і розрахунок — `utils/utilitiesModel`, запис без звʼязку —
 * `utils/utilitiesOfflineWrites` через чергу пристрою (як Flow), експорт —
 * `utils/utilitiesExport` (книга Excel на квартиру).
 *
 * Поле пише в базу на blur, а не на кожну літеру: живий розрахунок під полем
 * рахує набране з `localEdits`, тож число видно одразу, а черга не множиться.
 */

const TEXT_SCALES = [1, 1.15, 1.3, 1.5];
const textScaleKey = ownerId => `utilities-text-scale:${ownerId || 'anon'}`;
const selectedAptKey = ownerId => `utilities-apartment:${ownerId || 'anon'}`;
const HISTORY_LIMIT = 100;

const readStorage = key => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // нічого
  }
};

const pathToDb = relPath => relPath.split('.').join('/');
const editKey = (aptId, mk, relPath) => `${aptId}|${mk}|${relPath}`;
const newId = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const applyLocalEdits = (month, localEdits) => {
  const prefix = `${month.aptId}|${month.mk}|`;
  const entries = Object.entries(localEdits).filter(([key]) => key.startsWith(prefix));
  if (!entries.length) return month;
  const next = JSON.parse(JSON.stringify(month));
  entries.forEach(([key, value]) => setPath(next, key.slice(prefix.length), value === '' ? null : value));
  return next;
};

// ---------- поле числа з позначкою «без змін / змінено» ----------

const ValueField = ({ month, path, label, ariaLabel, sub, readOnly, localEdits, onEdit, onCommit, testId }) => {
  const key = editKey(month.aptId, month.mk, path);
  const stored = getPath(month, path);
  const value = Object.prototype.hasOwnProperty.call(localEdits, key) ? localEdits[key] : (stored ?? '');
  const parsed = evalUtilityExpr(value);
  return (
    <>
      <FieldLabel>
        {label}
        {sub ? <small>{sub}</small> : null}
      </FieldLabel>
      <NumInput
        inputMode="decimal"
        value={value}
        readOnly={readOnly}
        aria-label={ariaLabel || label}
        data-testid={testId}
        $empty={!hasValue(value)}
        $bad={hasValue(value) && !isNumber(parsed)}
        onChange={e => onEdit(key, e.target.value)}
        onBlur={() => onCommit(month, path, key)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </>
  );
};

// ---------- редактор місяця (і нового, і закритого в правці) ----------

const MonthEditor = ({
  data,
  apartment,
  month,
  editable,
  isOpenMonth,
  localEdits,
  onEdit,
  onCommitField,
  onWrite,
  onCopy,
  onClose,
  onToggleEdit,
  onDelete,
  confirmingDelete,
  onCancelDelete,
  onConfirmDelete,
  canWrite,
}) => {
  const view = applyLocalEdits(month, localEdits);
  const computed = computeMonth(data, view);
  const prev = computed.prevMonth;
  const carryFields = listCarryFields(apartment, month.mk);
  const empties = carryFields.filter(field => !hasValue(getPath(view, field.path)) && prev && hasValue(getPath(prev, field.path)));
  const missing = listMissing(view, computed);
  const text = buildTenantText(apartment, view, computed);
  const [dateText, setDateText] = useState(formatDmy(month.date));
  useEffect(() => setDateText(formatDmy(month.date)), [month.date]);

  const statusFor = field => {
    const status = fieldStatus(data, view, field.path);
    if (status.kind === 'invalid') return <ErrorText>Не число. Можна формулою: 1340-571.13</ErrorText>;
    if (status.kind === 'same') return <Tag>без змін</Tag>;
    if (status.kind === 'changed') {
      const current = getPath(view, field.path);
      return (
        <>
          <Tag $changed>змінено{status.prev && hasValue(status.prevValue) ? ` · було ${formatExpr(status.prevValue)}` : ''}</Tag>
          {isFormula(current) ? <span>= {formatMoney(evalUtilityExpr(current))}</span> : null}
        </>
      );
    }
    if (!editable) return null;
    const suggestions = listSuggestions(data, view, field);
    if (!suggestions.length) return <span style={{ color: 'var(--km-muted, #6b6359)' }}>Перший місяць — впишіть вручну</span>;
    return suggestions.map(item => (
      <CarryBtn
        key={`${item.value}-${item.label}`}
        type="button"
        $other={item.other}
        onMouseDown={e => e.preventDefault()}
        // Набране в полі (зокрема стерте) знімається: інакше на blur воно
        // записалось би поверх щойно перенесеного значення.
        onClick={() => onWrite(month, { [field.path]: item.value }, `Перенесено: ${field.label}`, [editKey(month.aptId, month.mk, field.path)])}
        data-testid={`utilities-carry-${field.path}`}
      >
        ↻ {item.label}
      </CarryBtn>
    ));
  };

  // Підпис для читача екрана — з назвою блоку: «Сума» під ЖЕК і під
  // інтернетом інакше звучали б однаково.
  const fieldRow = (field, label, sub) => (
    <FieldRow key={field.path}>
      <ValueField
        month={month}
        path={field.path}
        label={label}
        ariaLabel={field.budget ? 'Бюджет — внесла орендарка' : `${field.label}`}
        sub={sub}
        readOnly={!editable}
        localEdits={localEdits}
        onEdit={onEdit}
        onCommit={onCommitField}
        testId={`utilities-field-${field.path}`}
      />
      <Status>{statusFor(field)}</Status>
    </FieldRow>
  );

  const prevLabel = reading => {
    if (reading.source === 'manual') return 'вручну';
    if (reading.source === 'init') return `початкові ${formatDm(reading.date)}`;
    return `з ${MONTHS_GEN[monthIndex(reading.mk)]}`;
  };

  const zoneRow = (block, row) => {
    const { zone } = row;
    const manualKey = editKey(month.aptId, month.mk, zone.prev);
    const manualStored = getPath(month, zone.prev);
    const manualValue = Object.prototype.hasOwnProperty.call(localEdits, manualKey) ? localEdits[manualKey] : manualStored;
    const isManual = hasValue(manualStored) || Object.prototype.hasOwnProperty.call(localEdits, manualKey);
    let calc = null;
    if (isNumber(row.cur)) {
      if (row.use < 0) {
        calc = <ErrorText>Менше, ніж було ({formatNumber(row.prev.value)}). Новий лічильник? Натисніть «змінити» біля «було».</ErrorText>;
      } else if (isNumber(row.tariff)) {
        calc = <>{formatNumber(row.use)} {block.cat.unit} × {formatNumber(row.tariff)} = <b>{formatMoney(row.sum)} ₴</b></>;
      } else {
        calc = <>{formatNumber(row.use)} {block.cat.unit} · чекає тарифу</>;
      }
    } else if (hasValue(getPath(view, zone.cur))) {
      calc = <ErrorText>Не число</ErrorText>;
    }
    return (
      <FieldRow key={zone.cur}>
        <FieldLabel>
          {block.cat.type === CATEGORY_TYPES.METER2 ? zone.label : 'Показник'}
          <WasLine
            editable={editable}
            isManual={isManual}
            manualValue={manualValue}
            reading={row.prev}
            prevLabel={prevLabel}
            onManual={() => {
              const auto = prevReading(data, { ...view, vals: { ...(view.vals || {}) } }, { ...zone, prev: '__none__' });
              onEdit(manualKey, isNumber(auto.value) ? String(auto.value) : '');
            }}
            onManualChange={value => onEdit(manualKey, value)}
            onManualCommit={() => onCommitField(month, zone.prev, manualKey)}
            onAuto={() => onWrite(month, { [zone.prev]: null }, 'Було — як було', [manualKey])}
          />
        </FieldLabel>
        <NumInput
          inputMode="decimal"
          placeholder="зараз"
          readOnly={!editable}
          aria-label={`${block.cat.name} ${zone.label}, зараз`}
          data-testid={`utilities-field-${zone.cur}`}
          value={Object.prototype.hasOwnProperty.call(localEdits, editKey(month.aptId, month.mk, zone.cur))
            ? localEdits[editKey(month.aptId, month.mk, zone.cur)]
            : (getPath(month, zone.cur) ?? '')}
          $empty={!hasValue(getPath(view, zone.cur))}
          $bad={(isNumber(row.cur) && row.use < 0) || (hasValue(getPath(view, zone.cur)) && !isNumber(row.cur))}
          onChange={e => onEdit(editKey(month.aptId, month.mk, zone.cur), e.target.value)}
          onBlur={() => onCommitField(month, zone.cur, editKey(month.aptId, month.mk, zone.cur))}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <Calc>{calc}</Calc>
      </FieldRow>
    );
  };

  const extras = listExtras(view);
  const isReopened = isOpenMonth && !month.virtual && Boolean(month.reopenedAt);

  return (
    <EditorCard data-testid={isOpenMonth ? 'utilities-open-month' : `utilities-month-${month.mk}`}>
      {isOpenMonth && (
        <EditorHead>
          {/* Місяць, який правка повернула в роботу, — не новий: за ним уже
              є закриті. */}
          <h2>{isReopened ? 'Повернуто в роботу' : 'Новий місяць'} — {MONTHS[monthIndex(month.mk)]}</h2>
          <span>платіж {paymentDateLabel(apartment, month.mk)}</span>
        </EditorHead>
      )}
      <DateLine>
        Показники зняли
        <input
          inputMode="numeric"
          placeholder="дд.мм.рррр"
          value={dateText}
          readOnly={!editable}
          aria-label="Дата зняття показників"
          onChange={e => setDateText(e.target.value)}
          onBlur={() => {
            const iso = parseDmy(dateText);
            if (iso && iso !== month.date) onWrite(month, { date: iso }, 'Дата показників');
            else if (!iso) setDateText(formatDmy(month.date));
          }}
        />
      </DateLine>
      {editable && isOpenMonth && prev && empties.length > 0 && (
        <CarryAll
          type="button"
          data-testid="utilities-carry-all"
          onClick={() => onWrite(
            month,
            Object.fromEntries(empties.map(field => [field.path, String(getPath(prev, field.path))])),
            `Перенесено без змін: ${empties.length}`,
            empties.map(field => editKey(month.aptId, month.mk, field.path))
          )}
        >
          <span>↻ Тарифи й суми без змін — перенести все з {MONTHS_GEN[monthIndex(prev.mk)]}</span>
          <small>{empties.length}</small>
        </CarryAll>
      )}

      {computed.blocks.map(block => (
        <Block key={block.cat.key}>
          <BlockHead>
            <Dot $tone={block.cat.tone} />
            <b>{block.cat.name}</b>
            <span>{block.complete ? `${formatMoney(block.sum)} ₴` : ''}</span>
          </BlockHead>
          {block.cat.type === CATEGORY_TYPES.SUM
            ? fieldRow(carryFields.find(field => field.path === `vals.${block.cat.key}.e`), 'Сума', 'можна формулою')
            : (
              <>
                {block.zones.map(row => zoneRow(block, row))}
                {zonesOf(block.cat).map(zone => fieldRow(carryFields.find(field => field.path === zone.tariff), zone.tariffLabel, `₴ за ${block.cat.unit || 'одиницю'}`))}
              </>
            )}
        </Block>
      ))}

      <Block>
        <BlockHead>
          <Dot />
          <b>Бюджет на комуналку</b>
          <span>{computed.carried ? `${formatMoney(computed.available)} ₴` : ''}</span>
        </BlockHead>
        {fieldRow(carryFields.find(field => field.budget), 'Внесла орендарка', 'депозит за місяць')}
        {prev && (
          <div style={{ paddingTop: 6 }}>
            <div style={{ marginBottom: 6, fontSize: 14 }}>
              {computed.prevResult >= 0 ? 'Переплата' : 'Борг'} з {MONTHS_GEN[monthIndex(prev.mk)]}:{' '}
              <Amount $tone={computed.prevResult >= 0 ? 'pos' : 'neg'}><b>{formatSigned(computed.prevResult)} ₴</b></Amount>
            </div>
            <Segmented $count={2} role="group" aria-label="Що робити з залишком минулого місяця">
              <SegmentBtn
                type="button"
                $selected={view.carry === true}
                disabled={!editable}
                aria-pressed={view.carry === true}
                data-testid="utilities-carry-balance-yes"
                onClick={() => onWrite(month, { carry: true }, 'Залишок перенесено')}
              >
                Перенести в бюджет
              </SegmentBtn>
              <SegmentBtn
                type="button"
                $selected={view.carry === false}
                disabled={!editable}
                aria-pressed={view.carry === false}
                data-testid="utilities-carry-balance-no"
                onClick={() => onWrite(month, { carry: false }, 'Залишок не переносимо')}
              >
                {computed.prevResult >= 0 ? 'Не переносити — врахую з платежу' : 'Не переносити — віддасть окремо'}
              </SegmentBtn>
            </Segmented>
          </div>
        )}
      </Block>

      <Block>
        <BlockHead>
          <Dot />
          <b>Коригування й разові</b>
        </BlockHead>
        {extras.map(extra => {
          const labelKey = editKey(month.aptId, month.mk, `extras.${extra.id}.label`);
          const amountKey = editKey(month.aptId, month.mk, `extras.${extra.id}.e`);
          const charge = extra.kind === 'charge';
          return (
            <ExtraRow key={extra.id}>
              <SignBtn
                type="button"
                $charge={charge}
                disabled={!editable}
                title={charge ? 'Додатково з орендаря' : 'На користь орендаря'}
                aria-label={charge ? 'Додатково з орендаря' : 'На користь орендаря'}
                onClick={() => onWrite(month, { [`extras.${extra.id}.kind`]: charge ? 'credit' : 'charge' }, 'Знак коригування')}
              >
                {charge ? '−' : '+'}
              </SignBtn>
              <input
                value={Object.prototype.hasOwnProperty.call(localEdits, labelKey) ? localEdits[labelKey] : (getPath(month, `extras.${extra.id}.label`) ?? '')}
                placeholder="Що це"
                aria-label="Що це за коригування"
                readOnly={!editable}
                onChange={e => onEdit(labelKey, e.target.value)}
                onBlur={() => onCommitField(month, `extras.${extra.id}.label`, labelKey, { text: true })}
              />
              <input
                data-amount="1"
                inputMode="decimal"
                value={Object.prototype.hasOwnProperty.call(localEdits, amountKey) ? localEdits[amountKey] : (getPath(month, `extras.${extra.id}.e`) ?? '')}
                placeholder="сума"
                aria-label="Сума коригування"
                readOnly={!editable}
                onChange={e => onEdit(amountKey, e.target.value)}
                onBlur={() => onCommitField(month, `extras.${extra.id}.e`, amountKey)}
              />
              {editable ? (
                <IconBtn type="button" style={{ minWidth: 34, height: 34 }} aria-label="Прибрати рядок" onClick={() => onWrite(month, { [`extras.${extra.id}`]: null }, 'Прибрано рядок')}>×</IconBtn>
              ) : <span />}
            </ExtraRow>
          );
        })}
        {editable && (
          <LinkBtn
            type="button"
            data-testid="utilities-add-extra"
            onClick={() => onWrite(month, { [`extras.${newId('x')}`]: { label: '', e: '', kind: 'credit', order: Date.now() } }, 'Додано рядок')}
          >
            + Додати рядок
          </LinkBtn>
        )}
      </Block>

      <CalcBlock data-testid="utilities-calc">
        {computed.blocks.map(block => (
          <CalcLine key={block.cat.key}><span>{block.cat.name}</span><span>{block.complete ? formatMoney(block.sum) : '—'}</span></CalcLine>
        ))}
        <CalcLine $bold><span>Разом комуналка</span><span>{formatMoney(computed.cost)}</span></CalcLine>
        <CalcLine>
          <span>Бюджет{computed.carried ? ` + ${computed.carried >= 0 ? 'переплата' : 'борг'} з ${MONTHS_GEN[monthIndex(prev.mk)]}` : ''}</span>
          <span>{formatMoney(computed.available)}</span>
        </CalcLine>
        {computed.extras.map(extra => (
          <CalcLine key={extra.id}><span>{extra.label || 'Коригування'}</span><Amount $tone={extra.signed >= 0 ? 'pos' : 'neg'}>{formatSigned(extra.signed)}</Amount></CalcLine>
        ))}
        <CalcLine $total>
          <span>{computed.result >= 0 ? 'Переплата' : 'Борг'}</span>
          <Amount $tone={computed.result >= 0 ? 'pos' : 'neg'} data-testid="utilities-result">{formatMoney(Math.abs(computed.result))} ₴</Amount>
        </CalcLine>
        {isOpenMonth && missing.length > 0 && <Missing>Ще не заповнено: {missing.join(', ')}</Missing>}
      </CalcBlock>

      <PasteBlock>
        <PasteHead>
          <b>Текст для орендаря</b>
          <GhostBtn type="button" style={{ minHeight: 34 }} onClick={() => onCopy(text)} data-testid="utilities-copy">Скопіювати</GhostBtn>
        </PasteHead>
        <PasteText data-testid="utilities-text">{text}</PasteText>
      </PasteBlock>

      {canWrite && (isOpenMonth ? (
        <Foot>
          <PrimaryBtn
            type="button"
            style={{ flex: 1 }}
            disabled={missing.length > 0}
            data-testid="utilities-close-month"
            onClick={() => onClose(month)}
          >
            {missing.length ? `Закрити місяць · бракує ${missing.length}` : `Закрити ${MONTHS[monthIndex(month.mk)]} · ${formatSigned(computed.result)} ₴`}
          </PrimaryBtn>
        </Foot>
      ) : confirmingDelete ? (
        <Foot style={{ background: 'var(--km-danger-bg, #fff2f1)' }}>
          <Hint style={{ width: '100%' }}>Видалити {monthName(month.mk)}? Наступний місяць візьме «було» з попереднього.</Hint>
          <DangerBtn type="button" onClick={() => onConfirmDelete(month)} data-testid="utilities-delete-month-confirm">Видалити</DangerBtn>
          <GhostBtn type="button" onClick={onCancelDelete}>Залишити</GhostBtn>
        </Foot>
      ) : (
        <Foot>
          <GhostBtn type="button" onClick={() => onToggleEdit(month)} data-testid="utilities-edit-month">{editable ? 'Готово' : 'Змінити'}</GhostBtn>
          <GhostBtn type="button" style={{ color: 'var(--km-danger, #b42318)' }} onClick={() => onDelete(month)}>Видалити</GhostBtn>
        </Foot>
      ))}
    </EditorCard>
  );
};

const WasLine = ({ editable, isManual, manualValue, reading, prevLabel, onManual, onManualChange, onManualCommit, onAuto }) => {
  const inputRef = useRef(null);
  const [focusNext, setFocusNext] = useState(false);
  useEffect(() => {
    if (focusNext && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      setFocusNext(false);
    }
  }, [focusNext, isManual]);
  if (isManual && editable) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--km-muted, #6b6359)' }}>
        було{' '}
        <input
          ref={inputRef}
          inputMode="decimal"
          value={manualValue ?? ''}
          aria-label="Було, вручну"
          style={{ width: 84, border: '1px solid var(--km-accent, #c9600f)', borderRadius: 7, padding: '2px 6px', font: 'inherit', fontSize: 13, background: 'var(--km-card, #fff)', color: 'var(--km-text, #1c1b1a)' }}
          onChange={e => onManualChange(e.target.value)}
          onBlur={onManualCommit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />{' '}
        <Tag $changed>вручну</Tag>{' '}
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={onAuto}
          style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, color: 'var(--km-accent-text, #9a470a)', textDecoration: 'underline', cursor: 'pointer' }}
        >
          як було
        </button>
      </div>
    );
  }
  return (
    <div style={{ fontSize: 12.5, color: 'var(--km-muted, #6b6359)' }}>
      було <b>{isNumber(reading.value) ? formatNumber(reading.value) : '—'}</b> · {prevLabel(reading)}
      {editable && (
        <>
          {' · '}
          <button
            type="button"
            onClick={() => { onManual(); setFocusNext(true); }}
            style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, color: 'var(--km-accent-text, #9a470a)', textDecoration: 'underline', cursor: 'pointer' }}
          >
            змінити
          </button>
        </>
      )}
    </div>
  );
};

// ---------- налаштування квартири ----------

const SettingsSheet = ({ data, apartment, currentMk, canWrite, onWriteApartment, onAddApartment, onDeleteApartment, onExport, exporting, onImportFile, onClose, textScale, onTextScale }) => {
  const importInputRef = useRef(null);
  const [showSample, setShowSample] = useState(false);
  const [catName, setCatName] = useState('');
  const [catUnit, setCatUnit] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drafts, setDrafts] = useState({});
  // Блоки, що діють у місяці, який зараз заповнюють.
  const cats = listCategories(apartment, currentMk);
  const fieldValue = (key, stored) => (Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : (stored ?? ''));
  const commit = (key, relPatch, label) => {
    setDrafts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    onWriteApartment(relPatch, label);
  };

  return (
    <Backdrop onClick={onClose}>
      <Sheet role="dialog" aria-label="Налаштування комуналки" onClick={e => e.stopPropagation()} data-testid="utilities-settings">
        <SheetGrip />
        <SheetHead>
          <h2>{apartment ? `${apartment.name} · налаштування` : 'Налаштування'}</h2>
          <IconBtn type="button" onClick={onClose} aria-label="Закрити">✕</IconBtn>
        </SheetHead>
        {apartment && (
          <>
            <Hint>Блок додається й прибирається з місяця, який зараз заповнюєте ({monthName(currentMk)}): закриті місяці лишаються такими, як були. Тарифи й суми тут не задаються — вони живуть у кожному місяці й переносяться тапом. Тут лише те, з чого складається місяць.</Hint>
            <SheetSection>
              <span>Квартира</span>
              <SettingRow>
                <div><b>Назва</b></div>
                <TextInput
                  style={{ width: 170 }}
                  value={fieldValue('name', apartment.name)}
                  readOnly={!canWrite}
                  aria-label="Назва квартири"
                  onChange={e => setDrafts(prev => ({ ...prev, name: e.target.value }))}
                  onBlur={() => {
                    const name = String(fieldValue('name', apartment.name)).trim();
                    if (name && name !== apartment.name) commit('name', { name }, 'Назва квартири');
                    else setDrafts(prev => { const next = { ...prev }; delete next.name; return next; });
                  }}
                />
              </SettingRow>
              <SettingRow>
                <div><b>День платежу</b><small>З якого платежу врахувати переплату</small></div>
                <TextInput
                  style={{ width: 70, textAlign: 'right' }}
                  inputMode="numeric"
                  value={fieldValue('payDay', apartment.payDay)}
                  readOnly={!canWrite}
                  aria-label="День платежу"
                  onChange={e => setDrafts(prev => ({ ...prev, payDay: e.target.value }))}
                  onBlur={() => {
                    const day = parseInt(fieldValue('payDay', apartment.payDay), 10);
                    if (day >= 1 && day <= 28 && day !== Number(apartment.payDay)) commit('payDay', { payDay: day }, `День платежу ${day}`);
                    else setDrafts(prev => { const next = { ...prev }; delete next.payDay; return next; });
                  }}
                />
              </SettingRow>
            </SheetSection>

            <SheetSection>
              <span>Блоки місяця</span>
              {cats.map(cat => (
                <SettingRow key={cat.key}>
                  <Dot $tone={cat.tone} />
                  <div>
                    <b>{cat.name}</b>
                    <small>{cat.type === CATEGORY_TYPES.METER2 ? 'два показники (день і ніч) × два тарифи' : cat.type === CATEGORY_TYPES.METER ? `показник × тариф, ${cat.unit || 'од.'}` : 'сума за місяць'}</small>
                  </div>
                  {canWrite && cats.length > 1 && (
                    // Прибирається з місяця, який зараз заповнюють: закриті
                    // місяці лишаються зі своїм нарахуванням.
                    <GhostBtn type="button" style={{ minHeight: 34 }} onClick={() => onWriteApartment({ [`cats.${cat.key}.retiredFrom`]: currentMk }, `Прибрано блок «${cat.name}»`)}>
                      Прибрати
                    </GhostBtn>
                  )}
                </SettingRow>
              ))}
              {canWrite && (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <TextInput style={{ flex: '2 1 160px' }} value={catName} placeholder="Новий блок, напр. Газ" aria-label="Назва блоку" onChange={e => setCatName(e.target.value)} />
                    <TextInput style={{ flex: '1 1 90px' }} value={catUnit} placeholder="од., напр. м³" aria-label="Одиниця лічильника" onChange={e => setCatUnit(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { type: CATEGORY_TYPES.METER, label: '+ Лічильник' },
                      { type: CATEGORY_TYPES.SUM, label: '+ Сума за місяць' },
                    ].map(option => (
                      <GhostBtn
                        key={option.type}
                        type="button"
                        data-testid={`utilities-add-cat-${option.type}`}
                        onClick={() => {
                          const name = catName.trim();
                          if (!name) {
                            toast('Назвіть блок');
                            return;
                          }
                          const key = newId('c');
                          const order = listCategories(apartment).reduce((max, cat) => Math.max(max, Number(cat.order) || 0), 0) + 1;
                          // Новий блок діє з місяця, який зараз заповнюють:
                          // закриті місяці без нього не стають «неповними».
                          const cat = option.type === CATEGORY_TYPES.METER
                            ? { name, type: option.type, unit: catUnit.trim() || 'од.', order, since: currentMk }
                            : { name, type: option.type, order, since: currentMk };
                          const patch = { [`cats.${key}`]: cat };
                          if (option.type === CATEGORY_TYPES.METER) patch[`init.vals.${key}.cur`] = 0;
                          onWriteApartment(patch, `Додано блок «${name}»`);
                          setCatName('');
                          setCatUnit('');
                        }}
                      >
                        {option.label}
                      </GhostBtn>
                    ))}
                  </div>
                </>
              )}
            </SheetSection>

            <SheetSection>
              <span>Початкові показники</span>
              <Hint>Звідси перший місяць бере «було». Нова орендарка чи новий лічильник посеред року — у місяці натисніть «змінити» біля «було».</Hint>
              <SettingRow>
                <div><b>Записано</b></div>
                <TextInput
                  style={{ width: 130 }}
                  inputMode="numeric"
                  placeholder="дд.мм.рррр"
                  value={fieldValue('initDate', formatDmy(apartment?.init?.date))}
                  readOnly={!canWrite}
                  aria-label="Дата початкових показників"
                  onChange={e => setDrafts(prev => ({ ...prev, initDate: e.target.value }))}
                  onBlur={() => {
                    const iso = parseDmy(fieldValue('initDate', ''));
                    if (iso && iso !== apartment?.init?.date) commit('initDate', { 'init.date': iso }, 'Дата початкових показників');
                    else setDrafts(prev => { const next = { ...prev }; delete next.initDate; return next; });
                  }}
                />
              </SettingRow>
              <InitGrid>
                {cats.flatMap(cat => zonesOf(cat).map(zone => {
                  const key = `init:${zone.cur}`;
                  const stored = getPath(apartment.init, zone.cur);
                  return (
                    <label key={zone.cur}>
                      {cat.name}{cat.type === CATEGORY_TYPES.METER2 ? ` · ${zone.label.toLowerCase()}` : ''}
                      <TextInput
                        inputMode="decimal"
                        value={fieldValue(key, stored)}
                        readOnly={!canWrite}
                        onChange={e => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                        onBlur={() => {
                          const value = evalUtilityExpr(fieldValue(key, stored));
                          if (isNumber(value) && value !== Number(stored)) commit(key, { [`init.${zone.cur}`]: value }, 'Початкові показники');
                          else setDrafts(prev => { const next = { ...prev }; delete next[key]; return next; });
                        }}
                      />
                    </label>
                  );
                }))}
              </InitGrid>
            </SheetSection>
          </>
        )}

        <SheetSection>
          <span>Розмір тексту</span>
          <Segmented $count={TEXT_SCALES.length} role="group" aria-label="Розмір тексту">
            {TEXT_SCALES.map(scale => (
              <SegmentBtn key={scale} type="button" $selected={scale === textScale} aria-pressed={scale === textScale} onClick={() => onTextScale(scale)}>
                {Math.round(scale * 100)} %
              </SegmentBtn>
            ))}
          </Segmented>
        </SheetSection>

        <SheetSection>
          <span>Усі квартири</span>
          <GhostBtn type="button" disabled={exporting || !listApartments(data).length} onClick={onExport} data-testid="utilities-export">
            {exporting ? 'Готуємо файли…' : 'Експорт в Excel — книга на кожну квартиру'}
          </GhostBtn>
          {canWrite && (
            <>
              <GhostBtn type="button" onClick={() => importInputRef.current?.click()} data-testid="utilities-import">
                Імпорт з JSON
              </GhostBtn>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                data-testid="utilities-import-input"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onImportFile(file);
                }}
              />
              <LinkBtn type="button" onClick={() => setShowSample(open => !open)} aria-expanded={showSample}>
                {showSample ? 'Сховати зразок файлу' : 'Який вигляд має файл?'}
              </LinkBtn>
              {showSample && (
                <>
                  <Hint>Квартира впізнається за назвою: місяці лягають у наявну (той самий місяць замінюється), інакше заводиться нова. Суми й тарифи — числом або формулою. Резервну копію (вузли apartments і months з бази) теж можна імпортувати.</Hint>
                  <PasteText data-testid="utilities-import-sample">{UTILITIES_IMPORT_SAMPLE}</PasteText>
                </>
              )}
              <GhostBtn type="button" onClick={onAddApartment}>+ Додати квартиру</GhostBtn>
            </>
          )}
          {canWrite && apartment && (confirmDelete ? (
            <SettingRow style={{ background: 'var(--km-danger-bg, #fff2f1)', flexWrap: 'wrap' }}>
              <div><b>Видалити {apartment.name}?</b><small>Зникнуть усі її місяці. Відмінити можна кнопкою «Назад» угорі.</small></div>
              <DangerBtn type="button" onClick={() => { setConfirmDelete(false); onDeleteApartment(); }} data-testid="utilities-delete-apartment-confirm">Видалити</DangerBtn>
              <GhostBtn type="button" onClick={() => setConfirmDelete(false)}>Залишити</GhostBtn>
            </SettingRow>
          ) : (
            <GhostBtn type="button" style={{ color: 'var(--km-danger, #b42318)' }} onClick={() => setConfirmDelete(true)}>Видалити квартиру</GhostBtn>
          ))}
        </SheetSection>
      </Sheet>
    </Backdrop>
  );
};

// ---------- закриті місяці, що стали неповними ----------

/*
 * Правка, після якої закритий місяць неповний, повертає його в роботу. І не
 * лише той місяць, який правили: показник місяця — «було» наступного,
 * початкові показники — «було» першого, видалений місяць посередині міняє
 * «було» наступного. Неповний закритий місяць мовчки рахував би лічильник чи
 * суму нулем, і зсувались би переплати наступних місяців та експорт. Знову
 * закрити такий місяць можна лише повним (`listMissing`).
 */
const withReopenedIncompleteMonths = (before, patch, ownerId) => {
  const root = `${utilitiesRootPath(ownerId)}/`;
  const touched = new Set();
  Object.keys(patch).forEach(path => {
    if (!path.startsWith(root)) return;
    const [section, aptId] = path.slice(root.length).split('/');
    if ((section === 'months' || section === 'apartments') && aptId) touched.add(aptId);
  });
  if (!touched.size) return patch;
  const after = applyUtilitiesPatch(before, patch, ownerId);
  const extra = {};
  const reopened = [];
  const now = Date.now();
  touched.forEach(aptId => {
    const memo = new Map();
    listClosedMonths(after, aptId).forEach(month => {
      const missing = listMissing(month, computeMonth(after, month, memo));
      if (!missing.length) return;
      const base = `${root}months/${aptId}/${month.mk}`;
      extra[base] = { closed: false, closedAt: null, reopenedAt: now };
      reopened.push(`${monthName(month.mk)} (${missing.join(', ')})`);
    });
  });
  if (!reopened.length) return patch;
  toast(`Повернуто в роботу: ${reopened.join('; ')}`, { duration: 7000 });
  return mergeIntoPatch(patch, extra);
};

/*
 * Дописати поля місяця в латку так, щоб у ній не було шляху-предка й
 * нащадка разом: `update` Firebase відкидає такий запис цілком («path …
 * is ancestor of another path»). Імпорт пише місяць цілим обʼєктом
 * (`months/{кв}/{міс}`), і позначки повернення в роботу мусять лягти в
 * сам обʼєкт, а не поруч окремими шляхами.
 */
const mergeIntoPatch = (patch, monthFields) => {
  const next = { ...patch };
  Object.entries(monthFields).forEach(([base, fields]) => {
    const ancestor = Object.keys(next).find(key => base === key || base.startsWith(`${key}/`));
    if (ancestor) {
      const value = next[ancestor];
      if (!value || typeof value !== 'object') return;
      const copy = JSON.parse(JSON.stringify(value));
      const rest = base === ancestor ? [] : base.slice(ancestor.length + 1).split('/');
      let node = copy;
      rest.forEach(key => {
        if (!node[key] || typeof node[key] !== 'object') node[key] = {};
        node = node[key];
      });
      Object.entries(fields).forEach(([field, fieldValue]) => {
        if (fieldValue === null) delete node[field];
        else node[field] = fieldValue;
      });
      next[ancestor] = copy;
      return;
    }
    Object.entries(fields).forEach(([field, fieldValue]) => {
      next[`${base}/${field}`] = fieldValue;
    });
  });
  return next;
};

// ---------- екран ----------

export const UtilitiesManager = ({ ownerId, viewerId }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(() => readUtilitiesCache(ownerId) || {});
  const [loaded, setLoaded] = useState(() => Boolean(readUtilitiesCache(ownerId)));
  const [loadError, setLoadError] = useState('');
  const [selectedAptId, setSelectedAptId] = useState(() => readStorage(selectedAptKey(ownerId)) || '');
  const [openHistoryMk, setOpenHistoryMk] = useState('');
  const [editingMk, setEditingMk] = useState('');
  const [confirmDeleteMk, setConfirmDeleteMk] = useState('');
  const [localEdits, setLocalEdits] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  // План імпорту JSON, що чекає підтвердження (`planUtilitiesImport`).
  const [importPlan, setImportPlan] = useState(null);
  const [history, setHistory] = useState({ undo: [], redo: [] });
  const [textScale, setTextScale] = useState(() => {
    const saved = Number(readStorage(textScaleKey(ownerId)));
    return TEXT_SCALES.includes(saved) ? saved : 1;
  });
  const dataRef = useRef(data);
  dataRef.current = data;
  const localEditsRef = useRef(localEdits);
  localEditsRef.current = localEdits;

  // Писати може власник і двоє повних адмінів; інспектор чужу лише читає.
  const canWrite = Boolean(ownerId) && (!viewerId || viewerId === ownerId || ADMIN_UIDS.includes(viewerId));

  const reload = useCallback(async () => {
    if (!ownerId) return;
    try {
      const fresh = await fetchUtilitiesData(ownerId);
      const merged = overlayPendingUtilitiesWrites(fresh, ownerId, listPendingOutboxPatches());
      writeUtilitiesCache(ownerId, merged);
      setData(merged);
      setLoadError('');
    } catch (error) {
      console.error('Unable to load utilities', error);
      setLoadError(String(error?.message || '').includes('PERMISSION') ? 'Немає доступу до цих даних' : 'Не вдалося прочитати — показуємо збережене на пристрої');
    } finally {
      setLoaded(true);
    }
  }, [ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const pendingWrites = useSyncExternalStore(
    subscribeWriteOutbox,
    () => countPendingUtilitiesWrites(ownerId, listPendingOutboxPatches())
  );
  const prevPendingRef = useRef(pendingWrites);
  useEffect(() => {
    const prev = prevPendingRef.current;
    prevPendingRef.current = pendingWrites;
    if (prev > 0 && pendingWrites === 0) reload();
  }, [pendingWrites, reload]);

  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const apartments = useMemo(() => listApartments(data), [data]);
  const apartment = apartments.find(apt => apt.id === selectedAptId) || apartments[0] || null;
  const aptId = apartment?.id || '';

  useEffect(() => {
    if (aptId) writeStorage(selectedAptKey(ownerId), aptId);
  }, [aptId, ownerId]);

  // ---------- запис ----------

  const sendPatch = useCallback((rawPatch, label, { record = true } = {}) => {
    if (!canWrite || !rawPatch || !Object.keys(rawPatch).length) return;
    const before = dataRef.current;
    // Відміна й повтор повертають рівно те, що було; решта правок
    // перевіряє закриті місяці зачеплених квартир.
    const absolutePatch = record ? withReopenedIncompleteMonths(before, rawPatch, ownerId) : rawPatch;
    const inverse = buildInverseUtilitiesPatch(before, absolutePatch, ownerId);
    const next = applyUtilitiesPatch(before, absolutePatch, ownerId);
    dataRef.current = next;
    setData(next);
    writeUtilitiesCache(ownerId, next);
    if (record) {
      setHistory(prev => ({ undo: [...prev.undo, { label, patch: absolutePatch, inverse }].slice(-HISTORY_LIMIT), redo: [] }));
    }
    const { delivered } = enqueueUtilitiesPatch(ownerId, absolutePatch);
    delivered.catch(error => {
      console.error('Utilities write rejected', error);
      toast.error('База не прийняла запис — перечитуємо дані');
      reload();
    });
  }, [canWrite, ownerId, reload]);

  const root = utilitiesRootPath(ownerId);

  const writeMonth = useCallback((month, relPatch, label, clearKeys = []) => {
    const base = `${root}/months/${month.aptId}/${month.mk}`;
    const patch = {};
    // Перший запис у новий місяць заводить його в базі з датою.
    if (month.virtual && !dataRef.current?.months?.[month.aptId]?.[month.mk]) {
      patch[`${base}/date`] = month.date || todayIso();
      patch[`${base}/closed`] = false;
    }
    Object.entries(relPatch).forEach(([rel, value]) => {
      patch[`${base}/${pathToDb(rel)}`] = value === undefined ? null : value;
    });
    if (clearKeys.length) {
      setLocalEdits(prev => {
        const next = { ...prev };
        clearKeys.forEach(key => delete next[key]);
        return next;
      });
    }
    sendPatch(patch, label);
  }, [root, sendPatch]);

  const writeApartment = useCallback((relPatch, label) => {
    if (!aptId) return;
    const base = `${root}/apartments/${aptId}`;
    const patch = {};
    Object.entries(relPatch).forEach(([rel, value]) => {
      patch[`${base}/${pathToDb(rel)}`] = value === undefined ? null : value;
    });
    sendPatch(patch, label);
  }, [aptId, root, sendPatch]);

  const handleEdit = useCallback((key, value) => {
    setLocalEdits(prev => ({ ...prev, [key]: value }));
  }, []);

  const commitField = useCallback((month, relPath, key, { text = false } = {}) => {
    const edits = localEditsRef.current;
    if (!Object.prototype.hasOwnProperty.call(edits, key)) return;
    const raw = String(edits[key] ?? '');
    const value = raw.trim() === '' ? null : (text ? raw.trim() : raw.trim());
    const stored = getPath(month, relPath);
    setLocalEdits(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if ((stored ?? null) === value || String(stored ?? '') === String(value ?? '')) return;
    writeMonth(month, { [relPath]: value }, 'Правка');
  }, [writeMonth]);

  // Незбережене поле не губиться, коли вкладку закривають просто з поля.
  useEffect(() => {
    const flush = () => {
      if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const historyRef = useRef(history);
  historyRef.current = history;
  // Запис іде поза оновлювачем стану: у режимі розробки React кличе
  // оновлювач двічі, і відміна пішла б у базу двома записами.
  const stepHistory = useCallback(direction => {
    const prev = historyRef.current;
    const from = direction === 'undo' ? prev.undo : prev.redo;
    const step = from[from.length - 1];
    if (!step) return;
    const next = direction === 'undo'
      ? { undo: prev.undo.slice(0, -1), redo: [...prev.redo, step] }
      : { undo: [...prev.undo, step], redo: prev.redo.slice(0, -1) };
    historyRef.current = next;
    setHistory(next);
    // Відміна пише в базу тією самою чергою — і без звʼязку теж.
    sendPatch(direction === 'undo' ? step.inverse : step.patch, step.label, { record: false });
    toast(`${direction === 'undo' ? 'Відмінено' : 'Повторено'}: ${step.label}`, { position: 'bottom-center' });
  }, [sendPatch]);

  useEffect(() => {
    if (!canWrite) return undefined;
    const handler = event => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        stepHistory(event.shiftKey ? 'redo' : 'undo');
      } else if (key === 'y') {
        event.preventDefault();
        stepHistory('redo');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canWrite, stepHistory]);

  const changeTextScale = next => {
    setTextScale(next);
    writeStorage(textScaleKey(ownerId), String(next));
  };

  // ---------- дії ----------

  const addApartment = () => {
    const id = newId('a');
    const order = apartments.reduce((max, apt) => Math.max(max, Number(apt.order) || 0), 0) + 1;
    sendPatch({ [`${root}/apartments/${id}`]: buildNewApartment({ name: `Квартира ${apartments.length + 1}`, order }) }, 'Додано квартиру');
    setSelectedAptId(id);
    setSettingsOpen(true);
  };

  const deleteApartment = () => {
    if (!aptId) return;
    const name = apartment?.name || 'квартиру';
    sendPatch({ [`${root}/apartments/${aptId}`]: null, [`${root}/months/${aptId}`]: null }, `Видалено ${name}`);
    setSelectedAptId('');
    setSettingsOpen(false);
  };

  const closeMonth = month => {
    writeMonth(month, { closed: true, closedAt: Date.now(), reopenedAt: null, ...(month.virtual ? { date: month.date } : {}) }, `Закрито ${monthName(month.mk)}`);
    setOpenHistoryMk('');
    toast.success(`${capitalize(monthName(month.mk))} закрито`);
  };

  const deleteMonth = month => {
    sendPatch({ [`${root}/months/${month.aptId}/${month.mk}`]: null }, `Видалено ${monthName(month.mk)}`);
    setConfirmDeleteMk('');
    setEditingMk('');
    setOpenHistoryMk('');
  };

  const copyText = text => {
    try {
      navigator.clipboard.writeText(text).then(
        () => toast.success('Скопійовано — можна вставити в Telegram'),
        () => toast.error('Не вдалося — виділіть текст і скопіюйте')
      );
    } catch {
      toast.error('Не вдалося — виділіть текст і скопіюйте');
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { exportUtilitiesToExcel } = await import('utils/utilitiesExport');
      const files = await exportUtilitiesToExcel(dataRef.current);
      toast.success(files.length === 1 ? 'Збережено 1 книгу Excel' : `Збережено книг Excel: ${files.length}`);
    } catch (error) {
      console.error('Utilities export failed', error);
      toast.error('Не вдалося зібрати файл Excel');
    } finally {
      setExporting(false);
    }
  };

  const readImportFile = async file => {
    try {
      const text = await file.text();
      const plan = planUtilitiesImport(text, dataRef.current);
      if (plan.error) {
        toast.error(plan.error);
        return;
      }
      // Шторка налаштувань закривається: вікно підтвердження лягало під неї
      // (той самий шар), і текст плану просвічував крізь зразок файлу.
      setSettingsOpen(false);
      setImportPlan({ ...plan, fileName: file.name });
    } catch (error) {
      console.error('Utilities import read failed', error);
      toast.error('Не вдалося прочитати файл');
    }
  };

  const applyImport = () => {
    if (!importPlan) return;
    const patch = Object.fromEntries(Object.entries(importPlan.patch).map(([rel, value]) => [`${root}/${rel}`, value]));
    sendPatch(patch, `Імпорт ${importPlan.fileName || 'JSON'}`);
    const first = importPlan.summary[0];
    if (first) setSelectedAptId(first.aptId);
    const months = importPlan.summary.reduce((sum, item) => sum + item.monthCount, 0);
    toast.success(`Імпортовано: квартир ${importPlan.summary.length}, місяців ${months}`);
    setImportPlan(null);
  };

  const handleExit = async () => {
    clearUtilitiesCache();
    await signOut(auth);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('ownerId');
    navigate('/');
  };

  const dotsMenu = () => {
    const access = resolveAccess({
      uid: viewerId || ownerId,
      accessLevel: readStoredAccessLevel(),
      userRole: readStorage('userRole') || '',
      canCreateProfiles: readStoredCanCreateProfiles(),
    });
    return <ProfileDotsMenu navigate={navigate} isAdmin={access.isAdmin} access={access} onExit={handleExit} onSelect={() => setShowMenu(false)} />;
  };

  // ---------- розкладка ----------

  const closed = aptId ? listClosedMonths(data, aptId) : [];
  const lastClosed = closed[closed.length - 1] || null;
  const lastComputed = lastClosed ? computeMonth(data, lastClosed) : null;
  // Відкритий місяць учасника бачить і той, хто лише читає (інспектор), — але
  // порожній наступний місяць пропонується лише тому, хто пише.
  const resolvedOpen = aptId ? resolveOpenMonth(data, aptId) : null;
  const openMonth = resolvedOpen && (canWrite || !resolvedOpen.virtual) ? resolvedOpen : null;
  const memo = new Map();

  return (
    <Wrap data-testid="utilities-page">
      <TopBar>
        {/* Розмір тексту — у ⚙: шість кнопок разом із назвою не влазили в
            рядок на 390 px, і «⋮» ховався за краєм екрана. */}
        <Title>Комуналка</Title>
        <TopSpacer />
        {canWrite && (
          <>
            <IconBtn
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => stepHistory('undo')}
              disabled={!history.undo.length}
              aria-label="Назад"
              title={history.undo.length ? `Назад: ${history.undo[history.undo.length - 1].label} (Ctrl+Z)` : 'Нічого відміняти'}
              data-testid="utilities-undo"
            >
              <FiCornerUpLeft />
            </IconBtn>
            <IconBtn
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => stepHistory('redo')}
              disabled={!history.redo.length}
              aria-label="Вперед"
              title={history.redo.length ? `Вперед: ${history.redo[history.redo.length - 1].label} (Ctrl+Y)` : 'Нічого повторювати'}
              data-testid="utilities-redo"
            >
              <FiCornerUpRight />
            </IconBtn>
          </>
        )}
        <IconBtn type="button" onClick={() => setSettingsOpen(true)} aria-label="Налаштування квартири" title="Налаштування квартири" data-testid="utilities-settings-open">
          <FiSettings />
        </IconBtn>
        <IconBtn type="button" aria-label="Відкрити меню" title="Відкрити меню" onClick={() => setShowMenu('dotsMenu')}>⋮</IconBtn>
      </TopBar>

      <ScaledContent style={{ zoom: textScale }}>
        {!online && pendingWrites > 0 && (
          <OfflineNote data-testid="utilities-pending">Немає звʼязку — ще не надіслано: {pendingWrites}. Записи збережено на пристрої й надішлемо, щойно звʼязок повернеться.</OfflineNote>
        )}
        {loadError && <OfflineNote>{loadError}</OfflineNote>}

        {apartments.length > 0 && (
          <AptChips role="group" aria-label="Квартири">
            {apartments.map(apt => {
              const months = listClosedMonths(data, apt.id);
              const last = months[months.length - 1];
              const result = last ? computeMonth(data, last, memo).result : null;
              return (
                <AptChip
                  key={apt.id}
                  type="button"
                  $selected={apt.id === aptId}
                  aria-pressed={apt.id === aptId}
                  onClick={() => {
                    setSelectedAptId(apt.id);
                    setOpenHistoryMk('');
                    setEditingMk('');
                  }}
                  data-testid={`utilities-apartment-${apt.id}`}
                >
                  {apt.name}
                  {result !== null && <small>{formatSigned(result)}</small>}
                </AptChip>
              );
            })}
            {canWrite && <AptChip type="button" $add onClick={addApartment} data-testid="utilities-add-apartment">+ Квартира</AptChip>}
          </AptChips>
        )}

        {!apartments.length && loaded && (
          <Card data-testid="utilities-empty">
            <b>Ще немає жодної квартири</b>
            <Hint>Додайте квартиру — у ній уже будуть світло (день і ніч), вода, ЖЕК та інтернет. Свої блоки й початкові показники — у налаштуваннях.</Hint>
            {canWrite && <PrimaryBtn type="button" onClick={addApartment} data-testid="utilities-add-first">+ Додати квартиру</PrimaryBtn>}
          </Card>
        )}
        {!apartments.length && !loaded && <Hint>Завантажуємо…</Hint>}

        {lastComputed && (
          <Card aria-live="polite" data-testid="utilities-summary">
            <SummaryKicker>{apartment.name} · останній закритий місяць — {monthName(lastClosed.mk)}</SummaryKicker>
            <SummaryBig $negative={lastComputed.result < 0}>{formatSigned(lastComputed.result)} ₴</SummaryBig>
            <div style={{ fontSize: 14 }}>
              {lastComputed.result >= 0 ? 'Переплата' : 'Борг'} — у {MONTHS_LOC[monthIndex(nextMonthKey(lastClosed.mk))]} перенести в бюджет або врахувати з платежу {paymentDateLabel(apartment, lastClosed.mk)}
            </div>
            <Trio>
              <div><span>Бюджет</span><b>{formatMoney(lastComputed.available)}</b></div>
              <div><span>Комуналка</span><b>{formatMoney(lastComputed.cost)}</b></div>
              <div><span>Коригування</span><b>{lastComputed.adjustment ? formatSigned(lastComputed.adjustment) : '—'}</b></div>
            </Trio>
          </Card>
        )}

        {openMonth && (
          <MonthEditor
            key={`${aptId}-${openMonth.mk}`}
            data={data}
            apartment={apartment}
            month={openMonth}
            editable={canWrite}
            isOpenMonth
            localEdits={localEdits}
            onEdit={handleEdit}
            onCommitField={commitField}
            onWrite={writeMonth}
            onCopy={copyText}
            onClose={closeMonth}
            canWrite={canWrite}
          />
        )}

        {closed.length > 0 && <HistoryTitle>Закриті місяці · {closed.length}</HistoryTitle>}
        {closed.slice().reverse().map(month => {
          const computed = computeMonth(data, month, memo);
          const open = openHistoryMk === month.mk;
          const editable = canWrite && editingMk === month.mk;
          return (
            <MonthCard key={month.mk}>
              <MonthHead
                type="button"
                aria-expanded={open}
                data-testid={`utilities-history-${month.mk}`}
                onClick={() => {
                  setOpenHistoryMk(open ? '' : month.mk);
                  setEditingMk('');
                  setConfirmDeleteMk('');
                }}
              >
                <strong>{capitalize(monthName(month.mk))}</strong>
                <small>
                  {month.date ? `показники ${formatDmy(month.date)}` : 'дата зняття не вказана'} · платіж {paymentDateLabel(apartment, month.mk)}
                  {month.carry === true ? ' · залишок перенесено' : ''}
                </small>
                <MonthResult $negative={computed.result < 0}>
                  {formatSigned(computed.result)}
                  <small>{computed.result >= 0 ? 'переплата' : 'борг'}</small>
                </MonthResult>
              </MonthHead>
              <Collapsible open={open}>
                {open && (
                  <MonthEditor
                    data={data}
                    apartment={apartment}
                    month={month}
                    editable={editable}
                    isOpenMonth={false}
                    localEdits={localEdits}
                    onEdit={handleEdit}
                    onCommitField={commitField}
                    onWrite={writeMonth}
                    onCopy={copyText}
                    onToggleEdit={m => setEditingMk(editingMk === m.mk ? '' : m.mk)}
                    onDelete={m => setConfirmDeleteMk(m.mk)}
                    confirmingDelete={confirmDeleteMk === month.mk}
                    onCancelDelete={() => setConfirmDeleteMk('')}
                    onConfirmDelete={deleteMonth}
                    canWrite={canWrite}
                  />
                )}
              </Collapsible>
            </MonthCard>
          );
        })}
      </ScaledContent>

      {settingsOpen && (
        <SettingsSheet
          data={data}
          apartment={apartment}
          currentMk={resolvedOpen?.mk}
          canWrite={canWrite}
          onWriteApartment={writeApartment}
          onAddApartment={addApartment}
          onDeleteApartment={deleteApartment}
          onExport={exportExcel}
          exporting={exporting}
          onImportFile={readImportFile}
          textScale={textScale}
          onTextScale={changeTextScale}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {importPlan && (
        <Backdrop $center style={{ zIndex: 1300 }} onClick={() => setImportPlan(null)}>
          <Dialog role="dialog" aria-label="Імпорт з JSON" onClick={e => e.stopPropagation()} data-testid="utilities-import-dialog">
            <h2>Імпортувати {importPlan.fileName || 'файл'}?</h2>
            <DialogText>
              {importPlan.summary.map(item => (
                <span key={item.aptId}>
                  <b>{item.name}</b>{item.isNew ? ' — нова квартира' : ''}: місяців {item.monthCount}
                  {item.replaced.length ? ` (замінять наявні: ${item.replaced.map(monthName).join(', ')})` : ''}
                </span>
              ))}
              {importPlan.warnings.length > 0 && (
                <span style={{ color: 'var(--km-danger, #b42318)' }}>
                  Пропущено: {importPlan.warnings.slice(0, 6).join('; ')}{importPlan.warnings.length > 6 ? ` і ще ${importPlan.warnings.length - 6}` : ''}
                </span>
              )}
              <span>Відмінити можна кнопкою «Назад» угорі.</span>
            </DialogText>
            <DialogActions>
              <GhostBtn type="button" onClick={() => setImportPlan(null)}>Скасувати</GhostBtn>
              <PrimaryBtn type="button" onClick={applyImport} data-testid="utilities-import-confirm">Імпортувати</PrimaryBtn>
            </DialogActions>
          </Dialog>
        </Backdrop>
      )}
      {showMenu && <InfoModal onClose={() => setShowMenu(false)} text={showMenu} Context={dotsMenu} />}
    </Wrap>
  );
};

/*
 * Комуналка адміна з вибором учасника — як Flow (`FlowScreen`): адмін обирає
 * того, у кого комуналка заповнена, і бачить та править саме її. Поки обрано
 * учасника, своя комуналка адміна не показується й не пишеться: менеджер
 * монтується наново з ключем власника. Вибір не памʼятається — відкриття
 * завжди починається зі своєї.
 */
const UtilitiesScreen = ({ ownerId: viewerId }) => {
  const isAdmin = isAdminUid(viewerId);
  const [owners, setOwners] = useState([]);
  const [ownersError, setOwnersError] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');

  useEffect(() => {
    if (!isAdmin || !viewerId) return undefined;
    let cancelled = false;
    listUtilitiesOwners({ excludeUid: viewerId })
      .then(list => { if (!cancelled) setOwners(list); })
      .catch(error => {
        console.error('Unable to list utilities owners', error);
        if (!cancelled) setOwnersError('Не вдалося прочитати, у кого є комуналка');
      });
    return () => { cancelled = true; };
  }, [isAdmin, viewerId]);

  const shownOwnerId = isAdmin && selectedOwnerId ? selectedOwnerId : viewerId;
  const selectedOwner = owners.find(owner => owner.uid === selectedOwnerId);

  return (
    <>
      {isAdmin && (owners.length > 0 || ownersError || selectedOwnerId) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 720, margin: '0 auto', padding: '10px 12px 0', boxSizing: 'border-box' }}>
          <select
            aria-label="Чию комуналку показати"
            value={selectedOwnerId}
            onChange={e => setSelectedOwnerId(e.target.value)}
            data-testid="utilities-owner-select"
            style={{ width: '100%', minHeight: 38, padding: '6px 10px', border: '1px solid var(--km-border, #d7d7d7)', borderRadius: 10, background: 'var(--km-card, #fff)', color: 'var(--km-text, #222)', font: 'inherit', fontSize: 14 }}
          >
            <option value="">Моя комуналка</option>
            {owners.map(owner => <option key={owner.uid} value={owner.uid}>{owner.name || owner.uid}</option>)}
          </select>
          {ownersError && <small>{ownersError}</small>}
          {selectedOwnerId && (
            <div data-testid="utilities-owner-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--km-accent-light, #fdf0e4)', fontSize: 13, fontWeight: 600 }}>
              <span>Ви правите комуналку учасника: {selectedOwner?.name || selectedOwnerId}</span>
              <GhostBtn type="button" style={{ minHeight: 30 }} onClick={() => setSelectedOwnerId('')}>До своєї</GhostBtn>
            </div>
          )}
        </div>
      )}
      <UtilitiesManager key={shownOwnerId || 'none'} ownerId={shownOwnerId} viewerId={viewerId} />
    </>
  );
};

export default UtilitiesScreen;
