import { collectOverlaySearchIdValues, EDITS_ROOT } from './multiAccountEdits';

export { EDITS_ROOT as PROFILE_UPDATE_PROPOSALS_NODE };
export const PROFILE_PROPOSAL_ALIAS_FILE = 'profileProposalAliases';

// Для перебудови досить індексованих значень і цілі. Дані авторів,
// службові поля та журнал цьому файлу не потрібні.
export const collectUpdateProposalAliases = recordsByCard => Object.fromEntries(
  Object.entries(recordsByCard || {}).flatMap(([cardId, records]) => {
    const aliases = {};
    Object.entries(records || {}).forEach(([editorId, record]) => {
      if (!record || record.adminOnly || (record.cardUserId && record.cardUserId !== cardId)
        || (record.editorUserId && record.editorUserId !== editorId)) return;
      collectOverlaySearchIdValues(record).forEach(({ field, value }) => {
        (aliases[field] ??= new Set()).add(value);
      });
    });
    const fields = Object.entries(aliases).map(([field, values]) => [field, [...values]]);
    return fields.length ? [[cardId, Object.fromEntries(fields)]] : [];
  }),
);

export const keepProposalAliasesWithTargets = (aliases, profiles, drafts) => Object.fromEntries(
  Object.entries(aliases || {}).filter(([cardId]) => (
    Object.prototype.hasOwnProperty.call(profiles || {}, cardId)
    || Object.prototype.hasOwnProperty.call(drafts || {}, cardId)
  )),
);
