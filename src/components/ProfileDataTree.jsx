import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { get, ref, remove, set } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { FaExternalLinkAlt, FaTimes } from 'react-icons/fa';
import { database, db } from './config';
import { buildFirestoreConsoleLink, buildRtdbConsoleLink } from './profileFormNodeBlocks';
import {
  PROFILE_DATA_TREE_GROUPS,
  buildProfileDataSources,
  castTreeInput,
  describeTreeValue,
  removeFromTree,
  setInTree,
} from 'utils/profileDataTree';

/*
 * «Усі дані картки в базі» — дерево по місцях, де вони лежать
 * (`utils/profileDataTree.js`). Кожен вузол підписаний своїм шляхом і має
 * посилання в консоль Firebase; скаляр правиться на blur, будь-який вузол
 * знімається хрестиком, до обʼєкта можна дописати ключ.
 *
 * Пише дерево так само, як консоль: прямо за адресою. Похідні — картку
 * стрічки, `searchId`, `searchKey` — запис тут не перебудовує, і саме тому
 * поля анкети лишаються за формою вище, а дерево — для того, чого форма не
 * показує, і для перевірки, що саме лежить у базі.
 *
 * Секція згорнута й нічого не читає, доки її не розгорнули: це близько
 * двадцяти точкових запитів, а вузли самого користувача (його реакції,
 * чернетки) — лише на розгортання кожного.
 */

const CHILD_PAGE = 200;

const isBranch = value => value !== null && typeof value === 'object';

const pathOf = segments => segments.join('/');

const readSource = async source => {
  if (source.store === 'firestore') {
    const snapshot = await getDoc(doc(db, ...source.segments));
    return snapshot.exists() ? snapshot.data() : null;
  }
  const snapshot = await get(ref(database, pathOf(source.segments)));
  return snapshot.exists() ? snapshot.val() : null;
};

const consoleLinkFor = (source, segments) => (
  source.store === 'firestore' ? buildFirestoreConsoleLink(segments) : buildRtdbConsoleLink(segments)
);

const BackendLink = ({ href, path }) => (
  <LinkIcon href={href} target="_blank" rel="noopener noreferrer" title={`Відкрити в консолі: ${path}`}>
    <FaExternalLinkAlt size={10} />
  </LinkIcon>
);

const AddKeyForm = ({ onAdd }) => {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const submit = () => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    if (/[.#$[\]/]/.test(trimmedKey)) {
      toast.error('Ключ не може містити . # $ [ ] /');
      return;
    }
    onAdd(trimmedKey, value);
    setKey('');
    setValue('');
  };
  return (
    <AddRow>
      <TreeInput placeholder="ключ" value={key} onChange={event => setKey(event.target.value)} />
      <TreeInput placeholder="значення" value={value} onChange={event => setValue(event.target.value)} />
      <SmallButton type="button" onClick={submit}>+ ключ</SmallButton>
    </AddRow>
  );
};

const ScalarNode = ({ label, value, segments, source, editable, onWrite, onRemove }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const path = pathOf(segments);
  const commit = next => {
    const cast = castTreeInput(value, next);
    if (cast === value) return;
    onWrite(segments, cast);
  };
  return (
    <ScalarRow data-testid="profile-data-tree-scalar" data-path={path}>
      <KeyLabel title={path}>{label}</KeyLabel>
      {typeof value === 'boolean' ? (
        <TreeInput
          as="select"
          value={value ? 'true' : 'false'}
          disabled={!editable}
          onChange={event => commit(event.target.value)}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </TreeInput>
      ) : (
        <TreeInput
          as={typeof value === 'string' && (value.length > 60 || value.includes('\n')) ? 'textarea' : 'input'}
          aria-label={path}
          value={draft ?? ''}
          readOnly={!editable}
          inputMode={typeof value === 'number' ? 'decimal' : 'text'}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
        />
      )}
      <BackendLink href={consoleLinkFor(source, segments)} path={path} />
      {editable ? (
        <RemoveButton type="button" aria-label={`Видалити ${path}`} onClick={() => onRemove(segments)}>
          <FaTimes size={10} />
        </RemoveButton>
      ) : <span />}
    </ScalarRow>
  );
};

