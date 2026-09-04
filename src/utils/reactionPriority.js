import { keepDonorCounterpartyCards } from './matchingPeerVisibility';

const isTruthyReactionValue = value => {
  if (typeof value === 'boolean') return value;
  return Boolean(value);
};

export const normalizePublish = value => {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value == null || value === '') return false;

  if (Array.isArray(value)) {
    return value.some(item => item === true || item === 'true');
  }

  if (typeof value === 'object') {
    return Object.values(value).some(item => item === true || item === 'true');
  }

  return Boolean(value);
};

export const normalizeReactionMap = map => {
  if (!map || typeof map !== 'object') return {};
  return Object.fromEntries(
    Object.entries(map).filter(([id, value]) => id && isTruthyReactionValue(value))
  );
};


export const uniqueTruthyReactionIds = maps => [
  ...new Set((maps || []).flatMap(map => Object.keys(normalizeReactionMap(map))))
];

export const buildSharedReactionCandidateIds = ({
  ownerIds = [],
  ownOwnerId,
  favoriteSnapshots = {},
  dislikeSnapshots = {},
  favorites = {},
  dislikes = {},
} = {}) => {
  const normalizedOwnOwnerId = String(ownOwnerId || '').trim();
  const orderedOwnerIds = [...new Set(ownerIds.filter(Boolean))];
  const sharedOwnerIds = orderedOwnerIds.filter(ownerId => ownerId !== normalizedOwnOwnerId);
  const ownDecisionIds = new Set([
    ...Object.keys(normalizeReactionMap(favoriteSnapshots[normalizedOwnOwnerId])),
    ...Object.keys(normalizeReactionMap(dislikeSnapshots[normalizedOwnOwnerId])),
  ]);
  const sharedReactionIds = uniqueTruthyReactionIds([
    ...sharedOwnerIds.map(sharedOwnerId => favoriteSnapshots[sharedOwnerId]),
    ...sharedOwnerIds.map(sharedOwnerId => dislikeSnapshots[sharedOwnerId]),
  ]);
  const appliedReactionIds = new Set([
    ...Object.keys(normalizeReactionMap(favorites)),
    ...Object.keys(normalizeReactionMap(dislikes)),
  ]);

  return sharedReactionIds.filter(id => appliedReactionIds.has(id) && !ownDecisionIds.has(id));
};

const mergeReactionMaps = maps =>
  Object.assign({}, ...maps.map(map => normalizeReactionMap(map)));

export const resolvePrioritizedReactionMaps = ({
  ownerIds = [],
  ownOwnerId,
  favoriteSnapshots = {},
  dislikeSnapshots = {},
} = {}) => {
  const normalizedOwnOwnerId = String(ownOwnerId || '').trim();
  const orderedOwnerIds = [...new Set(ownerIds.filter(Boolean))];
  const sharedOwnerIds = orderedOwnerIds.filter(ownerId => ownerId !== normalizedOwnOwnerId);

  const sharedFavorites = mergeReactionMaps(sharedOwnerIds.map(ownerId => favoriteSnapshots[ownerId]));
  const sharedDislikes = mergeReactionMaps(sharedOwnerIds.map(ownerId => dislikeSnapshots[ownerId]));
  const ownFavorites = normalizeReactionMap(favoriteSnapshots[normalizedOwnOwnerId]);
  const ownDislikes = normalizeReactionMap(dislikeSnapshots[normalizedOwnOwnerId]);

  const favorites = { ...sharedFavorites };
  const dislikes = { ...sharedDislikes };

  Object.keys(dislikes).forEach(userId => {
    delete favorites[userId];
  });

  Object.keys(ownFavorites).forEach(userId => {
    favorites[userId] = ownFavorites[userId];
    delete dislikes[userId];
  });

  Object.keys(ownDislikes).forEach(userId => {
    dislikes[userId] = ownDislikes[userId];
    delete favorites[userId];
  });

  return { favorites, dislikes };
};


