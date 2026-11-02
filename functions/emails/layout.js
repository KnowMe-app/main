'use strict';

/**
 * Спільна розкладка листів KnowMe: оболонка, марка, кнопка, посилання для
 * копіювання й підвал.
 *
 * Листів уже два (підтвердження пошти й зміна пароля), і виглядати вони мусять
 * однаково — це той самий бренд у тій самій скриньці. Поки розмітка жила в
 * одному шаблоні, другий лист означав би її копію, а копії розходяться з
 * першою ж правкою кольору.
 *
 * Таблиці й інлайн-стилі — бо поштові клієнти (Gmail, Outlook) зовнішніх стилів
 * не читають, а `<style>` частина з них викидає. Тому кожен колір стоїть двічі:
 * інлайном для світлої теми й класом у `<style>` для темної (Apple Mail, iOS,
 * Outlook; Gmail перефарбовує лист сам).
 */

const APP_URL = 'https://knowme.pp.ua';
const POLICY_URL = `${APP_URL}/policy`;

const FONT = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Мова листа: українська лишається українською, решта — англійська. */
const normalizeEmailLanguage = value => (String(value || '').trim().toLowerCase().startsWith('uk') ? 'uk' : 'en');

const escapeHtml = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Колір `hex`, змішаний з `baseHex` у пропорції `amount` (0–1). */
const mixHex = (hex, baseHex, amount) => {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(baseHex.slice(1), 16);
  const channel = shift => Math.round(((a >> shift) & 255) * amount + ((b >> shift) & 255) * (1 - amount));
  const value = (1 << 24) + (channel(16) << 16) + (channel(8) << 8) + channel(0);
  return `#${value.toString(16).slice(1).toUpperCase()}`;
};

const BASE_DARK_RULES = [
  '.km-bg{background:#14100C!important}',
  '.km-card{background:#1F1A15!important;border-color:#3A3128!important}',
  '.km-text{color:#FFF8EC!important}',
  '.km-body{color:#E9E1D3!important}',
  '.km-muted{color:#B8AE9F!important}',
  '.km-rule{border-color:#3A3128!important}',
  '.km-num{background:#3A2614!important;color:#F5A24B!important}',
  '.km-link{color:#F5A24B!important}',
  '.km-dot span{color:#F08A2C!important}',
].join('');

const wordmark = () =>
  `<div class="km-text km-dot" style="font-family:${FONT};font-size:22px;line-height:26px;font-weight:700;letter-spacing:-0.4px;color:#1A1A1A">KnowMe<span style="color:#C9600F">.</span></div>`;

const spacer = px => `<div style="height:${px}px;line-height:${px}px;font-size:0">&nbsp;</div>`;

const heading = text =>
  `<h1 class="km-text km-h1" style="margin:0 0 12px;font-family:${FONT};font-size:30px;line-height:36px;font-weight:700;letter-spacing:-0.5px;color:#1A1A1A">${escapeHtml(text)}</h1>`;

/** Абзац основного тексту; `html` уже екранований викликачем. */
const lead = html =>
  `<p class="km-body" style="margin:0 0 26px;font-size:16px;line-height:25px;color:#3A3A36">${html}</p>`;

const strong = text => `<b class="km-text" style="color:#1A1A1A;font-weight:600">${escapeHtml(text)}</b>`;

const button = (link, label) =>
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="km-btn"><tr>'
  + '<td align="center" bgcolor="#C9600F" style="border-radius:12px;background:#C9600F">'
  + `<a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:17px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:12px">${escapeHtml(label)}</a>`
  + '</td></tr></table>';

const note = text =>
  `<p class="km-muted" style="margin:14px 0 0;font-size:14px;line-height:21px;color:#62665F">${escapeHtml(text)}</p>`;

const rule = (top, bottom) =>
  `<div class="km-rule" style="border-top:1px solid #EEEAE4;margin:${top}px 0 ${bottom}px;font-size:0;line-height:0">&nbsp;</div>`;

