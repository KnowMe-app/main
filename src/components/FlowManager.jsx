import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ReactComponent as ClipboardIcon } from 'assets/icons/clipboard.svg';
import {
  deleteFlowEntry,
  deleteFlowCategory,
  renameFlowCategory,
  clearFlowData,
  fetchFlowData,
  saveFlowEntry,
  updateFlowEntry,
} from './config';
import { useAutoResize } from 'hooks/useAutoResize';

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
  right: 0;
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
  box-sizing: border-box;
`;

const EntryInput = styled.textarea`
  width: 100%;
  min-height: 38px;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
`;

const EntryInputWrap = styled.div`
  position: relative;
  width: 100%;
`;

const ClearEntryBtn = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  border: 1px solid #d7d7d7;
  border-radius: 999px;
  width: 20px;
  height: 20px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 12px;
  background: #fff;
  color: #666;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
    color: #333;
  }
`;

const ActionBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fafafa;
  color: #222;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
`;

const ConfirmDangerBtn = styled(ActionBtn)`
  border-color: #dc3545;
  background: #dc3545;
  color: #fff;

  &:hover {
    background: #c82333;
  }
`;

const RadioGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
`;

const CategoryRowHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
`;

const CategoryEditBtn = styled(ActionBtn)`
  padding: 3px 8px;
  font-size: 13px;
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

const CategoryTitle = styled.span`
  display: inline-block;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const CategorySum = styled.span`
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
`;

const CategoryDeleteBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 999px;
  width: 18px;
  height: 18px;
  line-height: 1;
  font-size: 12px;
  cursor: pointer;
  color: #a00;
  background: #fff;
  padding: 0;

  &:hover {
    background: #ffecec;
  }
`;

const CategoryRenameInput = styled(Input)`
  min-width: 100px;
  max-width: 180px;
  font-size: 12px;
  padding: 4px 6px;
`;

const CategorySmallBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  min-width: 20px;
  height: 20px;
  line-height: 1;
  font-size: 11px;
  cursor: pointer;
  color: #444;
  background: #fff;
  padding: 0 4px;

  &:hover {
    background: #f4f4f4;
  }
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
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
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

const ChangeCategoryBtn = styled(DeleteRowBtn)`
  color: #3155b7;

  &:hover {
    background: #edf2ff;
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
  color: #222;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
`;

