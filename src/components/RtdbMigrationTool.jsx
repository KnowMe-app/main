/**
 * Повторна міграція legacy-колекцій у нові вузли RTDB.
 *
 * Інструмент офлайновий: бази він не торкається ані на читання, ані на запис.
 * На вхід — JSON, вивантажений із консолі Firebase, на вихід — файл на кожен
 * вузол, який адміністраторка заливає імпортом після того, як подивилась звіт.
 * Так було й у першої міграції, і причина та сама: `newUsers` у правилах бази
 * більше немає (корінь — `.read: false`), тож інакше її не прочитати, а запис
 * без попереднього перегляду в цій частині бази — надто дорога помилка.
 *
 * Уся розкладка — у `legacyProfilesMigration`, і вона ходить тим самим
 * роутером, що й кожне збереження анкети. Тут лише вибір файлів, звіт і
 * вивантаження.
 */

import React, { useCallback, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';

import {
  MIGRATION_NODES,
  buildProfileNodesPayloadFromCollections,
} from '../utils/legacyProfilesMigration';

const Page = styled.div`
  padding: 16px;
  max-width: 900px;
  margin: 0 auto;
  color: var(--km-text);
`;

const Title = styled.h1`
  font-size: 20px;
  margin: 0 0 8px;
`;

const Intro = styled.p`
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.8;
  margin: 0 0 16px;
`;

const Section = styled.section`
  border: 1px solid var(--km-border, rgba(128, 128, 128, 0.35));
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 14px;
`;

const SectionTitle = styled.h2`
  font-size: 15px;
  margin: 0 0 10px;
`;

const SourceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`;

const SourceState = styled.span`
  font-size: 12px;
  opacity: 0.75;
`;

const Button = styled.button`
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--km-border, rgba(128, 128, 128, 0.35));
  background: var(--km-surface, transparent);
  color: inherit;
  cursor: pointer;
  font-size: 13px;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 10px;
`;

const Report = styled.pre`
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
`;

/** Колекції на вхід. `matchingCards` — не джерело даних, а знання про публікацію. */
const SOURCES = [
  { key: 'users', label: 'users.json', hint: 'legacy-колекція, primary' },
  { key: 'newUsers', label: 'newUsers.json', hint: 'друга legacy-колекція, secondary' },
  {
    key: 'matchingCards',
    label: 'matchingCards.json',
    hint: 'необовʼязково: щоб не переплутати «сховано» з «не публікували»',
  },
];

const readJsonFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Не вдалося прочитати ${file.name}`));
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ''));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reject(new Error(`${file.name}: очікується обʼєкт «id → анкета»`));
        return;
      }
      resolve(parsed);
    } catch (error) {
      reject(new Error(`${file.name}: не JSON (${error.message})`));
    }
  };
  reader.readAsText(file);
});

/** Мітка часу в імені файлу: інакше два прогони поспіль перезаписують один одного. */
const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

const countOf = value => (value && typeof value === 'object' ? Object.keys(value).length : 0);

const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const formatReport = ({ stats, conflicts, unmapped }) => {
  const lines = [
    `Анкет усього: ${stats.total}`,
    `  лише в users: ${stats.usersOnly}`,
    `  лише в newUsers: ${stats.newUsersOnly}`,
    `  в обох: ${stats.both}`,
    '',
    `Зібрано вузлів для анкет: ${stats.written}${stats.skipped ? `, пропущено порожніх: ${stats.skipped}` : ''}`,
  ];

  MIGRATION_NODES.forEach(node => {
    lines.push(`  ${node}: ${stats.byNode[node] || 0}`);
  });

  const conflictedIds = Object.keys(conflicts);
  if (conflictedIds.length) {
    const fields = new Set();
    conflictedIds.forEach(id => conflicts[id].forEach(field => fields.add(field)));
    lines.push(
      '',
      `Скалярні конфлікти: ${conflictedIds.length} анкет, поля: ${[...fields].sort().join(', ')}`,
      'У таких полях виграло значення з users. Щоб лишити обидва — увімкніть галочку вище.',
    );
  }

  const unmappedFields = Object.keys(unmapped);
  if (unmappedFields.length) {
    lines.push(
      '',
      'Поля, яким нового вузла немає (лишаються тільки в legacy):',
      ...unmappedFields
        .sort((left, right) => unmapped[right] - unmapped[left])
        .map(field => `  ${field}: ${unmapped[field]}`),
    );
  }

  return lines.join('\n');
};

