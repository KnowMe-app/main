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

/**
 * «Хто завів цю картку» — окремим вузлом, бо шлях до чернетки починається з
 * автора, а знайшов читач саму картку.
 *
 * Чернетка лежить у `multiData/profileMutations/{автор}/{картка}`, і піддерево
 * автора відкрите рівно авторові. Пошук же дає з `searchId` самий лише id
 * картки — автора з нього не дістати, — тож прочитати знайдену чужу чернетку
 * можна було єдиним способом: узяти **вузол цілком**. А це службове читання
 * («хто що завів по всій базі»), і має його адмін та власник
 * `canCreateProfiles`. Звичайному читачеві пошук за точним номером відповідав
 * «немає такої» — і пропонував завести картку, яку база тут же відхиляла
 * з `DUPLICATE_PROFILE`: номер тримає заявка на унікальність.
 *
 * Тому тут лежить `{картка}: {автор}` — рівно стільки, щоб скласти шлях до
 * однієї чернетки, яку читач уже знайшов за точним контактом. Перелічити вузол
 * (тобто дізнатись усі id чернеток) і далі може лише службовий читач: `.read`
 * на корені — адмінський, на ключі — для кожного авторизованого. Це та сама
 * форма, що й у `searchId`.
 */
export const PROFILE_MUTATION_OWNERS_NODE = 'multiData/profileMutationOwners';

export const getProfileMutationOwnerPath = cardId => (
  cardId ? `${PROFILE_MUTATION_OWNERS_NODE}/${cardId}` : ''
);

/** Чернетка, яку вже прийняли або здали в архів, живе далі як звичайна анкета. */
export const INDEXABLE_DRAFT_STATUSES = new Set(['private', 'pendingReview', 'publishing']);

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