const BranchNode = ({ label, value, segments, source, editable, depth, defaultOpen, hint, onWrite, onRemove }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [limit, setLimit] = useState(CHILD_PAGE);
  const path = pathOf(segments);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item]).filter(([, item]) => item !== undefined && item !== null)
    : Object.entries(value || {});
  return (
    <Branch $depth={depth} data-testid="profile-data-tree-branch" data-path={path}>
      <BranchHead>
        <Toggle type="button" aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
          <Caret $open={open} aria-hidden="true">▸</Caret>
          <b>{label}</b>
          <Meta>{describeTreeValue(value)}</Meta>
        </Toggle>
        <PathLabel title={path}>{path}</PathLabel>
        <BackendLink href={consoleLinkFor(source, segments)} path={path} />
        {editable && depth > 0 ? (
          <RemoveButton type="button" aria-label={`Видалити ${path}`} onClick={() => onRemove(segments)}>
            <FaTimes size={10} />
          </RemoveButton>
        ) : null}
      </BranchHead>
      {open ? (
        <BranchBody>
          {hint ? <Hint>{hint}</Hint> : null}
          {entries.slice(0, limit).map(([key, item]) => (
            <TreeNode
              key={key}
              label={Array.isArray(value) ? `[${key}]` : key}
              value={item}
              segments={[...segments, key]}
              source={source}
              editable={editable}
              depth={depth + 1}
              onWrite={onWrite}
              onRemove={onRemove}
            />
          ))}
          {entries.length > limit ? (
            <SmallButton type="button" onClick={() => setLimit(current => current + CHILD_PAGE)}>
              Показати ще ({entries.length - limit})
            </SmallButton>
          ) : null}
          {editable && !Array.isArray(value) ? (
            <AddKeyForm onAdd={(key, raw) => onWrite([...segments, key], raw)} />
          ) : null}
        </BranchBody>
      ) : null}
    </Branch>
  );
};

const TreeNode = props => (
  isBranch(props.value) ? <BranchNode {...props} defaultOpen={false} /> : <ScalarNode {...props} />
);

const EmptyRootValue = ({ segments, onWrite }) => {
  const [value, setValue] = useState('');
  return (
    <SingleAddRow>
      <TreeInput
        placeholder="Немає. Записати значення…"
        aria-label={`Нове значення для ${pathOf(segments)}`}
        value={value}
        onChange={event => setValue(event.target.value)}
      />
      <SmallButton
        type="button"
        aria-label={`Записати ${pathOf(segments)}`}
        disabled={!value.trim()}
        onClick={() => {
          onWrite(segments, value);
          setValue('');
        }}
      >
        Записати
      </SmallButton>
    </SingleAddRow>
  );
};