export const getCanShowMatchingUserDebug = (user, { isAdmin = false } = {}) => {
  const userId = String(user?.userId || '').trim();
  const rawPublish = user?.publish;
  const normalizedPublish = normalizePublish(rawPublish);
  if (!userId) {
    return {
      canShow: false,
      excludedFunction: 'canShowMatchingUser',
      excludedCondition: '!user?.userId',
      exactReason: `no_userId:userId=${user?.userId ?? 'undefined'}`,
      excludedAtStage: 'final render guard',
      reasonCode: 'no_userId',
    };
  }

  if (isAdmin) {
    return {
      canShow: true,
      excludedFunction: 'canShowMatchingUser',
      excludedCondition: 'isAdmin === true',
      exactReason: `isAdmin=true,userId=${userId}`,
      excludedAtStage: 'final render guard',
      reasonCode: 'allowed_admin',
    };
  }

  // A card with a public comment is deliberately kept out of the general
  // matching feed - it stays fully searchable (search reads users/{userId}
  // directly, independent of this guard), just not surfaced in the deck.
  const normalizedPublicComment = String(user?.publicComment ?? '').trim();
  if (normalizedPublicComment) {
    return {
      canShow: false,
      excludedFunction: 'canShowMatchingUser',
      excludedCondition: 'Boolean(String(user.publicComment).trim())',
      exactReason: `public_comment_present:userId=${userId}`,
      excludedAtStage: 'final render guard',
      reasonCode: 'public_comment_present',
    };
  }

  // Видимість не залежить від того, звідки приїхала картка: колекція у вебі
  // одна. Право показу дає явний доступ — правила додаткового доступу кажуть
  // «цю картку показати цьому глядачеві» незалежно від `publish`.
  if (user?.__matchingAccessAllowed === false) {
    return {
      canShow: false,
      excludedFunction: 'canShowMatchingUser',
      excludedCondition: 'user.__matchingAccessAllowed === false',
      exactReason: `matchingAccessAllowed_false:userId=${userId},matchingAccessAllowed=${user?.__matchingAccessAllowed}`,
      excludedAtStage: 'final render guard',
      reasonCode: 'matching_access_denied',
    };
  }

  if (user?.__matchingAccessAllowed === true) {
    return {
      canShow: true,
      excludedFunction: 'canShowMatchingUser',
      excludedCondition: 'user.__matchingAccessAllowed === true',
      exactReason: `matchingAccessAllowed_true:userId=${userId}`,
      excludedAtStage: 'final render guard',
      reasonCode: 'allowed_matching_access_granted',
    };
  }

  if (!normalizedPublish && !isAdmin) {
    return {
      canShow: false,
      excludedFunction: 'canShowMatchingUser',
      excludedCondition: '!normalizedPublish && !isAdmin',
      exactReason: `users_publish_false_for_non_admin: rawPublish=${JSON.stringify(rawPublish)}, normalizedPublish=${normalizedPublish}, isAdmin=${isAdmin}, userId=${userId}`,
      excludedAtStage: 'final render guard',
      reasonCode: 'users_publish_false_for_non_admin',
      rawPublish,
      normalizedPublish,
    };
  }

  return {
    canShow: true,
    excludedFunction: 'canShowMatchingUser',
    excludedCondition: 'publish check passed',
    exactReason: `publish check passed: rawPublish=${JSON.stringify(rawPublish)}, normalizedPublish=${normalizedPublish}, userId=${userId}`,
    excludedAtStage: 'final render guard',
    reasonCode: 'allowed_users_publish_true',
    rawPublish,
    normalizedPublish,
  };
};

export const canShowMatchingUser = (user, options = {}) => (
  getCanShowMatchingUserDebug(user, options).canShow
);

const SHARED_REACTION_CANDIDATE_VIEW_MODES = new Set(['default', 'favorites', 'dislikes']);

/**
 * Чи це відповідь на запит, який ще актуальний.
 *
 * Раніше сюди входила ще й колекція: перемикання деки робило відповідь
 * застарілою. Деки тепер одна, тож лишились версія запиту й режим перегляду.
 */
