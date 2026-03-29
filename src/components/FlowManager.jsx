import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ReactComponent as ClipboardIcon } from 'assets/icons/clipboard.svg';
import {
  deleteFlowEntry,
  clearFlowData,
  fetchFlowData,
  saveFlowEntry,
  updateFlowEntry,
} from './config';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
`;

const TopControls = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const MenuWrap = styled.div`
  position: relative;
`;

const TopActionBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  width: 34px;
  height: 34px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: ${({ $bg }) => $bg || '#6c757d'};
  border-color: ${({ $bg }) => $bg || '#6c757d'};
  cursor: pointer;

  &:hover {
    filter: brightness(0.92);
  }
`;

const CopyBtn = styled(TopActionBtn)`
  svg {
    width: 17px;
    height: 17px;
  }
`;

const DangerBtn = styled(TopActionBtn)``;

const MenuBtn = styled(TopActionBtn)``;

const MenuPanel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 180px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 2;
  padding: 6px;
`;

const MenuItem = styled.button`
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;

  &:hover {
    background: #f4f6ff;
  }
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 13px;
  color: #444;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const Input = styled.input`
  width: 100%;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
`;

const EntryInput = styled.textarea`
  width: 100%;
  min-height: 88px;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
  resize: vertical;
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
  min-width: 0;
`;

const RadioLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
  cursor: pointer;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid #ececec;
  margin: 4px 0;
`;

const EventsList = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: #666;
  line-height: 1.4;
  text-align: left;
`;

const GroupBlock = styled.li`
  list-style: none;
  margin-bottom: 10px;
`;

const GroupTitle = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const GroupRows = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 2px solid #e5e5e5;
  padding-left: 8px;
  min-width: 0;
`;

const EventRow = styled.li`
  margin-bottom: 5px;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  border: 1px solid ${({ $highlighted }) => ($highlighted ? '#ff6b6b' : 'transparent')};
  border-radius: 6px;
  padding: 2px 4px;
  background: ${({ $highlighted }) => ($highlighted ? '#fff5f5' : 'transparent')};
`;

const EventText = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const DeleteRowBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  width: 18px;
  height: 18px;
  cursor: pointer;
  color: #a00;
  background: #fff;

  &:hover {
    background: #ffecec;
  }
`;

const TinyBtn = styled.button`
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid #d7d7d7;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
`;

const EditInline = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
`;

const ConfirmBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ConfirmCard = styled.div`
  width: min(360px, calc(100vw - 24px));
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
`;

const ConfirmActions = styled.div`
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const ConfirmRowPreview = styled.div`
  margin-top: 10px;
  border: 1px solid #ff6b6b;
  border-radius: 6px;
  padding: 6px 8px;
  background: #fff5f5;
  font-size: 13px;
  overflow-wrap: anywhere;
  word-break: break-word;
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

