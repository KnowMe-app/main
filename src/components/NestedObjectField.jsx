import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { FaTimes } from 'react-icons/fa';

/*
 * Поле анкети, значення якого — обʼєкт (`programs`, `parentPreferences`,
 * будь-яка вкладена структура з імпорту).
 *
 * Форма адміна вміла два види значень — рядок і масив версій, — і обʼєкт
 * падав у текстове поле як «[object Object]»: подивитись, що всередині, не
 * було як, а перше ж збереження записало б цей рядок замість обʼєкта. Тут
 * вкладеність розкладена блоками, які згортаються: скаляр правиться як
 * звичайне поле (на blur), а кожен ключ і кожен вкладений блок знімається
 * своїм хрестиком — так само, як версія поля в масиві.
 *
 * Тип значення зберігається: число лишається числом, так/ні — булевим.
 * Правила бази перевіряють саме тип (`isNumber()`), і «2500» рядком там не
 * пройшло б.
 */

const Block = styled.div`
  width: 100%;
  border: 1px solid ${({ $depth }) => ($depth ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.14)')};
  border-radius: 10px;
  background: ${({ $depth }) => ($depth % 2 ? 'rgba(0, 0, 0, 0.02)' : 'transparent')};
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
`;

const Toggle = styled.button`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  b { font-weight: 600; }
  span { color: #7a7a72; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const Caret = styled.span`
  display: inline-block;
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
  transition: transform 120ms ease;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px 8px 18px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(70px, 30%) minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  font-size: 13px;
`;

const Key = styled.label`
  color: #7a7a72;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Input = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  background: #fff;
  color: inherit;
  font: inherit;
  font-size: 13px;
`;

const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: rgba(232, 121, 26, 0.12);
  color: #c75f0b;
  cursor: pointer;
`;

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isNestedObjectValue = isPlainObject;

const setIn = (source, path, value) => {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const base = Array.isArray(source) ? [...source] : { ...(source || {}) };
  base[head] = setIn(base[head], rest, value);
  return base;
};

const deleteIn = (source, path) => {
  const [head, ...rest] = path;
  if (!rest.length) {
    if (Array.isArray(source)) return source.filter((_, index) => String(index) !== String(head));
    const { [head]: _removed, ...kept } = source || {};
    return kept;
  }
  const base = Array.isArray(source) ? [...source] : { ...(source || {}) };
  base[head] = deleteIn(base[head], rest);
  return base;
};

/** Рядок, набраний у поле, назад у тип, який там лежав. */
const castLike = (original, raw) => {
  if (typeof original === 'number') {
    const n = Number(String(raw).replace(',', '.').trim());
    return String(raw).trim() !== '' && Number.isFinite(n) ? n : raw;
  }
  return raw;
};

// Короткий підпис згорнутого блоку: чим він є, без розгортання.
const describe = value => {
  if (Array.isArray(value)) return `${value.length} ел.`;
  if (!isPlainObject(value)) return '';
  const named = ['title', 'label', 'name', 'type'].map(key => value[key]).find(item => typeof item === 'string' && item.trim());
  const count = Object.keys(value).length;
  return [named, `${count} ${count === 1 ? 'поле' : 'полів'}`].filter(Boolean).join(' · ');
};

const ScalarRow = ({ label, value, path, onEdit, onCommit, onRemove }) => {
  const id = `nested-${path.join('-')}`;
  return (
    <Row>
      <Key htmlFor={id} title={label}>{label}</Key>
      {typeof value === 'boolean' ? (
        <Input
          id={id}
          as="select"
          value={value ? 'true' : 'false'}
          onChange={event => onCommit(path, event.target.value === 'true')}
        >
          <option value="true">так</option>
          <option value="false">ні</option>
        </Input>
      ) : (
        <Input
          id={id}
          inputMode={typeof value === 'number' ? 'decimal' : 'text'}
          value={value ?? ''}
          onChange={event => onEdit(path, castLike(value, event.target.value))}
          onBlur={() => onCommit()}
        />
      )}
      <RemoveButton type="button" aria-label={`Видалити ${label}`} onClick={() => onRemove(path)}>
        <FaTimes size={11} />
      </RemoveButton>
    </Row>
  );
};

const NestedBlock = ({ label, value, path, depth, defaultOpen, onEdit, onCommit, onRemove }) => {
  const [open, setOpen] = useState(defaultOpen);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value || {});
  return (
    <Block $depth={depth}>
      <Head>
        <Toggle type="button" aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
          <Caret $open={open} aria-hidden="true">▸</Caret>
          <b>{label}</b>
          <span>{describe(value)}</span>
        </Toggle>
        {path.length ? (
          <RemoveButton type="button" aria-label={`Видалити блок ${label}`} onClick={() => onRemove(path)}>
            <FaTimes size={11} />
          </RemoveButton>
        ) : null}
      </Head>
      {open ? (
        <Body>
          {entries.length ? entries.map(([key, item]) => (
            item && typeof item === 'object' ? (
              <NestedBlock
                key={key}
                label={Array.isArray(value) ? `[${key}]` : key}
                value={item}
                path={[...path, key]}
                depth={depth + 1}
                defaultOpen={false}
                onEdit={onEdit}
                onCommit={onCommit}
                onRemove={onRemove}
              />
            ) : (
              <ScalarRow
                key={key}
                label={Array.isArray(value) ? `[${key}]` : key}
                value={item}
                path={[...path, key]}
                onEdit={onEdit}
                onCommit={onCommit}
                onRemove={onRemove}
              />
            )
          )) : <span style={{ fontSize: 12, color: '#7a7a72' }}>—</span>}
        </Body>
      ) : null}
    </Block>
  );
};

/**
 * `onChange` — кожен набраний символ (лише стан форми), `onCommit` — запис
 * (blur, вибір, видалення). Порожній обʼєкт після видалення — це вже не
 * значення, і його знімає `onDeleteField`.
 */
export const NestedObjectField = ({ label, value, onChange, onCommit, onDeleteField }) => {
  const latestRef = useRef(value);
  latestRef.current = value;

  const edit = (path, next) => {
    const updated = setIn(latestRef.current, path, next);
    latestRef.current = updated;
    onChange(updated);
  };

  const commit = (path, next) => {
    if (path) edit(path, next);
    onCommit(latestRef.current);
  };

  const remove = path => {
    const updated = deleteIn(latestRef.current, path);
    latestRef.current = updated;
    if (!Object.keys(updated || {}).length) {
      onDeleteField();
      return;
    }
    onChange(updated);
    onCommit(updated);
  };

  return (
    <NestedBlock
      label={label}
      value={value}
      path={[]}
      depth={0}
      defaultOpen={false}
      onEdit={edit}
      onCommit={commit}
      onRemove={remove}
    />
  );
};

export default NestedObjectField;
