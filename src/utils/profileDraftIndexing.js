/**
 * Чернетки — це теж анкети, і в `searchId` вони мають бути.
 *
 * Чернетка живе в `multiData/profileMutations/{хто завів}/{id картки}` і
 * картки стрічки ще не має: `mergeProfileNodeCollections` її не бачить, бо
 * збирає анкети з пʼяти вузлів. Тож перебудова індексу, яка заливається
 * заміною вузла, зносила б рівно ті записи, які чернеткам і поставив
 * `saveCreateProfileMutation` — а це єдине, чим чернетка боронить себе від
 * дубля: «такий телефон уже заведено» питається саме індексу.
 *
 * Id чернетки не тимчасовий: `reserveProfileCardId` резервує його один раз, і
 * опублікована анкета лишається під ним же. Тож запис індексу переживає
 * публікацію і не потребує переписування.
 *
 * Беруться самі лише чернетки **створення**. Незбережена правка наявної
 * анкети (`operation: 'update'`) свої значення в анкету ще не поклала, і
 * індексувати їх означало б відповідати на пошук карткою, у якій набраного
 * немає.
 */
export const PROFILE_DRAFTS_INDEX_NODE = 'multiData/profileMutations';

/** Чернетка, яку вже прийняли або здали в архів, живе далі як звичайна анкета. */
const INDEXABLE_DRAFT_STATUSES = new Set(['private', 'pendingReview', 'publishing']);

export const collectDraftProfilesForIndexing = (mutationsByCreator = {}) => {
  const drafts = {};

  Object.values(mutationsByCreator || {}).forEach(creatorMutations => {
    if (!creatorMutations || typeof creatorMutations !== 'object') return;

    Object.entries(creatorMutations).forEach(([cardId, mutation]) => {
      if (!cardId || !mutation || typeof mutation !== 'object') return;
      if (mutation.operation !== 'create') return;
      if (!INDEXABLE_DRAFT_STATUSES.has(mutation.status)) return;

      const data = mutation.data;
      if (!data || typeof data !== 'object') return;

      drafts[cardId] = { ...data, userId: cardId };
    });
  });

  return drafts;
};
