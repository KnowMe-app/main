// Тост прогону «Публічні коментарі» (`backfillMatchingCardPublicReviewFlags`).
//
// Окремим модулем, бо текст тут — це і є результат роботи: число, яке цей
// прогін повертав раніше, читалось як «усі картки вже мають прапорець» і тоді,
// коли база не віддала жодного вузла. Тепер тост розводить три відповіді —
// «записано», «нема чого писати» і «не вдалося» — і для невдачі називає
// причину та картки, бо шукати їх очима по двохсот id — та сама робота, що вже
// зроблена в звіті.

const DEPLOY_HINT = 'Правила бази ще не викочені — npx firebase deploy --only database';
const LISTED_IDS_MAX = 5;

const listIds = ids => {
  const shown = ids.slice(0, LISTED_IDS_MAX).join(', ');
  const rest = ids.length - LISTED_IDS_MAX;
  return rest > 0 ? `${shown} і ще ${rest}` : shown;
};

export const describePublicReviewFlagBackfill = report => {
  const {
    readError = null,
    profilesWithComments = 0,
    alreadyFlagged = 0,
    missingCardIds = [],
    written = [],
    failed = [],
    batchError = null,
  } = report || {};

  if (readError) {
    return {
      tone: 'error',
      message: [
        `hasPublicReview не дописано: не прочитано вузол ${readError.node}.`,
        readError.permissionDenied ? `База відмовила в доступі (PERMISSION_DENIED).` : readError.message,
      ].filter(Boolean).join('\n'),
    };
  }

  const lines = [
    `Карток з відгуками: ${profilesWithComments}`,
    `Записано прапорець: ${written.length}`,
    `Уже мали прапорець: ${alreadyFlagged}`,
  ];
  // Картки без проєкції — не помилка прогону: писати прапорець нема куди, і
  // правило `$other` його туди й не пустило б. Але мовчати про них не можна:
  // відгук під ними в стрічці так само не видно.
  if (missingCardIds.length) {
    lines.push(`Без картки в matchingCards (пропущено): ${missingCardIds.length} — ${listIds(missingCardIds)}`);
  }

  if (failed.length) {
    const denied = failed.filter(entry => entry.permissionDenied);
    lines.push(`Не вдалося: ${failed.length} — ${listIds(failed.map(entry => entry.profileId))}`);
    if (denied.length === failed.length) {
      lines.push(`База відмовила (PERMISSION_DENIED) усім. ${DEPLOY_HINT}`);
    } else {
      const other = failed.find(entry => !entry.permissionDenied);
      if (denied.length) lines.push(`PERMISSION_DENIED: ${denied.length}`);
      if (other) lines.push(`${other.profileId}: ${other.message}`);
    }
    return { tone: 'error', message: lines.join('\n') };
  }

  // Пакет упав, а поштучно все лягло — це успіх, але причину пакета варто
  // бачити: зазвичай її дає одна картка, яку правило `$uid.validate` не пускає.
  if (batchError && written.length) {
    lines.push(`Пакетний запис відхилено (${batchError.message}), дописано поштучно.`);
  }

  if (!written.length) {
    lines.unshift(profilesWithComments ? 'Нема чого дописувати.' : 'Відгуків у базі немає.');
    return { tone: 'success', message: lines.join('\n') };
  }
  lines.unshift('hasPublicReview дописано.');
  return { tone: 'success', message: lines.join('\n') };
};
