// Normalize each item before deduplication; never stringify an entire array.
export const comparisonValues = value => {
  if (Array.isArray(value)) return value.flatMap(comparisonValues);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
};

export const mergeComparisonValues = (source, target) => (
  [...new Set([...comparisonValues(target), ...comparisonValues(source)])]
);

// The personal record supersedes the old embedded comment, including an empty edit.
export const currentPersonalComment = (legacy, stored) => (
  String(stored?.text ?? legacy ?? '').trim()
);
