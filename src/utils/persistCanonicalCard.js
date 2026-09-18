// Запис прийнятого доповнення в **канонічну** картку.
//
// Прийняти шар — це не «зберегти форму»: на екрані анкети може не бути зовсім
// (адмін переглядає чергу доповнень списком), а писати треба тим самим шляхом,
// яким пише форма, інакше анкета розійдеться з індексом. Шляхів два, і вибирає
// між ними формат id — та сама умова, що й у решті писачів: довгий id це
// Firebase-Auth UID, тобто анкета акаунта з legacy-дзеркалом, короткий — картка,
// заведена в застосунку, у якої тіла в `/users` немає й не буде.
//
// Індекс дописується **до** запису анкети: `syncUserSearchIdIndex` порівнює
// подане з тим, що лежить у базі зараз, тож після запису різниці вже не видно.
//
// Тримається це в одному місці навмисно: раніше та сама послідовність стояла
// всередині `EditProfile`, і другий екран, який приймає доповнення, мусив би її
// переписати — з шансом розійтись у дрібниці (`cacheVersion`, дзеркало,
// індекс), яку потім не знайти.
import {
  fetchUserById,
  syncUserSearchIdIndex,
  updateDataInFiresoreDB,
  updateDataInRealtimeDB,
  updateProfileNodesInRTDB,
} from 'components/config';
import { isLongFormatUserId } from 'utils/userIdFormat';

export const persistCanonicalCard = async mergedCard => {
  const userId = mergedCard?.userId;
  if (!userId) return;

  const existingData = (await fetchUserById(userId)) || {};
  await syncUserSearchIdIndex(userId, existingData, mergedCard);

  // `cacheVersion` — позначка кеша браузера, а не поле анкети: у базі їй місця
  // немає, і правила такого ключа не приймають.
  const cleanedState = { ...mergedCard };
  delete cleanedState.cacheVersion;

  if (isLongFormatUserId(userId)) {
    await updateDataInRealtimeDB(userId, cleanedState, 'update');
    await updateDataInFiresoreDB(userId, cleanedState, 'check');
    return;
  }

  await updateProfileNodesInRTDB(userId, cleanedState, 'update', true);
};
