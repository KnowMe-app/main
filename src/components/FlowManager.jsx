import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
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
`;

const TopControls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MenuWrap = styled.div`
  position: relative;
`;

const MenuBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  width: 34px;
  height: 34px;
  font-size: 18px;
  line-height: 1;
  background: #fff;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }
`;

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

const DangerBtn = styled(ActionBtn)`
  border-color: #dc3545;
  color: #fff;
  background: #dc3545;

  &:hover {
    background: #c82333;
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
`;

const GroupRows = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 2px solid #e5e5e5;
  padding-left: 8px;
`;

const EventRow = styled.li`
  margin-bottom: 5px;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const EventText = styled.span`
  flex: 1;
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
  align-items: center;
  gap: 6px;
  width: 100%;
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
  const navigate = useNavigate();
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
  const [confirmState, setConfirmState] = useState({ type: null, row: null });
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

  const openClearConfirm = () => setConfirmState({ type: 'clear', row: null });
  const openDeleteConfirm = row => setConfirmState({ type: 'row', row });
  const closeConfirm = () => setConfirmState({ type: null, row: null });

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
      <TopControls>
        <MenuWrap ref={menuRef}>
          <MenuBtn
            type="button"
            aria-label="Відкрити меню навігації"
            onClick={() => setIsMenuOpen(prev => !prev)}
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
            </MenuPanel>
          )}
        </MenuWrap>
        <DangerBtn type="button" onClick={openClearConfirm}>del</DangerBtn>
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
                    onClick={!isEditing ? () => beginEdit(row, idx) : undefined}
                  >
                    {isEditing ? (
                      <EditInline>
                        <Input
                          autoFocus
                          style={{ width: 320, fontSize: 12, padding: 4 }}
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
                            openDeleteConfirm(row);
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