const isCurrentMatchingAsyncResult = ({
  requestVersion,
  currentVersion,
  requestViewMode,
  currentViewMode,
} = {}) => requestVersion === currentVersion && requestViewMode === currentViewMode;

export const shouldApplySharedReactionCandidateResult = options => (
  SHARED_REACTION_CANDIDATE_VIEW_MODES.has(options?.requestViewMode) &&
  isCurrentMatchingAsyncResult(options)
);

export const mergeSharedReactionCandidateUsers = ({
  currentUsers = [],
  loadedUsers = [],
  candidateIds = [],
} = {}) => {
  const candidateIdSet = new Set((candidateIds || []).filter(Boolean));
  const map = new Map(
    (currentUsers || [])
      .filter(user => user?.userId && candidateIdSet.has(user.userId))
      .map(user => [user.userId, user])
  );

  (loadedUsers || []).forEach(user => {
    if (user?.userId && candidateIdSet.has(user.userId)) {
      map.set(user.userId, user);
    }
  });

  return Array.from(map.values());
};

export const mergeMatchingCandidateUsers = ({
  users = [],
  additionalAccessUsers = [],
  sharedReactionCandidateUsers = [],
  isAdmin = false,
  viewMode = 'default',
  hasAdditionalAccessRules = false,
  ownFavoriteUsers = {},
  ownDislikeUsers = {},
  favoriteUsers = ownFavoriteUsers,
  dislikeUsers = ownDislikeUsers,
  // Хто дивиться. Потрібно рівно для одного правила: у стрічці донорки лишаються
  // самі контрагенти (`keepDonorCounterpartyCards`). До пошуку й вкладок реакцій
  // воно не застосовується — там читачка питає про конкретну людину.
  viewerRole = '',
  viewerId = '',
} = {}) => {
  const isDefaultMode = viewMode === 'default';
  const baseUsers = isAdmin ? users : users.filter(user => canShowMatchingUser(user, { isAdmin }));

  // Правила додаткового доступу нічого не забирають — вони додають. Колекція
  // одна, і базова дека вже відфільтрована по `publish`; окремо надані картки
  // просто доливаються до неї.
  const canInjectCandidate = user => canShowMatchingUser(user, { isAdmin });

  if (isDefaultMode) {
    // Надана картка потрапляє в загальний список лише разом зі стрічкою.
    //
    // Правила додаткового доступу — це фільтр («ці роки, ця група крові»), а не
    // перелік окремо відкритих анкет, і читались вони по індексу, який знає всі
    // анкети, зокрема неопубліковані. Тобто в деку за замовчуванням заїжджали
    // картки, яких у стрічці немає за визначенням: у `matchingCards` вони без
    // `feedDate`, і жоден інший читач їх там не побачить. `feedDate` —
    // допуск до стрічки, і надання доступу не робить із фільтра винятку з
    // нього: неопублікована анкета лишається тим, що знаходить точковий пошук
    // за контактом, а не тим, що гортають у загальному списку.
    const grantedFeedCards = hasAdditionalAccessRules
      ? additionalAccessUsers.filter(user => (
        user?.userId && canInjectCandidate(user) && normalizePublish(user.publish)
      ))
      : [];

    // Хвіст списку належить пагінації.
    //
    // Надані картки вантажаться однією пачкою на вході й доливаються лише тоді,
    // коли загальна стрічка вичерпалась. Поки вони стояли після деки, кожна
    // дописана сторінка лягала **над** ними: унизу нічого не змінювалось, і
    // «Додано 2 картки — вони в кінці списку» було неправдою — приріст
    // знаходився тільки прокруткою вгору. Тож пачка з входу — це голова деки,
    // як і власні чернетки, а хвіст лишається за сторінками, які приїжджають
    // потім (зокрема за наданими картками, дочитаними після кінця стрічки).
    const grantedHead = grantedFeedCards.filter(user => user.__matchingAccessInitialBatch === true);
    const grantedTail = grantedFeedCards.filter(user => user.__matchingAccessInitialBatch !== true);
    const byId = new Map(
      [...grantedHead, ...baseUsers, ...grantedTail].map(user => [user.userId, user])
    );

    return keepDonorCounterpartyCards({
      users: Array.from(byId.values()).filter(
        user => user?.userId && !favoriteUsers[user.userId] && !dislikeUsers[user.userId]
      ),
      viewerRole,
      viewerId,
    });
  }

  const byId = new Map(baseUsers.map(user => [user.userId, user]));
  const injectCandidate = user => {
    if (!user?.userId) return;
    if (!canInjectCandidate(user)) return;
    const existing = byId.get(user.userId);
    if (existing) {
      byId.set(user.userId, { ...existing, ...user });
    } else {
      byId.set(user.userId, user);
    }
  };

  sharedReactionCandidateUsers.forEach(injectCandidate);

  const mergedUsers = Array.from(byId.values()).filter(canInjectCandidate);
  if (viewMode === 'favorites') {
    return mergedUsers.filter(
      user => Boolean(favoriteUsers[user.userId]) && !dislikeUsers[user.userId]
    );
  }

  if (viewMode === 'dislikes') {
    return mergedUsers.filter(
      user => Boolean(dislikeUsers[user.userId]) && !favoriteUsers[user.userId]
    );
  }

  return mergedUsers;
};


