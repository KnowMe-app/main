import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefineBar,
  RefineScroller,
  RefineKeyChip,
  RefineValueChip,
  RefineValueCount,
  RefineSummary,
  RefineKeyMenu,
  RefineKeyMenuItem,
} from './Matching.styled';
import {
  MATCHING_REFINE_KEYS,
  buildRefineOptions,
  getRefineKeySpec,
  isRefineKeyAvailableInFeed,
} from '../utils/matchingRefineKey';

/**
 * Один рядок, яким звужують довгу видачу.
 *
 * Два стани, і другий — головний хід усього візуалу:
 *
 * - **обирають** — чіп ключа плюс значення з числами. Число обовʼязкове: «31–33»
 *   саме по собі нічого не каже, а «31–33 · 74» каже і чи варто тапати, і що
 *   буде після тапу;
 * - **обрано** — рядок згортається у твердження: що увімкнено, скільки під це
 *   підпадає, скільки з того вже показано і як зняти одним тапом. Після вибору
 *   меню на екрані більше не потрібне, а місце під сіткою карток — потрібне.
 *
 * Ключ один. Другий поруч — це вже шухляда фільтрів, тож зміна ключа скидає
 * значення, а не додає ще одну умову.
 *
 * Компонент нічого не читає з бекенду й не знає, звідки взялись картки: він
 * рахує числа по тому, що йому дали. Хто дає — вирішує сторінка.
 */
export const SearchRefineBar = ({
  users = [],
  activeKey,
  activeValue,
  shownCount,
  onChangeKey,
  onSelectValue,
  keysAvailableInFeedOnly = false,
  scanNote = '',
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef(null);

  // Меню закривається кліком повз нього — інакше воно лишалось би відкритим
  // поверх карток, і перший тап по картці витрачався б на закриття.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = event => {
      if (barRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menuOpen]);

  const spec = getRefineKeySpec(activeKey);
  const options = useMemo(() => buildRefineOptions(activeKey, users), [activeKey, users]);
  const activeOption = options.find(option => option.value === activeValue) || null;

  const selectKey = key => {
    setMenuOpen(false);
    if (key === activeKey) return;
    onChangeKey(key);
  };

  const keyMenu = menuOpen ? (
    <RefineKeyMenu role="radiogroup" aria-label="Ключ уточнення">
      {MATCHING_REFINE_KEYS.map(candidate => {
        const unavailable = keysAvailableInFeedOnly && !isRefineKeyAvailableInFeed(candidate.key);
        return (
          <RefineKeyMenuItem
            key={candidate.key}
            type="button"
            role="radio"
            aria-checked={candidate.key === activeKey}
            disabled={unavailable}
            // Ім'я пункту називає ключ, а причину недоступності несе воно ж —
            // інакше підказку `title` браузер підставляє замість імені, і
            // пункт озвучується як «У стрічці цей ключ потребує індексу».
            aria-label={unavailable ? `${candidate.label} — потрібен індекс searchKey` : candidate.label}
            title={unavailable ? 'У стрічці цей ключ потребує індексу searchKey' : candidate.label}
            onClick={() => selectKey(candidate.key)}
          >
            <span aria-hidden="true" style={{ width: 12 }}>{candidate.key === activeKey ? '✓' : ''}</span>
            <span>{candidate.label}</span>
            {unavailable && <small>потрібен індекс</small>}
          </RefineKeyMenuItem>
        );
      })}
    </RefineKeyMenu>
  ) : null;

  if (activeValue) {
    const total = activeOption?.count ?? users.length;
    return (
      <RefineBar ref={barRef} data-testid="search-refine-bar">
        <RefineValueChip
          type="button"
          $active
          aria-pressed
          aria-label={`Зняти уточнення ${spec.label}: ${activeOption?.label || activeValue}`}
          title="Зняти уточнення"
          onClick={() => onSelectValue(null)}
        >
          <span>{`${spec.label} · ${activeOption?.label || activeValue}`}</span>
          <RefineValueCount>{total}</RefineValueCount>
          <span aria-hidden="true">✕</span>
        </RefineValueChip>
        <RefineSummary>
          {shownCount !== undefined && shownCount < total
            ? `показано ${shownCount} з ${total}`
            : `${total}${scanNote ? ` ${scanNote}` : ' у видачі'}`}
        </RefineSummary>
      </RefineBar>
    );
  }

  return (
    <RefineBar ref={barRef} data-testid="search-refine-bar">
      <RefineScroller role="group" aria-label={`Уточнити: ${spec.label}`}>
        <RefineKeyChip
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          title="Обрати ключ уточнення"
          onClick={() => setMenuOpen(open => !open)}
        >
          <span>{spec.label}</span>
          <span aria-hidden="true">▾</span>
        </RefineKeyChip>
        {options.map(option => (
          <RefineValueChip
            key={option.value}
            type="button"
            aria-pressed={false}
            // Нульове значення гасне, а не зникає: чіп, що пропадає під пальцем,
            // смикає ряд саме тоді, коли в нього цілять.
            disabled={option.count === 0}
            title={`${spec.label}: ${option.label} — ${option.count}`}
            onClick={() => onSelectValue(option.value)}
          >
            <span>{option.label}</span>
            <RefineValueCount>{option.count}</RefineValueCount>
          </RefineValueChip>
        ))}
      </RefineScroller>
      {scanNote ? <RefineSummary>{scanNote}</RefineSummary> : null}
      {keyMenu}
    </RefineBar>
  );
};

export default SearchRefineBar;
