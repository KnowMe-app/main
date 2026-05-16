import { MATCHING_PERFORMANCE_CACHE_TTL_MS } from './cacheConstants';

const COMMENTS_KEY = 'commentsCache';
export const COMMENTS_TTL_MS = MATCHING_PERFORMANCE_CACHE_TTL_MS;

const now = () => Date.now();

const isFresh = entry => {
  if (!entry) return false;
  const cachedAt = Number(entry.cachedAt || entry.lastAction || 0);
  return Boolean(cachedAt) && now() - cachedAt <= COMMENTS_TTL_MS;
};

const normalizeEntry = entry => {
  if (!entry || typeof entry !== 'object') return null;
  const cachedAt = Number(entry.cachedAt || entry.lastAction || now());
  return {
    ...entry,
    text: String(entry.text || ''),
    lastAction: Number(entry.lastAction || cachedAt),
    cachedAt,
    ...(entry.empty ? { empty: true } : {}),
  };
};

const isOwnerScopedCache = parsed =>
  parsed && typeof parsed === 'object' && Object.values(parsed).some(ownerValue => (
    ownerValue &&
    typeof ownerValue === 'object' &&
    Object.values(ownerValue).some(entry => entry && typeof entry === 'object' && ('cachedAt' in entry || 'text' in entry || 'empty' in entry))
  ));

const migrateFlatCache = parsed => {
  const ownerId = localStorage.getItem('ownerId') || '__local__';
  const scoped = { [ownerId]: {} };
  Object.entries(parsed || {}).forEach(([cardId, entry]) => {
    const normalized = normalizeEntry(entry);
    if (normalized && isFresh(normalized)) scoped[ownerId][cardId] = normalized;
  });
  return scoped;
};

export const loadComments = () => {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const scoped = isOwnerScopedCache(parsed) ? parsed : migrateFlatCache(parsed);
    const result = {};
    Object.entries(scoped || {}).forEach(([ownerId, ownerComments]) => {
      const freshOwnerComments = {};
      Object.entries(ownerComments || {}).forEach(([cardId, entry]) => {
        const normalized = normalizeEntry(entry);
        if (normalized && isFresh(normalized)) freshOwnerComments[cardId] = normalized;
      });
      if (Object.keys(freshOwnerComments).length) result[ownerId] = freshOwnerComments;
    });
    return result;
  } catch {
    return {};
  }
};

export const saveComments = comments => {
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments || {}));
  } catch {
    // ignore write errors
  }
};

export const getOwnerComments = ownerId => loadComments()[ownerId] || {};

export const getCachedComment = (ownerId, cardId) => {
  const entry = loadComments()?.[ownerId]?.[cardId];
  return isFresh(entry) ? entry : null;
};

export const setLocalComment = (...args) => {
  const [ownerIdOrCardId, cardIdOrText, textOrLastAction, maybeLastAction] = args;
  const hasOwner = args.length >= 3;
  const ownerId = hasOwner ? ownerIdOrCardId : (localStorage.getItem('ownerId') || '__local__');
  const cardId = hasOwner ? cardIdOrText : ownerIdOrCardId;
  const text = hasOwner ? textOrLastAction : cardIdOrText;
  const lastAction = hasOwner ? (maybeLastAction || now()) : (textOrLastAction || now());
  if (!ownerId || !cardId) return;
  const comments = loadComments();
  comments[ownerId] = comments[ownerId] || {};
  comments[ownerId][cardId] = { text: String(text || ''), lastAction, cachedAt: now(), empty: !String(text || '').trim() };
  saveComments(comments);
};

export const shouldUseServerComment = (server, local) => {
  if (!server) return false;
  if (!local) return true;
  return (server.lastAction || 0) > (local.lastAction || 0);
};

export const pruneComments = (ownerIdOrIds, maybeIds) => {
  const ownerScoped = Array.isArray(maybeIds);
  const ownerId = ownerScoped ? ownerIdOrIds : null;
  const ids = ownerScoped ? maybeIds : ownerIdOrIds;
  const keep = new Set((ids || []).filter(Boolean));
  const existing = loadComments();
  const pruned = {};
  Object.entries(existing).forEach(([currentOwnerId, ownerComments]) => {
    if (ownerId && currentOwnerId !== ownerId) {
      pruned[currentOwnerId] = ownerComments;
      return;
    }
    const nextOwnerComments = {};
    keep.forEach(id => {
      if (ownerComments?.[id]) nextOwnerComments[id] = ownerComments[id];
    });
    if (Object.keys(nextOwnerComments).length) pruned[currentOwnerId] = nextOwnerComments;
  });
  saveComments(pruned);
};

export const getLocalComment = (ownerIdOrCardId, maybeCardId) => {
  const ownerId = maybeCardId ? ownerIdOrCardId : (localStorage.getItem('ownerId') || '__local__');
  const cardId = maybeCardId || ownerIdOrCardId;
  const entry = getCachedComment(ownerId, cardId);
  return entry?.text || '';
};

export const isCommentCacheEntryFresh = isFresh;
