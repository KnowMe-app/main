export const encodeKey = key =>
  String(key)
    .replace(/\s/g, '_space_')
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/#/g, '_hash_')
    .replace(/\$/g, '_dollar_')
    .replace(/\//g, '_slash_')
    .replace(/\[/g, '_lbracket_')
    .replace(/\]/g, '_rbracket_');

export const buildSearchIndexCandidates = (searchKey, value) => {
  if (value === undefined || value === null) {
    return [];
  }

  const rawValue = String(value);
  const candidates = new Set([rawValue]);
  const trimmed = rawValue.trim();

  if (trimmed) {
    candidates.add(trimmed);
  }

  if (['phone', 'name', 'surname'].includes(searchKey)) {
    const withoutSpaces = rawValue.replace(/\s+/g, '');
    if (withoutSpaces) {
      candidates.add(withoutSpaces);
    }
  }

  if (searchKey === 'telegram') {
    const baseValues = [...candidates];
    baseValues.forEach(entry => {
      const encoded = encodeKey(entry);
      candidates.add(encoded);
      candidates.add(encodeKey(encoded));
    });
  }

  return [...candidates].map(item => item.toLowerCase()).filter(Boolean);
};
