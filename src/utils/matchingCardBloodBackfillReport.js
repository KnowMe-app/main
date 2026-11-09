import { RULES_DEPLOY_HINT as DEPLOY_HINT } from './rulesDeployHint';

/**
 * Звіт разової дописки групи крові словами.
 *
 * «Дописано 0» без причини тут уже коштувало б розбору: до ручного
 * викочування правил кожен запис падає на `PERMISSION_DENIED`, і звіт мусить
 * назвати саме це, а не просто нуль.
 */
export const describeMatchingCardBloodBackfill = (report = {}) => {
  if (report.readError) {
    return { tone: 'error', message: `Картки не прочитано: ${report.readError.message}` };
  }
  const failed = report.failed || [];
  const written = (report.written || []).length;
  const summary = `Опублікованих карток: ${report.published || 0}. Дописано: ${written}, `
    + `уже були: ${report.unchanged || 0}, без групи в анкеті: ${report.noBlood || 0}`;
  if (!failed.length) return { tone: 'success', message: `${summary}.` };
  const denied = failed.filter(entry => entry.permissionDenied).length;
  const reason = denied ? ` ${DEPLOY_HINT}.` : '';
  return { tone: 'error', message: `${summary}, помилок: ${failed.length}.${reason}` };
};