const RtdbMigrationTool = () => {
  const [sources, setSources] = useState({});
  const [mergeConflictingScalars, setMergeConflictingScalars] = useState(false);
  const [result, setResult] = useState(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const inputRefs = useRef({});

  const handlePick = useCallback(async (key, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readJsonFile(file);
      setSources(current => ({ ...current, [key]: parsed }));
      // Звіт зібрано на попередніх файлах — після заміни джерела він бреше.
      setResult(null);
      toast.success(`${file.name}: ${countOf(parsed)} записів`);
    } catch (error) {
      toast.error(error.message);
    }
  }, []);

  const canBuild = Boolean(sources.users || sources.newUsers);

  const handleBuild = useCallback(() => {
    if (!canBuild) {
      toast.error('Оберіть хоча б одну legacy-колекцію');
      return;
    }
    setIsBuilding(true);
    try {
      const built = buildProfileNodesPayloadFromCollections(sources, { mergeConflictingScalars });
      setResult(built);
      toast.success(`Зібрано ${built.stats.written} анкет`);
    } catch (error) {
      console.error('[rtdbMigration] збірка вузлів впала', error);
      toast.error(`Помилка збірки: ${error?.message || 'невідома помилка'}`);
    } finally {
      setIsBuilding(false);
    }
  }, [canBuild, mergeConflictingScalars, sources]);

  const handleDownloadNode = useCallback(node => {
    const nodePayload = result?.payload?.[node];
    if (!countOf(nodePayload)) {
      toast.error(`Для ${node} нічого не зібрано`);
      return;
    }
    downloadJson(`${node}-${fileStamp()}.json`, nodePayload);
  }, [result]);

  const handleDownloadReport = useCallback(() => {
    if (!result) return;
    downloadJson(`migration-report-${fileStamp()}.json`, {
      createdAt: new Date().toISOString(),
      stats: result.stats,
      conflicts: result.conflicts,
      unmapped: result.unmapped,
    });
  }, [result]);

  return (
    <Page>
      <Title>Міграція legacy-колекцій у вузли</Title>
      <Intro>
        Вивантажте <code>users</code> і <code>newUsers</code> із консолі Firebase у JSON і оберіть
        файли тут. Інструмент зведе анкети по полях, розкладе їх по вузлах тим самим роутером, яким
        ходить кожне збереження, і віддасть файл на кожен вузол. База не читається і не пишеться —
        імпорт робите ви, подивившись звіт.
      </Intro>

      <Section>
        <SectionTitle>Джерела</SectionTitle>
        {SOURCES.map(source => (
          <SourceRow key={source.key}>
            <Button
              type="button"
              onClick={() => inputRefs.current[source.key]?.click()}
            >
              {source.label}
            </Button>
            <SourceState>
              {sources[source.key]
                ? `завантажено: ${countOf(sources[source.key])} записів`
                : source.hint}
            </SourceState>
            <input
              ref={element => { inputRefs.current[source.key] = element; }}
              type="file"
              accept="application/json,.json"
              aria-label={`Файл ${source.label}`}
              style={{ display: 'none' }}
              onChange={event => handlePick(source.key, event)}
            />
          </SourceRow>
        ))}
      </Section>

      <Section>
        <SectionTitle>Збірка</SectionTitle>
        <Label>
          <input
            type="checkbox"
            checked={mergeConflictingScalars}
            onChange={event => setMergeConflictingScalars(event.target.checked)}
          />
          конфліктні скаляри лишати обома значеннями (масивом)
        </Label>
        <SourceRow>
          <Button type="button" onClick={handleBuild} disabled={!canBuild || isBuilding}>
            {isBuilding ? 'Збираю…' : 'Зібрати вузли'}
          </Button>
        </SourceRow>
      </Section>

      {result && (
        <Section>
          <SectionTitle>Звіт</SectionTitle>
          <Report>{formatReport(result)}</Report>
          <SourceRow style={{ marginTop: 12 }}>
            {MIGRATION_NODES.map(node => (
              <Button key={node} type="button" onClick={() => handleDownloadNode(node)}>
                {`${node} (${countOf(result.payload[node])})`}
              </Button>
            ))}
            <Button type="button" onClick={handleDownloadReport}>звіт JSON</Button>
          </SourceRow>
        </Section>
      )}
    </Page>
  );
};

export default RtdbMigrationTool;
