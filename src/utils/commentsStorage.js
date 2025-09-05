const COMMENTS_KEY = 'commentsCache';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const loadComments = () => {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const result = {};
    Object.entries(parsed).forEach(([id, entry]) => {
      if (entry && (!entry.updatedAt || Date.now() - entry.updatedAt <= TTL_MS)) {
        result[id] = entry;
      }
    });
    return result;
  } catch {
    return {};
  }
};

export const saveComments = comments => {
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
  } catch {
    // ignore write errors
  }
};

export const setLocalComment = (id, text, updatedAt = Date.now()) => {
  const comments = loadComments();
  comments[id] = { text, updatedAt };
  saveComments(comments);
};

export const pruneComments = ids => {
  const existing = loadComments();
  const pruned = {};
  ids.forEach(id => {
    if (existing[id]) pruned[id] = existing[id];
  });
  saveComments(pruned);
};

export const getLocalComment = id => {
  const comments = loadComments();
  return comments[id]?.text || '';
};

