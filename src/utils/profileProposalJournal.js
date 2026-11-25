import { push, ref, update } from 'firebase/database';

import { profileProposalPaths, usesUnifiedProposalStorage } from './profileProposalStoragePaths';

export const appendProfileProposalJournal = async (database, operation, cardId, entries) => {
  const root = operation === 'create' ? profileProposalPaths.createHistory : profileProposalPaths.updateHistory;
  const journal = ref(database, `${root}/${cardId}`);
  const changes = Object.fromEntries(entries.flatMap(entry => {
    const key = push(journal).key;
    if (!key) return [];
    const event = usesUnifiedProposalStorage ? { ...entry, operation, cardId } : entry;
    return [[key, event]];
  }));
  if (Object.keys(changes).length) await update(journal, changes);
};