export const getReactionUserIds = reactionMap =>
  Object.keys(normalizeReactionMap(reactionMap));

export const hasPendingSharedReactionCandidates = ({
  reactionIds = [],
  sharedReactionIds = [],
  loadedIds = new Set(),
  reactionMap = {},
} = {}) => {
  const activeReactionMap = normalizeReactionMap(reactionMap);
  const sharedIds = new Set((sharedReactionIds || []).filter(Boolean));
  const loaded = loadedIds instanceof Set
    ? loadedIds
    : new Set(Array.from(loadedIds || []).filter(Boolean));

  return (reactionIds || []).some(id => (
    id &&
    sharedIds.has(id) &&
    activeReactionMap[id] &&
    !loaded.has(id)
  ));
};

export const buildReactionCardsPage = ({
  reactionMap = {},
  reactionIds,
  offset = 0,
  limit = 6,
  excludeIds = [],
} = {}) => {
  const ids = Array.isArray(reactionIds)
    ? [...new Set(reactionIds.filter(Boolean))]
    : getReactionUserIds(reactionMap);
  const exclude = new Set(
    Array.from(excludeIds || [])
      .map(id => String(id || '').trim())
      .filter(Boolean)
  );
  const safeLimit = Math.max(0, Number(limit) || 0);
  let cursor = Math.max(0, Number(offset) || 0);
  const pageIds = [];

  while (cursor < ids.length && pageIds.length < safeLimit) {
    const id = ids[cursor];
    cursor += 1;
    if (!id || exclude.has(id)) continue;
    pageIds.push(id);
  }

  const hasMore = ids.slice(cursor).some(id => id && !exclude.has(id));

  return {
    pageIds,
    nextOffset: cursor,
    hasMore,
    total: ids.length,
  };
};


