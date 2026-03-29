import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import {
  clearFlowData,
  fetchFlowData,
  saveFlowEntry,
  updateFlowEntry,
} from './config';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-end;
`;

const Label = styled.label`
  font-size: 13px;
  color: #444;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
`;

const Input = styled.input`
  width: 100%;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
`;

const ActionBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fafafa;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
`;

const RadioGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
`;

const RadioLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
  cursor: pointer;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid #ececec;
  margin: 4px 0;
`;

const FooterActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const MultilineInput = styled.textarea`
  width: 100%;
  min-height: 140px;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
  resize: vertical;
`;

const EventsList = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: #666;
  line-height: 1.4;
`;

const EventRow = styled.li`
  margin-bottom: 4px;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
`;

const TinyBtn = styled.button`
  margin-left: 6px;
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid #d7d7d7;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
`;

const normalizeCategoryPath = value =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/]+/g, '');

const formatDisplayDate = yyyyMmDd => {
  const [year, month, day] = String(yyyyMmDd || '').split('-');
  if (!year || !month || !day) return '';
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
};

const parseDisplayDate = (display, fallbackYear = new Date().getFullYear()) => {
  const match = String(display || '')
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3] || fallbackYear);
  if (day < 1 || day > 31 || month < 1 || month > 12) return '';
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return '';
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const todayYmd = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseFlowEntryLine = (line, fallbackDate = '') => {
  const match = String(line || '')
    .trim()
    .match(/^(?:(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s+)?([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return null;

  const fallbackYear = Number(String(fallbackDate).split('-')[0]) || new Date().getFullYear();
  const parsedDate = match[1] ? parseDisplayDate(match[1], fallbackYear) : fallbackDate;
  const parsedAmount = sanitizeEntryKeyChunk(String(match[2] || '').replace(',', '.'));
  const parsedDescription = sanitizeEntryKeyChunk(match[3] || '');

  if (!parsedDate || !parsedAmount) return null;
  return {
    date: parsedDate,
    amount: parsedAmount,
    description: parsedDescription,
  };
};

const sanitizeEntryKeyChunk = value =>
  String(value || '')
    .trim()
    .replace(/[.#$[\]/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DEFAULT_FLOW_CATEGORY = 'general';
const flowDraftStorageKey = ownerId => `flow-draft:${ownerId || 'anon'}`;

const flattenEntries = (node, path = []) => {
  if (!node || typeof node !== 'object') return [];

  const isDateNode = Object.keys(node).some(key => /^\d{4}-\d{2}-\d{2}$/.test(key));
  if (isDateNode) {
    return Object.entries(node).flatMap(([date, entries]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entries || typeof entries !== 'object') {
        return [];
      }
      return Object.entries(entries).map(([entryId, value]) => {
        const encoded = typeof value === 'string' ? value : entryId;
        const [amount = '', ...rest] = String(encoded).split('_');
        return {
          entryId,
          group: path.join('/'),
          date,
          amount,
          description: rest.join('_'),
        };
      });
    });
  }

  return Object.entries(node).flatMap(([nextKey, child]) => flattenEntries(child, [...path, nextKey]));
};

const sortRowsByDate = rows =>
  [...rows].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

const sortRowsByGroupAndDate = rows =>
  [...rows].sort((a, b) => {
    const groupCompare = String(a.group || '').localeCompare(String(b.group || ''));
    if (groupCompare !== 0) return groupCompare;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });

export const FlowManager = ({ ownerId }) => {
  const [flowData, setFlowData] = useState({});
  const [dateYmd, setDateYmd] = useState(todayYmd());
  const [entryInput, setEntryInput] = useState(`${formatDisplayDate(todayYmd())} `);
  const [categoryInput, setCategoryInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [localCategories, setLocalCategories] = useState([DEFAULT_FLOW_CATEGORY]);
  const [importInput, setImportInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ line: '' });
  const entryInputRef = useRef(null);
  const categoryInputRef = useRef(null);

  const categoriesFromDb = useMemo(() => Object.keys(flowData || {}), [flowData]);

  const allCategories = useMemo(() => {
    const merged = [...localCategories, ...categoriesFromDb]
      .map(normalizeCategoryPath)
      .filter(Boolean);
    const unique = [...new Set(merged)];
    return unique.sort((a, b) => {
      if (a === DEFAULT_FLOW_CATEGORY) return -1;
      if (b === DEFAULT_FLOW_CATEGORY) return 1;
      return a.localeCompare(b);
    });
  }, [categoriesFromDb, localCategories]);

  const flowRows = useMemo(() => flattenEntries(flowData), [flowData]);
  const sortedFlowRows = useMemo(() => sortRowsByGroupAndDate(flowRows), [flowRows]);

  const reload = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const data = await fetchFlowData(ownerId);
      setFlowData(data || {});
    } catch (error) {
      console.error('Unable to load flow data', error);
      toast.error('Не вдалося завантажити Flow');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      const raw = localStorage.getItem(flowDraftStorageKey(ownerId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.dateYmd) setDateYmd(parsed.dateYmd);
        if (typeof parsed.entryInput === 'string') {
          setEntryInput(parsed.entryInput);
        } else {
          const restoredDate = parsed.dateYmd ? formatDisplayDate(parsed.dateYmd) : formatDisplayDate(todayYmd());
          const restoredAmount = typeof parsed.amount === 'string' ? parsed.amount : '';
          const restoredDescription = typeof parsed.description === 'string' ? parsed.description : '';
          setEntryInput(`${restoredDate} ${restoredAmount} ${restoredDescription}`.trim());
        }
        if (parsed.selectedCategory) setSelectedCategory(normalizeCategoryPath(parsed.selectedCategory));
        if (Array.isArray(parsed.localCategories)) {
          setLocalCategories(prev => {
            const merged = [...prev, ...parsed.localCategories.map(normalizeCategoryPath).filter(Boolean)];
            return [...new Set(merged)];
          });
        }
      }
    } catch (error) {
      console.error('Unable to restore flow draft from localStorage', error);
    }
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      localStorage.setItem(
        flowDraftStorageKey(ownerId),
        JSON.stringify({
          dateYmd,
          entryInput,
          selectedCategory,
          localCategories,
        })
      );
    } catch (error) {
      console.error('Unable to persist flow draft into localStorage', error);
    }
  }, [dateYmd, entryInput, localCategories, ownerId, selectedCategory]);

  useEffect(() => {
    if (allCategories.length > 0 && (!selectedCategory || !allCategories.includes(selectedCategory))) {
      setSelectedCategory(allCategories[0]);
    }
  }, [allCategories, selectedCategory]);

  const addCategory = () => {
    const normalized = normalizeCategoryPath(categoryInput);
    if (!normalized) return;
    setLocalCategories(prev => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setSelectedCategory(normalized);
    setCategoryInput('');
  };

  const handleSave = async ({ silentValidation = false } = {}) => {
    const normalizedCategory = normalizeCategoryPath(selectedCategory);
    const parsedEntry = parseFlowEntryLine(entryInput, dateYmd);
    const amountClean = parsedEntry?.amount || '';
    const descriptionClean = parsedEntry?.description || '';
    const dateToSave = parsedEntry?.date || '';

    if (!ownerId || !normalizedCategory || !dateToSave || !amountClean) {
      if (!silentValidation) {
        toast.error('Заповніть дату, суму та групу');
      }
      return;
    }

    try {
      await saveFlowEntry({
        ownerId,
        groupPath: normalizedCategory,
        date: dateToSave,
        amount: amountClean,
        description: descriptionClean,
      });
      setDateYmd(dateToSave);
      setEntryInput(`${formatDisplayDate(dateToSave)} ${amountClean} ${descriptionClean}`.trim());
      toast.success('Flow збережено');
      await reload();
    } catch (error) {
      console.error('Unable to save flow entry', error);
      toast.error('Не вдалося зберегти Flow');
    }
  };

  const handleCopyToClipboard = async () => {
    if (flowRows.length === 0) {
      toast.error('Немає даних для копіювання');
      return;
    }

    const grouped = flowRows.reduce((acc, row) => {
      const key = row.group || 'general';
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const tableText = Object.entries(grouped)
      .map(([group, rows]) => {
        const lines = sortRowsByDate(rows).map(row => {
          const displayDate = formatDisplayDate(row.date);
          return `${displayDate} ${row.amount} ${row.description}`.trim();
        });
        return [`[${group}]`, ...lines].join('\n');
      })
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(tableText);
      toast.success('Скопійовано в буфер обміну');
    } catch (error) {
      console.error('Unable to copy flow data to clipboard', error);
      toast.error('Не вдалося скопіювати дані');
    }
  };

  const handleClear = async () => {
    if (!ownerId) return;
    try {
      await clearFlowData(ownerId);
      setFlowData({});
      toast.success('Flow очищено');
    } catch (error) {
      console.error('Unable to clear flow', error);
      toast.error('Не вдалося очистити Flow');
    }
  };

  const handleImportList = async () => {
    if (!ownerId) return;
    const raw = String(importInput || '').trim();
    if (!raw) {
      toast.error('Вставте список для імпорту');
      return;
    }

    const lines = raw.split(/\r?\n/);
    let currentGroup = normalizeCategoryPath(selectedCategory) || 'general';
    const parsedEntries = [];

    lines.forEach(lineRaw => {
      const line = String(lineRaw || '').trim();
      if (!line) return;

      const groupMatch = line.match(/^\[(.+)]$/);
      if (groupMatch) {
        currentGroup = normalizeCategoryPath(groupMatch[1]) || currentGroup || 'general';
        return;
      }

      const match = line.match(/^(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s+([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/);
      if (!match) {
        const parsedCategory = normalizeCategoryPath(line);
        if (parsedCategory) currentGroup = parsedCategory;
        return;
      }

      const parsedDate = parseDisplayDate(match[1], new Date().getFullYear());
      if (!parsedDate) return;

      parsedEntries.push({
        groupPath: currentGroup || 'general',
        date: parsedDate,
        amount: match[2].replace(',', '.'),
        description: match[3] || '',
      });
    });

    if (parsedEntries.length === 0) {
      toast.error('Не знайдено валідних рядків (формат: дд.мм або дд.мм.рррр 100 опис; категорія — окремий рядок)');
      return;
    }

    try {
      await Promise.all(parsedEntries.map(entry => saveFlowEntry({ ownerId, ...entry })));
      toast.success(`Імпортовано ${parsedEntries.length} записів`);
      setImportInput('');
      await reload();
    } catch (error) {
      console.error('Unable to import flow entries', error);
      toast.error('Не вдалося імпортувати список');
    }
  };

  const getRowKey = (row, idx) =>
    `${row.group || 'general'}|${row.date}|${row.entryId || `${row.amount}|${row.description}|${idx}`}`;

  const beginEdit = (row, idx) => {
    const key = getRowKey(row, idx);
    setEditingKey(key);
    setEditingDraft({
      line: `${formatDisplayDate(row.date)} ${row.amount} ${row.description}`.trim(),
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingDraft({ line: '' });
  };

  const saveEditedRow = async (row, idx) => {
    if (!ownerId) return;
    const rowKey = getRowKey(row, idx);
    if (editingKey !== rowKey) return;

    const match = String(editingDraft.line || '')
      .trim()
      .match(/^(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s+([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!match) {
      toast.error('Формат редагування: дд.мм або дд.мм.рррр 100 опис');
      return;
    }
    const parsedDate = parseDisplayDate(match[1], new Date().getFullYear());
    const nextAmount = sanitizeEntryKeyChunk(match[2].replace(',', '.'));
    const nextDescription = sanitizeEntryKeyChunk(match[3] || '');
    if (!parsedDate || !nextAmount) {
      toast.error('Для редагування потрібні валідні дата і сума');
      return;
    }

    try {
      await updateFlowEntry({
        ownerId,
        groupPath: row.group || 'general',
        prevEntry: {
          entryId: row.entryId,
          date: row.date,
          amount: row.amount,
          description: row.description,
        },
        nextEntry: {
          date: parsedDate,
          amount: nextAmount,
          description: nextDescription,
        },
      });
      toast.success('Запис оновлено');
      cancelEdit();
      await reload();
    } catch (error) {
      console.error('Unable to update flow row', error);
      toast.error('Не вдалося оновити запис');
    }
  };

  return (
    <Wrap>
      <Row>
        <Label>
          Нова група
          <Input
            ref={categoryInputRef}
            value={categoryInput}
            onChange={e => {
              setCategoryInput(e.target.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCategory();
              }
            }}
            placeholder="напр. Тест1"
          />
        </Label>
        <ActionBtn type="button" onClick={addCategory}>+</ActionBtn>
      </Row>

      <Label as="div">
        Група витрат
        <RadioGroup>
          {allCategories.map(category => (
            <RadioLabel key={category}>
              <input
                type="radio"
                name="flow-category"
                value={category}
                checked={selectedCategory === category}
                onChange={e => setSelectedCategory(normalizeCategoryPath(e.target.value))}
              />
              {category}
            </RadioLabel>
          ))}
        </RadioGroup>
      </Label>

      <Divider />

      <Row>
        <Label>
          Дата + сума + опис
          <Input
            ref={entryInputRef}
            value={entryInput}
            onChange={e => {
              const nextValue = e.target.value;
              setEntryInput(nextValue);
              const parsed = parseFlowEntryLine(nextValue, dateYmd);
              if (parsed?.date) setDateYmd(parsed.date);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
                categoryInputRef.current?.focus();
              }
            }}
            onBlur={() => {
              handleSave({ silentValidation: true });
            }}
            placeholder="дд.мм 100 Кава"
          />
        </Label>
      </Row>

      <FooterActions>
        <ActionBtn type="button" onClick={handleCopyToClipboard}>Копіювати</ActionBtn>
        <ActionBtn type="button" onClick={handleClear}>Очистити Flow</ActionBtn>
      </FooterActions>

      <Label>
        Імпорт списку (категорія окремим рядком, далі `дд.мм або дд.мм.рррр 100 опис`)
        <MultilineInput
          value={importInput}
          onChange={e => setImportInput(e.target.value)}
          placeholder={'їжа\n29.03 100 Кава\n29.03 240 Обід\n\nтранспорт таксі\n29.03 340 Таксі'}
        />
      </Label>
      <ActionBtn type="button" onClick={handleImportList}>Імпортувати список</ActionBtn>

      <small>Події з бекенду (відсортовано по групі і даті):</small>
      <EventsList>
        {sortedFlowRows.map((row, idx) => {
          const rowKey = getRowKey(row, idx);
          const isEditing = editingKey === rowKey;
          return (
            <EventRow
              key={rowKey}
              $clickable={!isEditing}
              onClick={!isEditing ? () => beginEdit(row, idx) : undefined}
            >
              [{row.group}]
              {isEditing ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {' '}
                  <Input
                    autoFocus
                    style={{ width: 320, fontSize: 12, padding: 4, marginLeft: 4 }}
                    value={editingDraft.line}
                    onChange={e => setEditingDraft({ line: e.target.value })}
                    onBlur={() => saveEditedRow(row, idx)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEditedRow(row, idx);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                  />
                  <TinyBtn type="button" onMouseDown={e => e.preventDefault()} onClick={cancelEdit}>
                    cancel
                  </TinyBtn>
                </span>
              ) : (
                <>
                  {' '}
                  {formatDisplayDate(row.date)} {row.amount} {row.description}
                </>
              )}
            </EventRow>
          );
        })}
      </EventsList>

      {loading && <small>Завантаження...</small>}
    </Wrap>
  );
};

export default FlowManager;
