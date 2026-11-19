// Нещодавні групи Flow (19.11, на прохання власниці продукту). У великому
// Flow груп кілька, а підгруп — десятки, і шторка «Група запису» ставила їх
// абеткою: потрібну доводилось шукати щоразу. Тепер пристрій памʼятає, які
// шляхи («Група» чи «Група/Підгрупа») вживали останніми, і шторка ставить їх
// нагору; решта — абеткою, як було. Памʼять — на пристрої й на власника
// (адмін, що править чужий Flow, отримує свою, а не його), до 30 шляхів.
// Звідси ж — остання підгрупа кожної групи: дотик до групи повертає підгрупу,
// з якою її вживали востаннє, а не скидає на «Без підгрупи».

export const FLOW_RECENT_CATEGORIES_LIMIT = 30;

export const flowRecentCategoriesStorageKey = ownerId => `flow-recent-categories:${ownerId || 'anon'}`;

const splitPath = path => {
  const [group = '', ...rest] = String(path || '').split('/');
  return { group: group.trim(), subgroup: rest.join('/').trim() };
};

const cleanPath = path => {
  const { group, subgroup } = splitPath(path);
  if (!group) return '';
  return subgroup ? `${group}/${subgroup}` : group;
};

export const readFlowRecentCategories = ownerId => {
  try {
    const parsed = JSON.parse(localStorage.getItem(flowRecentCategoriesStorageKey(ownerId)) || '[]');
    return Array.isArray(parsed) ? parsed.map(cleanPath).filter(Boolean) : [];
  } catch {
    return [];
  }
};

// Шлях стає першим; той самий шлях не дублюється.
export const pushFlowRecentCategory = (recent, path) => {
  const cleaned = cleanPath(path);
  const list = Array.isArray(recent) ? recent : [];
  if (!cleaned) return list;
  if (list[0] === cleaned) return list;
  return [cleaned, ...list.filter(item => item !== cleaned)].slice(0, FLOW_RECENT_CATEGORIES_LIMIT);
};

export const writeFlowRecentCategories = (ownerId, recent) => {
  try {
    localStorage.setItem(flowRecentCategoriesStorageKey(ownerId), JSON.stringify(recent));
  } catch (error) {
    console.error('Unable to persist recent flow categories', error);
  }
};

// Ранг для сортування: менше — новіше; невживане — Infinity.
const rankBy = keys => {
  const rank = new Map();
  keys.forEach((key, index) => {
    if (!rank.has(key)) rank.set(key, index);
  });
  return key => (rank.has(key) ? rank.get(key) : Infinity);
};

const sortByRank = (items, rankOf) =>
  [...items].sort((a, b) => {
    const diff = rankOf(a) - rankOf(b);
    if (diff !== 0 && Number.isFinite(Math.min(rankOf(a), rankOf(b)))) return diff;
    return String(a).localeCompare(String(b));
  });

// Групи: нагорі ті, у яких щось вживали (група чи будь-яка її підгрупа).
export const sortFlowGroupsByRecent = (groups, recent) =>
  sortByRank(groups, rankBy((recent || []).map(path => splitPath(path).group)));

// Підгрупи однієї групи: нагорі вживані в ній останніми.
export const sortFlowSubgroupsByRecent = (group, subgroups, recent) =>
  sortByRank(
    subgroups,
    rankBy(
      (recent || [])
        .map(splitPath)
        .filter(item => item.group === group && item.subgroup)
        .map(item => item.subgroup)
    )
  );

// Повні шляхи (шторка «Перенести в групу»): нагорі вживані останніми.
export const sortFlowPathsByRecent = (paths, recent) => sortByRank(paths, rankBy(recent || []));

// Підгрупа, з якою групу вживали востаннє ('' — без підгрупи). Повертає
// `null`, коли групу ще не вживали, — тоді лишається поведінка «без підгрупи».
// Підгрупу, якої вже немає (перейменували чи видалили), пропускає.
export const lastFlowSubgroupFor = (group, recent, existingSubgroups = null) => {
  for (const path of recent || []) {
    const item = splitPath(path);
    if (item.group !== group) continue;
    if (!item.subgroup) return '';
    if (!existingSubgroups || existingSubgroups.includes(item.subgroup)) return item.subgroup;
  }
  return null;
};

// Кілька останніх шляхів, що досі існують, — рядок «Нещодавні» над групами.
export const listFlowRecentShortcuts = (recent, existingPaths, limit = 6) => {
  const existing = new Set(existingPaths || []);
  return (recent || []).filter(path => existing.has(path)).slice(0, limit);
};
