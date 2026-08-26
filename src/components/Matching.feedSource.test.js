import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('дзеркалення анкет у matchingCards', () => {
  const config = () => read('config.js');

  it('оновлює картку після запису в обидві колекції', () => {
    // Хук стоїть у самих писачах, а не у викликачів: правити анкету можна з
    // кількох екранів, і на котромусь із них його забули б поставити.
    const source = config();
    expect(source).toContain("await refreshMatchingCardAfterProfileWrite('users', userId, cleanedUploadedInfo, condition);");
    expect(source).toContain("await refreshMatchingCardAfterProfileWrite('newUsers', userId, cleanedUploadedInfo, condition);");
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
    expect(index).toContain('if (feedDate) projection[MATCHING_CARD_FEED_FIELD] = feedDate;');

    // І лише показаній картці з датою, і лише з колекції `users`: наявність
    // ключа — це і є право показу, а стрічка збирається з однієї колекції.
    expect(index).toMatch(/if \(source !== 'users'\) return '';/);
    expect(index).toMatch(/if \(!normalizePublish\(data\?\.publish\)\) return '';/);
  });
});

describe('чим саме читається стрічка', () => {
  it('називає причину, коли сповзає з проєкцій на повні анкети', () => {
    const provider = read('../utils/matchingDataProvider.js');
    ['index-empty', 'pager-unavailable', 'new-users-deck']
      .forEach(reason => expect(provider).toContain(`reportFeedSource('profiles', '${reason}')`));
    expect(provider).toContain("reportFeedSource('profiles', 'index-read-failed', error)");
    expect(provider).toContain("reportFeedSource('matchingCards', '')");
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
    expect(provider).toContain("reportFeedSource('profiles', 'index-read-failed', error)");
    expect(provider).toContain("const errorCode = String(error?.code || error?.name || '').trim();");
    expect(read('Matching.jsx')).toContain("const detail = [event?.errorCode, event?.errorMessage]");
  });

  it('не повторює ту саму причину за сесію', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('if (announcedFeedSourceRef.current.has(key)) return;');
  });
});
