import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('дзеркалення анкет у matchingCards', () => {
  const config = () => read('config.js');

  it('оновлює картку після кожного запису анкети', () => {
    // Хук стоїть у самих писачах, а не у викликачів: правити анкету можна з
    // кількох екранів, і на котромусь із них його забули б поставити.
    const source = config();
    expect(source.match(/await refreshMatchingCardAfterProfileWrite\(userId, cleanedUploadedInfo, condition\);/g))
      .toHaveLength(2);
  });

  it('знімає картку разом з видаленням анкети', () => {
    // Інакше проєкція лишилась би висіти привидом, на який нічого не вказує.
    expect(config()).toContain('await removeMatchingCardIndex(userId);');
  });

  it('дає новій анкеті картку одразу при створенні', () => {
    expect(config()).toContain('await syncMatchingCardIndex(newUserId, newUser,');
  });

  it('пише ключ, за яким стрічка бере сторінку', () => {
    // Без ключа стрічки інкрементально оновлена картка не потрапила б у запит,
    // хоч і лежала б у вузлі.
    const index = read('../utils/matchingCardIndex.js');
    // `false` — теж значення ключа («сховали»), і воно мусить дійти до вузла:
    // без нього сховану анкету не відрізнити від тієї, яку ще не публікували.
    expect(index).toContain('if (feedDate || feedDate === false) projection[MATCHING_CARD_FEED_FIELD] = feedDate;');

    // І лише показаній картці з датою. Формат id тут ні до чого: анкета,
    // створена у вебі, має push-ключ, і умова «лише з акаунтів» не пускала б її
    // у стрічку ніколи.
    expect(index).toMatch(/if \(!normalizePublish\(data\?\.publish\)\) return '';/);
    expect(index).not.toContain("if (source !== 'users') return '';");
  });
});

describe('чим саме читається стрічка', () => {
  // Джерело стрічки одне — вузол проєкцій. Відкоту на повні анкети більше
  // немає: він читав legacy-колекцію, з якої веб не читає, і коштував порядок
  // величини трафіку на сторінку. Причини лишились — але тепер вони пояснюють
  // порожню стрічку, а не мовчазне сповзання.
  it('називає причину, коли індексу немає або він не читається', () => {
    const provider = read('../utils/matchingDataProvider.js');
    ['index-empty', 'pager-unavailable']
      .forEach(reason => expect(provider).toContain(`reportFeedSource('matchingCards', '${reason}')`));
    expect(provider).not.toContain('new-users-deck');
    expect(provider).not.toContain("reportFeedSource('profiles'");
    expect(provider).toContain("reportFeedSource('matchingCards', 'index-read-failed', error)");
    expect(provider).toContain("reportFeedSource('matchingCards', '')");
  });

  it('не має чим підмінити проєкції — і не вдає, що має', () => {
    const provider = read('../utils/matchingDataProvider.js');
    expect(provider).not.toContain('fetchUsersByLastLogin2');
    expect(provider).not.toContain('allowProfileFallback');
    expect(read('Matching.jsx')).not.toContain('fetchUsersByLastLogin2');
    expect(read('config.js')).not.toContain('fetchUsersByLastLogin2');
  });

  it('перекладає кожну причину на людську мову', () => {
    const source = read('Matching.jsx');
    const map = source.slice(
      source.indexOf('const FEED_SOURCE_FALLBACK_REASONS = {'),
      source.indexOf('const DEBUG_ADDITIONAL_MATCHING_USER_ID'),
    );
    ['index-empty', 'index-read-failed', 'pager-unavailable']
      .forEach(reason => expect(map).toContain(`'${reason}':`));
  });

  it('каже це лише тому, хто може перебудувати індекс', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('const canSeeFeedSourceNotice = access.isAdmin');
    expect(source).toContain('if (!canSeeFeedSourceNotice) return;');
  });

  it('несе код помилки, бо саме він і є відповіддю', () => {
    // PERMISSION_DENIED і «Index not defined» лікуються по-різному, а без коду
    // обидва виглядають однаково — просто «не вдалося прочитати».
    const provider = read('../utils/matchingDataProvider.js');
    expect(provider).toContain("reportFeedSource('matchingCards', 'index-read-failed', error)");
    expect(provider).toContain("const errorCode = String(error?.code || error?.name || '').trim();");
    expect(read('Matching.jsx')).toContain("const detail = [event?.errorCode, event?.errorMessage]");
  });

  it('не повторює ту саму причину за сесію', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('if (announcedFeedSourceRef.current.has(key)) return;');
  });
});