const fallbackLink = (label, link) =>
  `<p class="km-muted" style="margin:0 0 6px;font-size:13px;line-height:19px;color:#62665F">${escapeHtml(label)}</p>`
  + `<p style="margin:0 0 22px;font-size:13px;line-height:19px;word-break:break-all"><a href="${escapeHtml(link)}" target="_blank" class="km-link" style="color:#9A470A;text-decoration:underline">${escapeHtml(link)}</a></p>`;

const signature = text =>
  `<p class="km-text" style="margin:0;font-size:15px;line-height:22px;font-weight:600;color:#1A1A1A">${escapeHtml(text)}</p>`;

/**
 * Документ листа цілком.
 * @param {object} o
 * @param {string} o.lang
 * @param {string} o.subject
 * @param {string} o.preheader
 * @param {string} o.cardHtml   — уміст картки (вже зібрані блоки)
 * @param {string} o.footerText — підвал під карткою (звичайний текст)
 * @param {string} o.policyLabel
 * @param {string} [o.extraDarkRules]
 * @param {boolean} [o.forceDark] — лише для прев'ю
 */
const renderShell = ({ lang, subject, preheader, cardHtml, footerText, policyLabel, extraDarkRules = '', forceDark = false }) => {
  const darkRules = BASE_DARK_RULES + extraDarkRules;
  // Прехедер — рядок під темою у списку вхідних. Пробіли нульової ширини після
  // нього не дають клієнтові дописати туди початок тексту листа.
  const preheaderPad = '&#8199;&#847;'.repeat(40);

  return '<!doctype html>'
    + `<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">`
    + '<head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="x-apple-disable-message-reformatting">'
    + '<meta name="color-scheme" content="light dark">'
    + '<meta name="supported-color-schemes" content="light dark">'
    + `<title>${escapeHtml(subject)}</title>`
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">'
    + '<style>'
    + 'body{margin:0;padding:0;-webkit-text-size-adjust:100%}'
    + 'a{text-decoration:none}'
    + '@media (max-width:600px){'
    + '.km-outer{padding:16px 10px 28px!important}'
    + '.km-card{padding:28px 22px 24px!important;border-radius:16px!important}'
    + '.km-h1{font-size:26px!important;line-height:32px!important}'
    + '.km-btn,.km-btn td{width:100%!important}'
    + '.km-btn a{display:block!important;box-sizing:border-box;text-align:center}'
    + '}'
    + `@media (prefers-color-scheme:dark){${darkRules}}`
    + '[data-ogsc] .km-card{background:#1F1A15!important}'
    + (forceDark ? darkRules : '')
    + '</style>'
    + '</head>'
    + '<body class="km-bg" style="margin:0;padding:0;background:#F3F0EB">'
    + `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F3F0EB;opacity:0">${escapeHtml(preheader)}${preheaderPad}</div>`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="km-bg" style="background:#F3F0EB">'
    + '<tr><td align="center" class="km-outer" style="padding:32px 16px 40px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">'
    + `<tr><td class="km-card" style="background:#FFFFFF;border:1px solid #E8E5E0;border-radius:20px;padding:36px 40px 32px;font-family:${FONT}">`
    + cardHtml
    + '</td></tr>'
    + `<tr><td style="padding:20px 8px 0;font-family:${FONT};text-align:center">`
    + `<p class="km-muted" style="margin:0 0 8px;font-size:12px;line-height:18px;color:#8A867F">${escapeHtml(footerText)}</p>`
    + `<p style="margin:0;font-size:12px;line-height:18px"><a href="${POLICY_URL}" target="_blank" class="km-link" style="color:#9A470A;text-decoration:underline">${escapeHtml(policyLabel)}</a></p>`
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
};

module.exports = {
  APP_URL,
  FONT,
  POLICY_URL,
  button,
  escapeHtml,
  fallbackLink,
  heading,
  lead,
  mixHex,
  normalizeEmailLanguage,
  note,
  renderShell,
  rule,
  signature,
  spacer,
  strong,
  wordmark,
};