export const parseFlowEntryLine = (line, fallbackDate = '') => {
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

export const parseFlowEntriesByDatesAndGroups = ({
  rawText,
  fallbackDate = '',
  defaultGroup = DEFAULT_FLOW_CATEGORY,
}) => {
  const resolvedFallbackDate = fallbackDate || todayYmd();
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);
  const fallbackYear =
    Number(String(resolvedFallbackDate).split('-')[0]) || new Date().getFullYear();
  let currentGroup = normalizeCategoryPath(defaultGroup) || DEFAULT_FLOW_CATEGORY;
  let currentDate = resolvedFallbackDate;
  const entries = [];

  lines.forEach(line => {
    const groupMatch = line.match(/^\[(.+)]$/);
    if (groupMatch) {
      currentGroup = normalizeCategoryPath(groupMatch[1]) || currentGroup || DEFAULT_FLOW_CATEGORY;
      return;
    }

    const parsedLine = parseFlowEntryLine(line, currentDate || resolvedFallbackDate);
    if (parsedLine) {
      currentDate = parsedLine.date;
      entries.push({
        groupPath: currentGroup || DEFAULT_FLOW_CATEGORY,
        ...parsedLine,
      });
      return;
    }

    const parsedDate = parseDisplayDate(line, fallbackYear);
    if (parsedDate) {
      currentDate = parsedDate;
      return;
    }

    const parsedCategory = normalizeCategoryPath(line);
    if (parsedCategory) {
      currentGroup = parsedCategory;
    }
  });

  return entries;
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
  const navigate = useNavigate();
  const [flowData, setFlowData] = useState({});
  const [dateYmd, setDateYmd] = useState(todayYmd());
  const [entryInput, setEntryInput] = useState(`${formatDisplayDate(todayYmd())} `);
  const [categoryInput, setCategoryInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [localCategories, setLocalCategories] = useState([DEFAULT_FLOW_CATEGORY]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ line: '' });
  const [confirmState, setConfirmState] = useState({ type: null, row: null, rowKey: null });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
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
  const groupedFlowRows = useMemo(
    () =>
      sortedFlowRows.reduce((acc, row, idx) => {
        const group = row.group || 'general';
        if (!acc[group]) acc[group] = [];
        acc[group].push({ row, idx });
        return acc;
      }, {}),
    [sortedFlowRows]
  );

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
    if (!isMenuOpen) return undefined;
    const handleOutsideClick = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isMenuOpen]);

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
    const normalizedCategory = normalizeCategoryPath(selectedCategory) || DEFAULT_FLOW_CATEGORY;
    const parsedEntries = parseFlowEntriesByDatesAndGroups({
      rawText: entryInput,
      fallbackDate: dateYmd,
      defaultGroup: normalizedCategory,
    });

    if (!ownerId || parsedEntries.length === 0) {
      if (!silentValidation) {
        toast.error('Заповніть валідні дані: дата + сума + опис (з групами за потреби)');
      }
      return;
    }

    try {
      await Promise.all(parsedEntries.map(entry => saveFlowEntry({ ownerId, ...entry })));
      const lastEntry = parsedEntries[parsedEntries.length - 1];
      setDateYmd(lastEntry.date);
      setSelectedCategory(lastEntry.groupPath || normalizedCategory);
      setEntryInput(`${formatDisplayDate(lastEntry.date)} `);
      toast.success(
        parsedEntries.length === 1
          ? 'Flow збережено'
          : `Flow збережено: ${parsedEntries.length} записів`
      );
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

  const handleDeleteRow = async row => {
    if (!ownerId) return;
    try {
      await deleteFlowEntry({
        ownerId,
        groupPath: row.group || 'general',
        date: row.date,
        amount: row.amount,
        description: row.description,
        entryId: row.entryId,
      });
      toast.success('Запис видалено');
      await reload();
    } catch (error) {
      console.error('Unable to delete flow row', error);
      toast.error('Не вдалося видалити запис');
    }
  };

  const openClearConfirm = () => setConfirmState({ type: 'clear', row: null, rowKey: null });
  const openDeleteConfirm = (row, rowKey) => setConfirmState({ type: 'row', row, rowKey });
  const closeConfirm = () => setConfirmState({ type: null, row: null, rowKey: null });

  const handleConfirm = async () => {
    if (confirmState.type === 'clear') {
      await handleClear();
      closeConfirm();
      return;
    }
    if (confirmState.type === 'row' && confirmState.row) {
      await handleDeleteRow(confirmState.row);
      closeConfirm();
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
      <TopControls>
        <CopyBtn
          type="button"
          onClick={handleCopyToClipboard}
          aria-label="Копіювати Flow у буфер обміну"
          title="Копіювати Flow у буфер обміну"
          $bg="#2f7bff"
        >
          <ClipboardIcon />
        </CopyBtn>
        <DangerBtn type="button" onClick={openClearConfirm} $bg="#dc3545">del</DangerBtn>
        <MenuWrap ref={menuRef}>
          <MenuBtn
            type="button"
            aria-label="Відкрити меню навігації"
            onClick={() => setIsMenuOpen(prev => !prev)}
            $bg="#6f42c1"
          >
            ⋮
          </MenuBtn>
          {isMenuOpen && (
            <MenuPanel>
              <MenuItem
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/my-profile');
                }}
              >
                Перейти в профіль
              </MenuItem>
              <MenuItem
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/add');
                }}
              >
                Перейти на Add
              </MenuItem>
              <MenuItem
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/matching');
                }}
              >
                Перейти на Matching
              </MenuItem>
            </MenuPanel>
          )}
        </MenuWrap>
      </TopControls>

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
          Дата + сума + опис (підтримка груп і дат у кілька рядків)
          <EntryInput
            ref={entryInputRef}
            value={entryInput}
            onChange={e => {
              const nextValue = e.target.value;
              setEntryInput(nextValue);
              const parsed = parseFlowEntriesByDatesAndGroups({
                rawText: nextValue,
                fallbackDate: dateYmd,
                defaultGroup: selectedCategory,
              })?.[0];
              if (parsed?.date) setDateYmd(parsed.date);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
                categoryInputRef.current?.focus();
              }
            }}
            onBlur={() => {
              handleSave({ silentValidation: true });
            }}
            placeholder={'[їжа]\n29.03 100 Кава\n240 Обід\n\nтранспорт\n30.03\n340 Таксі'}
          />
        </Label>
      </Row>

      <small>Події з бекенду (відсортовано по групі і даті):</small>
      <EventsList>
        {Object.entries(groupedFlowRows).map(([group, entries]) => (
          <GroupBlock key={group}>
            <GroupTitle>[{group}]</GroupTitle>
            <GroupRows>
              {entries.map(({ row, idx }) => {
                const rowKey = getRowKey(row, idx);
                const isEditing = editingKey === rowKey;
                return (
                  <EventRow
                    key={rowKey}
                    $clickable={!isEditing}
                    $highlighted={confirmState.type === 'row' && confirmState.rowKey === rowKey}
                    onClick={!isEditing ? () => beginEdit(row, idx) : undefined}
                  >
                    {isEditing ? (
                      <EditInline>
                        <Input
                          autoFocus
                          style={{ width: '100%', minWidth: 0, fontSize: 12, padding: 4 }}
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
                      </EditInline>
                    ) : (
                      <>
                        <EventText>{formatDisplayDate(row.date)} {row.amount} {row.description}</EventText>
                        <DeleteRowBtn
                          type="button"
                          aria-label="delete-row"
                          title="Видалити рядок"
                          onClick={e => {
                            e.stopPropagation();
                            openDeleteConfirm(row, rowKey);
                          }}
                        >
                          ×
                        </DeleteRowBtn>
                      </>
                    )}
                  </EventRow>
                );
              })}
            </GroupRows>
          </GroupBlock>
        ))}
      </EventsList>

      {loading && <small>Завантаження...</small>}

      {confirmState.type && (
        <ConfirmBackdrop onClick={closeConfirm}>
          <ConfirmCard onClick={e => e.stopPropagation()}>
            <div>
              {confirmState.type === 'clear'
                ? 'Підтвердьте очищення всього Flow'
                : 'Підтвердьте видалення цього рядка'}
            </div>
            {confirmState.type === 'row' && confirmState.row && (
              <ConfirmRowPreview>
                {formatDisplayDate(confirmState.row.date)} {confirmState.row.amount} {confirmState.row.description}
              </ConfirmRowPreview>
            )}
            <ConfirmActions>
              <ActionBtn type="button" onClick={closeConfirm}>Скасувати</ActionBtn>
              <DangerBtn type="button" onClick={handleConfirm}>Підтвердити</DangerBtn>
            </ConfirmActions>
          </ConfirmCard>
        </ConfirmBackdrop>
      )}
    </Wrap>
  );
};

export default FlowManager;