const ConfirmActions = styled.div`
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 8px;

  button {
    flex: 1;
    min-width: 120px;
    justify-content: center;
    display: inline-flex;
  }
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
    .replace(/[\\]+/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

const splitCategoryPath = value => {
  const normalized = normalizeCategoryPath(value);
  const [group = '', subgroup = ''] = normalized.split('/');
  return {
    group: group || 'general',
    subgroup: subgroup || '',
  };
};

const buildCategoryPath = (group, subgroup = '') => {
  const normalizedGroup = normalizeCategoryPath(group) || 'general';
  const normalizedSubgroup = normalizeCategoryPath(subgroup);
  return normalizedSubgroup ? `${normalizedGroup}/${normalizedSubgroup}` : normalizedGroup;
};

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

const sanitizeAmountChunk = value =>
  String(value || '')
    .trim()
    .replace(/[#$[/\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeFlowAmount = value => sanitizeAmountChunk(String(value || '').replace(',', '.'));

const toAmountNumber = value => {
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatFlowAmountForClipboard = value => {
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return String(value || '').replace('.', ',');
  return parsed.toFixed(2).replace('.', ',');
};

const formatCategorySum = value => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
};

const formatGroupTitle = groupPath => {
  const { group, subgroup } = splitCategoryPath(groupPath);
  return subgroup ? `${group}, ${subgroup}` : group;
};

export const parseFlowEntryLine = (line, fallbackDate = '') => {
  const trimmedLine = String(line || '').trim();
  if (!trimmedLine) return null;

  const leadingDateOnlyMatch = trimmedLine.match(/^(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+(.*))?$/);
  if (leadingDateOnlyMatch) {
    const rest = String(leadingDateOnlyMatch[2] || '').trim();
    if (rest && !/^[+-]?\d+(?:[.,]\d+)?(?:\s|$)/.test(rest)) {
      return null;
    }
  }

  const match = trimmedLine.match(
    /^(?:(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s+)?([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/,
  );
  if (!match) return null;

  const fallbackYear = Number(String(fallbackDate).split('-')[0]) || new Date().getFullYear();
  const parsedDate = match[1] ? parseDisplayDate(match[1], fallbackYear) : fallbackDate;
  const parsedAmount = normalizeFlowAmount(match[2] || '');
  const parsedDescription = sanitizeEntryKeyChunk(match[3] || '');

  if (!parsedDate || !parsedAmount) return null;
  return {
    date: parsedDate,
    amount: parsedAmount,
    description: parsedDescription,
  };
};

const FLOW_DATE_TOKEN_PATTERN = /\b\d{1,2}\.\d{1,2}(?:\.\d{4})?\b/;

const resolveFlowFallbackDate = (rawText, fallbackDate = '') => {
  const normalizedFallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate || ''))
    ? fallbackDate
    : '';
  if (FLOW_DATE_TOKEN_PATTERN.test(String(rawText || ''))) {
    return normalizedFallbackDate || todayYmd();
  }
  return todayYmd();
};

const parseFlowEntriesByDatesAndGroups = ({
  rawText,
  fallbackDate = '',
  defaultGroup = DEFAULT_FLOW_CATEGORY,
}) => {
  const normalizedFallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate || ''))
    ? fallbackDate
    : todayYmd();
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);
  const fallbackYear =
    Number(String(normalizedFallbackDate).split('-')[0]) || new Date().getFullYear();
  let currentGroup = normalizeCategoryPath(defaultGroup) || DEFAULT_FLOW_CATEGORY;
  let currentDate = normalizedFallbackDate;
  const entries = [];

  lines.forEach(line => {
    const groupMatch = line.match(/^\[(.+)]$/);
    if (groupMatch) {
      currentGroup = normalizeCategoryPath(groupMatch[1]) || currentGroup || DEFAULT_FLOW_CATEGORY;
      return;
    }

    const parsedLine = parseFlowEntryLine(line, currentDate || normalizedFallbackDate);
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
const flowLastCategoryStorageKey = ownerId => `flow-last-category:${ownerId || 'anon'}`;

export const flattenFlowEntriesFromBackend = flowNode => {
  if (!flowNode || typeof flowNode !== 'object') return [];

  const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

  const parseEntryValue = value => {
    if (typeof value === 'string') {
      const [amount = '', ...rest] = String(value || '').split('_');
      return {
        amount,
        description: rest.join('_'),
      };
    }

    if (value && typeof value === 'object') {
      return {
        amount: value.amount ?? value.sum ?? value.value ?? '',
        description: value.description ?? value.comment ?? value.note ?? '',
      };
    }

    return {
      amount: '',
      description: '',
    };
  };

  const collectEntries = (node, groupPath = DEFAULT_FLOW_CATEGORY) => {
    if (!node || typeof node !== 'object') return [];

    return Object.entries(node).flatMap(([key, value]) => {
      if (!value || typeof value !== 'object') return [];

      if (isDateKey(key)) {
        return Object.entries(value)
          .map(([entryId, entryValue]) => {
            const parsed = parseEntryValue(entryValue);
            const normalizedAmount = normalizeFlowAmount(parsed.amount);
            if (!normalizedAmount) return null;

            return {
              entryId,
              group: normalizeCategoryPath(groupPath) || DEFAULT_FLOW_CATEGORY,
              date: key,
              amount: normalizedAmount,
              description: sanitizeEntryKeyChunk(parsed.description),
            };
          })
          .filter(Boolean);
      }

      const nestedGroupPath = buildCategoryPath(groupPath, key);
      return collectEntries(value, nestedGroupPath);
    });
  };

  return Object.entries(flowNode).flatMap(([groupPath, groupNode]) => {
    const normalizedGroupPath = normalizeCategoryPath(groupPath) || DEFAULT_FLOW_CATEGORY;
    return collectEntries(groupNode, normalizedGroupPath);
  });
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
  const [entryInput, setEntryInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [subCategoryInput, setSubCategoryInput] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedSubgroup, setSelectedSubgroup] = useState('');
  const [localCategories, setLocalCategories] = useState([DEFAULT_FLOW_CATEGORY]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ line: '' });
  const [confirmState, setConfirmState] = useState({ type: null, row: null, rowKey: null });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCategoryEditMode, setIsCategoryEditMode] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState({ source: '', draft: '' });
  const menuRef = useRef(null);
  const entryInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const subCategoryInputRef = useRef(null);
  useAutoResize(entryInputRef, entryInput);

  const flowRows = useMemo(() => flattenFlowEntriesFromBackend(flowData), [flowData]);
  const categoriesFromDb = useMemo(
    () => [...new Set(flowRows.map(row => normalizeCategoryPath(row.group)).filter(Boolean))],
    [flowRows]
  );

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
  const groupedCategories = useMemo(
    () =>
      allCategories.reduce((acc, categoryPath) => {
        const { group, subgroup } = splitCategoryPath(categoryPath);
        if (!acc[group]) acc[group] = [];
        if (subgroup && !acc[group].includes(subgroup)) {
          acc[group].push(subgroup);
        }
        return acc;
      }, {}),
    [allCategories]
  );
  const allGroups = useMemo(() => Object.keys(groupedCategories), [groupedCategories]);
  const subgroupsForSelectedGroup = useMemo(
    () => groupedCategories[selectedGroup] || [],
    [groupedCategories, selectedGroup]
  );
  const selectedCategoryPath = useMemo(
    () => buildCategoryPath(selectedGroup, selectedSubgroup),
    [selectedGroup, selectedSubgroup]
  );
  const renameCategorySuggestions = useMemo(() => {
    const sourceCategory = normalizeCategoryPath(renamingCategory.source);
    return allGroups.filter(category => category !== sourceCategory);
  }, [allGroups, renamingCategory.source]);

  const categorySums = useMemo(
    () =>
      flowRows.reduce((acc, row) => {
        const group = normalizeCategoryPath(row.group) || DEFAULT_FLOW_CATEGORY;
        acc[group] = (acc[group] || 0) + toAmountNumber(row.amount);
        return acc;
      }, {}),
    [flowRows]
  );
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
      const lastCategoryRaw = localStorage.getItem(flowLastCategoryStorageKey(ownerId));
      const lastCategory = normalizeCategoryPath(lastCategoryRaw);
      if (lastCategory) {
        const { group, subgroup } = splitCategoryPath(lastCategory);
        setSelectedGroup(group);
        setSelectedSubgroup(subgroup);
      }

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
        if (parsed.selectedCategory) {
          const parsedPath = splitCategoryPath(parsed.selectedCategory);
          setSelectedGroup(parsedPath.group);
          setSelectedSubgroup(parsedPath.subgroup);
        }
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
          selectedCategory: selectedCategoryPath,
          localCategories,
        })
      );
    } catch (error) {
      console.error('Unable to persist flow draft into localStorage', error);
    }
  }, [dateYmd, entryInput, localCategories, ownerId, selectedCategoryPath]);

  useEffect(() => {
    if (!ownerId) return;
    const normalizedCategory = normalizeCategoryPath(selectedCategoryPath);
    if (!normalizedCategory) return;
    try {
      localStorage.setItem(flowLastCategoryStorageKey(ownerId), normalizedCategory);
    } catch (error) {
      console.error('Unable to persist last flow category into localStorage', error);
    }
  }, [ownerId, selectedCategoryPath]);

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
    if (
      allCategories.length > 0 &&
      (!selectedCategoryPath || !allCategories.includes(selectedCategoryPath))
    ) {
      const fallbackPath = splitCategoryPath(allCategories[0]);
      setSelectedGroup(fallbackPath.group);
      setSelectedSubgroup(fallbackPath.subgroup);
    }
  }, [allCategories, selectedCategoryPath]);

  useEffect(() => {
    if (!selectedGroup) return;
    if (subgroupsForSelectedGroup.includes(selectedSubgroup)) return;
    setSelectedSubgroup('');
  }, [selectedGroup, selectedSubgroup, subgroupsForSelectedGroup]);

  const addCategory = () => {
    const normalized = normalizeCategoryPath(categoryInput);
    if (!normalized) return;
    setLocalCategories(prev => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setSelectedGroup(normalized);
    setSelectedSubgroup('');
    setCategoryInput('');
  };

  const addSubcategory = () => {
    const normalizedGroup = normalizeCategoryPath(selectedGroup) || DEFAULT_FLOW_CATEGORY;
    const normalizedSubgroup = normalizeCategoryPath(subCategoryInput);
    if (!normalizedSubgroup) return;
    const nextPath = buildCategoryPath(normalizedGroup, normalizedSubgroup);
    setLocalCategories(prev => (prev.includes(nextPath) ? prev : [...prev, nextPath]));
    setSelectedGroup(normalizedGroup);
    setSelectedSubgroup(normalizedSubgroup);
    setSubCategoryInput('');
  };

  const handleDeleteCategory = async category => {
    const normalized = normalizeCategoryPath(category);
    if (!ownerId || !normalized) return;
    const categoryPrefix = `${normalized}/`;

    try {
      if (
        categoriesFromDb.some(
          item => item === normalized || item.startsWith(categoryPrefix)
        )
      ) {
        await deleteFlowCategory({ ownerId, groupPath: normalized });
      }
      setLocalCategories(prev =>
        prev.filter(item => item !== normalized && !item.startsWith(categoryPrefix))
      );
      if (selectedGroup === normalized) {
        setSelectedGroup('');
        setSelectedSubgroup('');
      }
      toast.success(`Групу "${normalized}" видалено`);
      await reload();
    } catch (error) {
      console.error('Unable to delete flow category', error);
      toast.error('Не вдалося видалити групу');
    }
  };

  const startCategoryRename = category => {
    setRenamingCategory({ source: category, draft: category });
  };

  const cancelCategoryRename = () => {
    setRenamingCategory({ source: '', draft: '' });
  };

  const submitCategoryRename = async category => {
    const normalizedSource = normalizeCategoryPath(category);
    const normalizedTarget = normalizeCategoryPath(renamingCategory.draft);
    const sourcePrefix = `${normalizedSource}/`;

    if (!normalizedSource || !normalizedTarget) {
      toast.error('Вкажіть валідну назву групи');
      return;
    }

    if (normalizedSource === normalizedTarget) {
      cancelCategoryRename();
      return;
    }

    const targetExists = allGroups.includes(normalizedTarget);
    if (targetExists) {
      const shouldMerge = window.confirm(
        `Група "${normalizedTarget}" вже існує. Об’єднати "${normalizedSource}" в "${normalizedTarget}"?`
      );
      if (!shouldMerge) return;
    }

    try {
      if (
        categoriesFromDb.some(
          item => item === normalizedSource || item.startsWith(sourcePrefix)
        )
      ) {
        await renameFlowCategory({
          ownerId,
          fromGroupPath: normalizedSource,
          toGroupPath: normalizedTarget,
        });
      }

      setLocalCategories(prev => {
        const renamed = prev.map(item => {
          if (item === normalizedSource) return normalizedTarget;
          if (item.startsWith(sourcePrefix)) return `${normalizedTarget}/${item.slice(sourcePrefix.length)}`;
          return item;
        });
        return [...new Set(renamed)];
      });
      if (selectedGroup === normalizedSource) {
        const normalizedTargetPath = splitCategoryPath(buildCategoryPath(normalizedTarget, selectedSubgroup));
        setSelectedGroup(normalizedTargetPath.group);
        setSelectedSubgroup(normalizedTargetPath.subgroup);
      }
      cancelCategoryRename();
      toast.success(
        targetExists
          ? `Групи об’єднано в "${normalizedTarget}"`
          : `Групу перейменовано на "${normalizedTarget}"`
      );
      await reload();
    } catch (error) {
      console.error('Unable to rename flow category', error);
      toast.error('Не вдалося перейменувати групу');
    }
  };

  const handleSave = async ({ silentValidation = false } = {}) => {
    const normalizedCategory = normalizeCategoryPath(selectedCategoryPath) || DEFAULT_FLOW_CATEGORY;
    const effectiveFallbackDate = resolveFlowFallbackDate(entryInput, dateYmd);
    const parsedEntries = parseFlowEntriesByDatesAndGroups({
      rawText: entryInput,
      fallbackDate: effectiveFallbackDate,
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
      const selectedPath = splitCategoryPath(lastEntry.groupPath || normalizedCategory);
      setSelectedGroup(selectedPath.group);
      setSelectedSubgroup(selectedPath.subgroup);
      setEntryInput('');
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
      .map(([groupPath, rows]) => {
        const { group, subgroup } = splitCategoryPath(groupPath);
        const title = subgroup ? `${group}, ${subgroup}` : group;
        const lines = sortRowsByDate(rows).map(row => {
          const displayDate = formatDisplayDate(row.date);
          const formattedAmount = formatFlowAmountForClipboard(row.amount);
          return `${displayDate} ${formattedAmount} ${row.description}`.trim();
        });
        return [title, ...lines].join('\n');
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
    const nextAmount = normalizeFlowAmount(match[2] || '');
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

  const handleChangeRowCategory = async row => {
    if (!ownerId) return;
    const nextCategoryRaw = window.prompt(
      'Вкажіть нову групу для платежу',
      row.group || DEFAULT_FLOW_CATEGORY,
    );
    if (nextCategoryRaw === null) return;

    const nextCategory = normalizeCategoryPath(nextCategoryRaw);
    if (!nextCategory) {
      toast.error('Вкажіть валідну назву групи');
      return;
    }
    if (nextCategory === row.group) return;

    try {
      await updateFlowEntry({
        ownerId,
        groupPath: row.group || DEFAULT_FLOW_CATEGORY,
        nextGroupPath: nextCategory,
        prevEntry: {
          entryId: row.entryId,
          date: row.date,
          amount: row.amount,
          description: row.description,
        },
        nextEntry: {
          date: row.date,
          amount: row.amount,
          description: row.description,
        },
      });
      setLocalCategories(prev => (prev.includes(nextCategory) ? prev : [...prev, nextCategory]));
      toast.success(`Платіж перенесено в групу "${nextCategory}"`);
      await reload();
    } catch (error) {
      console.error('Unable to change flow row category', error);
      toast.error('Не вдалося змінити групу платежу');
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
            onBlur={addCategory}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCategory();
              }
            }}
            placeholder="напр. Тест1"
          />
        </Label>
      </Row>

      <Row>
        <Label>
          Нова підгрупа
          <Input
            ref={subCategoryInputRef}
            value={subCategoryInput}
            onChange={e => {
              setSubCategoryInput(e.target.value);
            }}
            onBlur={addSubcategory}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSubcategory();
              }
            }}
            placeholder="напр. Транспорт"
          />
        </Label>
      </Row>

      <Label as="div">
        <CategoryRowHead>
          <span>Група витрат</span>
          <CategoryEditBtn
            type="button"
            onClick={() => {
              setIsCategoryEditMode(prev => !prev);
              cancelCategoryRename();
            }}
            title={isCategoryEditMode ? 'Сховати видалення груп' : 'Редагувати групи'}
            aria-label={isCategoryEditMode ? 'Сховати видалення груп' : 'Редагувати групи'}
          >
            ✏
          </CategoryEditBtn>
        </CategoryRowHead>
        <RadioGroup>
          {allGroups.map(category => (
            <RadioLabel key={category}>
              <input
                type="radio"
                name="flow-group"
                value={category}
                checked={selectedGroup === category}
                onChange={e => setSelectedGroup(normalizeCategoryPath(e.target.value))}
              />
              {renamingCategory.source === category ? (
                <CategoryRenameInput
                  autoFocus
                  value={renamingCategory.draft}
                  list="flow-rename-category-options"
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setRenamingCategory(prev => ({ ...prev, draft: e.target.value }))}
                  onBlur={() => submitCategoryRename(category)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitCategoryRename(category);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelCategoryRename();
                    }
                  }}
                />
              ) : <CategoryTitle>{category}</CategoryTitle>}
              {isCategoryEditMode && (
                <>
                  {renamingCategory.source !== category && (
                    <CategorySmallBtn
                      type="button"
                      aria-label={`Перейменувати групу ${category}`}
                      title={`Перейменувати групу ${category}`}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCategoryRename(category);
                      }}
                    >
                      ✎
                    </CategorySmallBtn>
                  )}
                  <CategoryDeleteBtn
                    type="button"
                    aria-label={`Видалити групу ${category}`}
                    title={`Видалити групу ${category}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteCategory(category);
                    }}
                  >
                    ×
                  </CategoryDeleteBtn>
                </>
              )}
            </RadioLabel>
          ))}
        </RadioGroup>
        <datalist id="flow-rename-category-options">
          {renameCategorySuggestions.map(category => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </Label>

      <Label as="div">
        <CategoryRowHead>
          <span>Підгрупа витрат</span>
        </CategoryRowHead>
        <RadioGroup>
          <RadioLabel key={`${selectedGroup}-base`}>
            <input
              type="radio"
              name="flow-subcategory"
              value=""
              checked={!selectedSubgroup}
              onChange={() => setSelectedSubgroup('')}
            />
            <CategoryTitle>Без підгрупи</CategoryTitle>
          </RadioLabel>
          {subgroupsForSelectedGroup.map(subgroup => (
            <RadioLabel key={`${selectedGroup}/${subgroup}`}>
              <input
                type="radio"
                name="flow-subcategory"
                value={subgroup}
                checked={selectedSubgroup === subgroup}
                onChange={e => setSelectedSubgroup(normalizeCategoryPath(e.target.value))}
              />
              <CategoryTitle>{subgroup}</CategoryTitle>
              {isCategoryEditMode && (
                <CategoryDeleteBtn
                  type="button"
                  aria-label={`Видалити підгрупу ${subgroup}`}
                  title={`Видалити підгрупу ${subgroup}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteCategory(buildCategoryPath(selectedGroup, subgroup));
                  }}
                >
                  ×
                </CategoryDeleteBtn>
              )}
            </RadioLabel>
          ))}
        </RadioGroup>
      </Label>

      <Divider />

      <Row>
        <Label>
          Дата + сума + опис (підтримка груп і дат у кілька рядків)
          <EntryInputWrap>
            <EntryInput
              ref={entryInputRef}
              rows={1}
              value={entryInput}
              onChange={e => {
                const nextValue = e.target.value;
                setEntryInput(nextValue);
                const effectiveFallbackDate = resolveFlowFallbackDate(nextValue, dateYmd);
                const parsed = parseFlowEntriesByDatesAndGroups({
                  rawText: nextValue,
                  fallbackDate: effectiveFallbackDate,
                  defaultGroup: selectedCategoryPath,
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
              placeholder={'Заголовок\n20.01.2026 100 кава'}
              style={{ paddingRight: entryInput ? 34 : 8 }}
            />
            {entryInput && (
              <ClearEntryBtn
                type="button"
                aria-label="Очистити поле вводу Flow"
                title="Очистити"
                onClick={() => {
                  setEntryInput('');
                  entryInputRef.current?.focus();
                }}
              >
                ×
              </ClearEntryBtn>
            )}
          </EntryInputWrap>
        </Label>
      </Row>

      <EventsList>
        {Object.entries(groupedFlowRows).map(([group, entries]) => (
          <GroupBlock key={group}>
            <GroupTitle>
              <span>{formatGroupTitle(group)}</span>
              <CategorySum>{formatCategorySum(categorySums[group] || 0)}</CategorySum>
            </GroupTitle>
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
                        <ChangeCategoryBtn
                          type="button"
                          aria-label="change-row-category"
                          title="Змінити групу платежу"
                          onClick={e => {
                            e.stopPropagation();
                            handleChangeRowCategory(row);
                          }}
                        >
                          ✏
                        </ChangeCategoryBtn>
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
              <ConfirmDangerBtn type="button" onClick={handleConfirm}>Підтвердити</ConfirmDangerBtn>
            </ConfirmActions>
          </ConfirmCard>
        </ConfirmBackdrop>
      )}
    </Wrap>
  );
};

export default FlowManager;
