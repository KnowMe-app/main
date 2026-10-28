/**
 * Звіти разових робіт над фото (панель індексації `AddNewProfile`) словами.
 *
 * Обидві роботи пишуть у Storage від імені адміна, а правила Storage пускають
 * туди лише повних адмінів: інспектор, який бачить панель, отримує відмову на
 * першому ж файлі, і «оновлено 0» без причини тут коштувало б розбору.
 */
const DENIED_HINT = 'Потрібен повний адмін: правила Storage пускають запис фото лише власниці й адмінам.';

const failureTail = failed => {
  if (!failed.length) return '';
  const denied = failed.some(entry => entry.permissionDenied);
  return `, помилок: ${failed.length}.${denied ? ` ${DENIED_HINT}` : ''}`;
};

export const describeAvatarCacheControlBackfill = (report = {}) => {
  if (report.listError) {
    const hint = report.listError.permissionDenied ? ` ${DENIED_HINT}` : '';
    return { tone: 'error', message: `Теку avatar не прочитано: ${report.listError.message}.${hint}` };
  }
  const failed = report.failed || [];
  const summary = `Анкет із фото: ${report.folders || 0}, файлів: ${report.files || 0}. Кеш на рік поставлено: ${report.updated || 0}`;
  if (!failed.length) return { tone: 'success', message: `${summary}.` };
  return { tone: 'error', message: `${summary}${failureTail(failed)}` };
};

export const describeFeedPhotoThumbsBackfill = (report = {}) => {
  if (report.readError) {
    const hint = report.readError.permissionDenied ? ` ${DENIED_HINT}` : '';
    return { tone: 'error', message: `Картки не прочитано: ${report.readError.message}.${hint}` };
  }
  const failed = report.failed || [];
  const summary = `Карток: ${report.cards || 0}. Мініатюр створено: ${(report.written || []).length}`
    + ` з ${report.candidates || 0}, уже були: ${report.already || 0}`;
  if (!failed.length) return { tone: 'success', message: `${summary}.` };
  return { tone: 'error', message: `${summary}${failureTail(failed)}` };
};