const SourceRoot = ({ source, entry, onLoad, onWrite, onRemove }) => {
  const path = pathOf(source.segments);
  const href = consoleLinkFor(source, source.segments);
  const editable = !source.readOnly;
  const header = (
    <RootHead>
      <RootTitle>{source.title}</RootTitle>
      <PathLabel title={path}>{source.store === 'firestore' ? `Firestore: ${path}` : path}</PathLabel>
      <BackendLink href={href} path={path} />
      {!source.linkOnly ? (
        <SmallButton type="button" onClick={() => onLoad(source)} disabled={entry?.status === 'loading'}>
          {entry?.status === 'ready' || entry?.status === 'error' ? 'Перечитати' : 'Прочитати'}
        </SmallButton>
      ) : null}
    </RootHead>
  );

  let body = null;
  if (source.linkOnly) {
    body = <Hint>Веб цей вузол не читає (legacy-дзеркало) — подивитись можна лише в консолі.</Hint>;
  } else if (!entry || entry.status === 'idle') {
    body = source.lazy ? <Hint>Читається на «Прочитати»: вузол буває великим.</Hint> : null;
  } else if (entry.status === 'loading') {
    body = <Hint>Читаю…</Hint>;
  } else if (entry.status === 'error') {
    body = <ErrorText>Не прочитано: {entry.error}</ErrorText>;
  } else if (isBranch(entry.value)) {
    body = (
      <BranchNode
        label={source.segments[source.segments.length - 1]}
        value={entry.value}
        segments={source.segments}
        source={source}
        editable={editable}
        depth={0}
        defaultOpen
        onWrite={onWrite}
        onRemove={onRemove}
      />
    );
  } else if (entry.value === null || entry.value === undefined) {
    body = editable ? <EmptyRootValue segments={source.segments} onWrite={onWrite} /> : <Hint>Немає.</Hint>;
  } else {
    body = (
      <ScalarNode
        label="значення"
        value={entry.value}
        segments={source.segments}
        source={source}
        editable={editable}
        onWrite={onWrite}
        onRemove={onRemove}
      />
    );
  }

  return (
    <Root data-testid="profile-data-tree-source" data-path={path}>
      {header}
      {body}
    </Root>
  );
};