export const loadReactionCardsPageRecords = async ({
  reactionIds = [],
  offset = 0,
  limit = 6,
  loadedIds = new Set(),
  fetchUsersByIds,
  mapUser = user => user,
  filterUsers = users => users,
  debugLog = null,
} = {}) => {
  if (typeof fetchUsersByIds !== 'function') {
    throw new TypeError('fetchUsersByIds is required');
  }

  const logDebug = typeof debugLog === 'function' ? debugLog : () => {};
  const collected = [];
  let nextOffset = Math.max(0, Number(offset) || 0);
  let hasMore = false;
  const safeLimit = Math.max(0, Number(limit) || 0);

  logDebug('records:start', {
    reactionIdsCount: reactionIds.length,
    offset: nextOffset,
    limit: safeLimit,
    loadedIdsCount: loadedIds.size,
  });

  while (collected.length < safeLimit && nextOffset < reactionIds.length) {
    const page = buildReactionCardsPage({
      reactionIds,
      offset: nextOffset,
      limit: Math.max(1, safeLimit - collected.length),
      excludeIds: loadedIds,
    });

    nextOffset = page.nextOffset;
    hasMore = page.hasMore;
    logDebug('records:page-built', {
      pageIds: page.pageIds,
      nextOffset: page.nextOffset,
      pageHasMore: page.hasMore,
      total: page.total,
      collectedCount: collected.length,
      loadedIdsCount: loadedIds.size,
    });
    if (page.pageIds.length === 0) {
      if (!page.hasMore) break;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const usersMap = await fetchUsersByIds(page.pageIds);
    logDebug('records:fetch-returned', {
      requestedIds: page.pageIds,
      returnedIds: Object.keys(usersMap || {}),
      missingIds: page.pageIds.filter(id => !usersMap?.[id]),
    });
    const mappedUsers = page.pageIds
      .map(id => usersMap?.[id])
      .filter(Boolean)
      .map(mapUser)
      .filter(Boolean)
      .filter(user => user?.userId && !loadedIds.has(user.userId));

    logDebug('records:mapped-users', {
      mappedIds: mappedUsers.map(user => user.userId),
      mappedCount: mappedUsers.length,
      skippedAlreadyLoadedIds: page.pageIds.filter(id => loadedIds.has(id)),
    });

    const idsProcessedOnPage = new Set(page.pageIds.filter(Boolean));
    const idsLoadedBeforeFiltering = new Set(loadedIds);
    const filteredUsers = filterUsers(mappedUsers) || [];
    logDebug('records:filter-returned', {
      beforeFilterIds: mappedUsers.map(user => user.userId),
      afterFilterIds: filteredUsers.map(user => user.userId),
      filteredOutIds: mappedUsers
        .map(user => user.userId)
        .filter(id => !filteredUsers.some(user => user.userId === id)),
    });
    filteredUsers.forEach(user => {
      if (collected.length < safeLimit && user?.userId && !idsLoadedBeforeFiltering.has(user.userId)) {
        collected.push(user);
      }
    });

    idsProcessedOnPage.forEach(id => loadedIds.add(id));
    logDebug('records:page-processed', {
      processedIds: Array.from(idsProcessedOnPage),
      collectedIds: collected.map(user => user.userId),
      loadedIdsCount: loadedIds.size,
      nextOffset,
      pageHasMore: page.hasMore,
    });

    if (!page.hasMore) break;
  }

  const finalHasMore = hasMore || reactionIds.slice(nextOffset).some(id => id && !loadedIds.has(id));
  logDebug('records:finish', {
    collectedIds: collected.map(user => user.userId),
    nextOffset,
    loadedIdsCount: loadedIds.size,
    finalHasMore,
  });

  return {
    users: collected,
    nextOffset,
    hasMore: finalHasMore,
  };
};

export const shouldApplyReactionPageResult = options => isCurrentMatchingAsyncResult(options);

export const readReactionSnapshotMaps = async ({
  ownerIds = [],
  fetchFavoriteUsers,
  fetchDislikeUsers,
  onWarning,
} = {}) => {
  const favoriteSnapshots = {};
  const dislikeSnapshots = {};
  const orderedOwnerIds = [...new Set(ownerIds.filter(Boolean))];
  await Promise.all(orderedOwnerIds.flatMap(ownerId => [
    Promise.resolve()
      .then(() => fetchFavoriteUsers(ownerId))
      .then(value => {
        favoriteSnapshots[ownerId] = value || {};
      })
      .catch(error => {
        favoriteSnapshots[ownerId] = {};
        if (typeof onWarning === 'function') {
          onWarning({ ownerId, type: 'favorites', error });
        }
      }),
    Promise.resolve()
      .then(() => fetchDislikeUsers(ownerId))
      .then(value => {
        dislikeSnapshots[ownerId] = value || {};
      })
      .catch(error => {
        dislikeSnapshots[ownerId] = {};
        if (typeof onWarning === 'function') {
          onWarning({ ownerId, type: 'dislikes', error });
        }
      }),
  ]));

  return { favoriteSnapshots, dislikeSnapshots };
};
