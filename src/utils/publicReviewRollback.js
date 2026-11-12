/**
 * Відкат правки чи видалення публічного відгуку, яку база відхилила.
 *
 * Правка й видалення йдуть через чергу записів пристрою (`utils/writeOutbox`) і
 * показуються одразу. Відмова повертає **той самий відгук** таким, яким він
 * був до дії, — а не весь список: між дією й відмовою могли зʼявитись чи
 * змінитись інші відгуки, і знімок цілого списку їх стер би.
 */
const byCreatedAt = (a, b) => (a?.createdAt || 0) - (b?.createdAt || 0);

export const restorePublicComment = (comments, previousComment) => {
  const list = Array.isArray(comments) ? comments : [];
  if (!previousComment?.id) return list;
  const index = list.findIndex(comment => comment.id === previousComment.id);
  if (index >= 0) {
    const next = [...list];
    next[index] = previousComment;
    return next;
  }
  return [...list, previousComment].sort(byCreatedAt);
};