export const ProfileDataTree = ({ cardId, viewerId, draftAuthorId = '', record = null, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [entries, setEntries] = useState({});
  const [resolvedAuthor, setResolvedAuthor] = useState('');
  const cardRef = useRef(cardId);

  const author = draftAuthorId || resolvedAuthor;
  const sources = useMemo(
    () => buildProfileDataSources({ cardId, viewerId, draftAuthorId: author, record }),
    [cardId, viewerId, author, record],
  );

  useEffect(() => {
    cardRef.current = cardId;
    setEntries({});
    setResolvedAuthor('');
  }, [cardId]);

  const loadSource = useCallback(async source => {
    const requestedFor = cardRef.current;
    setEntries(current => ({ ...current, [source.id]: { status: 'loading' } }));
    try {
      const value = await readSource(source);
      if (cardRef.current !== requestedFor) return;
      setEntries(current => ({ ...current, [source.id]: { status: 'ready', value } }));
      if (source.id === 'draft:owner' && typeof value === 'string' && value.trim()) {
        setResolvedAuthor(value.trim());
      }
    } catch (error) {
      if (cardRef.current !== requestedFor) return;
      setEntries(current => ({
        ...current,
        [source.id]: { status: 'error', error: error?.code || error?.message || String(error) },
      }));
    }
  }, []);

  // Розгорнута секція дочитує все, що не ліниве і ще не читалось: зокрема
  // запис чернетки, щойно `profileMutationOwners` назвав її автора.
  useEffect(() => {
    if (!open) return;
    sources.forEach(source => {
      if (source.lazy || source.linkOnly || entries[source.id]) return;
      loadSource(source);
    });
  }, [open, sources, entries, loadSource]);

  const findSource = segments => {
    const path = pathOf(segments);
    return sources
      .filter(source => !source.linkOnly && (path === pathOf(source.segments) || path.startsWith(`${pathOf(source.segments)}/`)))
      .sort((a, b) => b.segments.length - a.segments.length)[0];
  };

  const applyLocal = (segments, updater) => {
    const source = findSource(segments);
    if (!source) return;
    const relative = segments.slice(source.segments.length);
    setEntries(current => {
      const entry = current[source.id];
      if (!entry || entry.status !== 'ready') return current;
      return { ...current, [source.id]: { ...entry, value: updater(entry.value, relative) } };
    });
  };

  const handleWrite = async (segments, value) => {
    const path = pathOf(segments);
    try {
      await set(ref(database, path), value);
      applyLocal(segments, (current, relative) => setInTree(current, relative, value));
      toast.success(`Записано: ${path}`, { id: 'profile-data-tree' });
    } catch (error) {
      toast.error(`Не записано ${path}: ${error?.code || error?.message || error}`, { id: 'profile-data-tree' });
    }
  };

  const handleRemove = async segments => {
    const path = pathOf(segments);
    if (!window.confirm(`Видалити з бази ${path}?`)) return;
    try {
      await remove(ref(database, path));
      applyLocal(segments, (current, relative) => removeFromTree(current, relative));
      toast.success(`Видалено: ${path}`, { id: 'profile-data-tree' });
    } catch (error) {
      toast.error(`Не видалено ${path}: ${error?.code || error?.message || error}`, { id: 'profile-data-tree' });
    }
  };

  if (!cardId) return null;

  const groups = Object.keys(PROFILE_DATA_TREE_GROUPS)
    .map(groupId => ({ groupId, items: sources.filter(source => source.group === groupId) }))
    .filter(group => group.items.length);

  return (
    <Section data-testid="profile-data-tree">
      <SectionToggle type="button" aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
        <Caret $open={open} aria-hidden="true">▸</Caret>
        Усі дані картки в базі
      </SectionToggle>
      {open ? (
        <>
          <Hint>
            Запис іде прямо за адресою, як у консолі Firebase: картку стрічки й індекси пошуку він не
            перебудовує. Поля анкети правте у формі вище, а тут — те, чого форма не показує.
          </Hint>
          {groups.map(group => (
            <Group key={group.groupId}>
              <GroupTitle>{PROFILE_DATA_TREE_GROUPS[group.groupId]}</GroupTitle>
              {group.items.map(source => (
                <SourceRoot
                  key={source.id}
                  source={source}
                  entry={entries[source.id]}
                  onLoad={loadSource}
                  onWrite={handleWrite}
                  onRemove={handleRemove}
                />
              ))}
            </Group>
          ))}
        </>
      ) : null}
    </Section>
  );
};

export default ProfileDataTree;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
  padding: 10px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 12px;
  text-align: left;
  /* Колір свій, а не успадкований: в іншій оболонці текст ставав білим на білих полях. */
  color: #1f1f1b;
  background: #fff;
`;

const SectionToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const GroupTitle = styled.h4`
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
`;

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-left: 3px solid rgba(232, 121, 26, 0.45);
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
`;

const RootHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const RootTitle = styled.span`
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
`;

const PathLabel = styled.code`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #7a7a72;
`;

const Branch = styled.div`
  border: 1px solid ${({ $depth }) => ($depth ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.14)')};
  border-radius: 8px;
  background: ${({ $depth }) => ($depth % 2 ? 'rgba(0, 0, 0, 0.02)' : '#fff')};
`;

const BranchHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  min-width: 0;
`;

const Toggle = styled.button`
  flex: 0 1 auto;
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

  b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const Meta = styled.span`
  color: #7a7a72;
  font-size: 12px;
  white-space: nowrap;
`;

const Caret = styled.span`
  display: inline-block;
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
  transition: transform 120ms ease;
`;

const BranchBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 6px 6px 16px;
`;

const ScalarRow = styled.div`
  display: grid;
  grid-template-columns: minmax(60px, 28%) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  font-size: 13px;
`;

const KeyLabel = styled.span`
  color: #5f5f58;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TreeInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 6px;
  background: #fff;
  color: inherit;
  font: inherit;
  font-size: 13px;
  resize: vertical;
`;

const AddRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
`;

const SingleAddRow = styled(AddRow)`
  grid-template-columns: minmax(0, 1fr) auto;
`;

const SmallButton = styled.button`
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 6px;
  background: #fff;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: default; }
`;

const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: rgba(232, 121, 26, 0.12);
  color: #c75f0b;
  cursor: pointer;
`;

const LinkIcon = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  color: #1a73e8;
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: #7a7a72;
`;

const ErrorText = styled.p`
  margin: 0;
  font-size: 12px;
  color: #b3261e;
`;
