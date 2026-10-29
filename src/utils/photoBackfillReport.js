/**
 * Звіти разових робіт над фото (панель індексації `AddNewProfile`) словами.
 *
 * Обидві роботи пишуть у Storage від імені адміна, а правила Storage пускають
 * туди лише повних адмінів: інспектор, який бачить панель, отримує відмову на
 * першому ж файлі, і «оновлено 0» без причини тут коштувало б розбору.
 */
const DENIED_HINT = 'Потрібен повний адмін: правила Storage пускають запис фото лише власниці й адмінам.';

// Причину першої помилки — словами в самому тості: на телефоні консолі, куди
// `AddNewProfile` кладе повний звіт, немає, і «помилок: 2» не казало нічого.
const FAILURE_REASON_MAX_LENGTH = 140;

const failureTail = failed => {
  if (!failed.length) return '';
  const denied = failed.some(entry => entry.permissionDenied);
  if (denied) return `, помилок: ${failed.length}. ${DENIED_HINT}`;
  const first = failed[0] || {};
  const reason = String(first.message || '').trim();
  const shortReason = reason.length > FAILURE_REASON_MAX_LENGTH ? `${reason.slice(0, FAILURE_REASON_MAX_LENGTH)}…` : reason;
  const where = first.id || first.path || '';
  return `, помилок: ${failed.length}.${shortReason ? ` Перша${where ? ` (${where})` : ''}: ${shortReason}` : ''}`;
};

const withFullStop = text => (/[.!?…]$/.test(text) ? text : `${text}.`);

const LISTED_IDS_MAX = 5;
const listIds = ids => (ids.length > LISTED_IDS_MAX
  ? `${ids.slice(0, LISTED_IDS_MAX).join(', ')} і ще ${ids.length - LISTED_IDS_MAX}`
  : ids.join(', '));

const describeHosts = hosts => Object.entries(hosts || {})
  .sort(([, a], [, b]) => b - a)
  .map(([host, count]) => (Object.keys(hosts).length > 1 ? `${host} ${count}` : host))
  .join(', ');

export const describeAvatarCacheControlBackfill = (report = {}) => {
  if (report.listError) {
    const hint = report.listError.permissionDenied ? ` ${DENIED_HINT}` : '';
    return { tone: 'error', message: `Теку avatar не прочитано: ${report.listError.message}.${hint}` };
  }
  const failed = report.failed || [];
  const summary = `Анкет із фото: ${report.folders || 0}, файлів: ${report.files || 0}. Кеш на рік поставлено: ${report.updated || 0}`;
  if (!failed.length) return { tone: 'success', message: `${summary}.` };
  return { tone: 'error', message: withFullStop(`${summary}${failureTail(failed)}`) };
};

export const describeFeedPhotoThumbsBackfill = (report = {}) => {
  if (report.readError) {
    const hint = report.readError.permissionDenied ? ` ${DENIED_HINT}` : '';
    return { tone: 'error', message: `Картки не прочитано: ${report.readError.message}.${hint}` };
  }
  const failed = report.failed || [];
  const missing = report.missing || [];
  // Пропущене мініатюри не отримує свідомо (див. `backfillFeedPhotoThumbs`), і
  // причин дві різні: адреса поза Storage проєкту (Google Drive тощо) і файл з
  // чужої теки. Одним числом «не з теки анкети» вони читались як друге.
  const summary = `Карток: ${report.cards || 0}. Мініатюр створено: ${(report.written || []).length}`
    + ` з ${report.candidates || 0}, уже були: ${report.already || 0}`
    + (report.external ? `, пропущено фото поза Storage: ${report.external} (${describeHosts(report.externalHosts)})` : '')
    + (report.foreign ? `, пропущено фото з чужої теки: ${report.foreign}` : '');
  // Анкета посилається на файл, якого в Storage вже немає: робота тут не
  // винна, але картка показує порожнє фото, і адмінові треба знати, яка.
  const missingSentence = missing.length
    ? ` Фото, якого вже немає в Storage, — у ${missing.length}: ${listIds(missing.map(entry => entry.id))}.`
    : '';
  const message = `${withFullStop(`${summary}${failureTail(failed)}`)}${missingSentence}`;
  if (failed.length) return { tone: 'error', message };
  if (missing.length) return { tone: 'warning', message };
  return { tone: 'success', message };
};
