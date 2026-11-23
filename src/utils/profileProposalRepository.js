import { auth } from 'components/config';
import { legacyCreateProposalAdapter } from './legacyCreateProposalAdapter';
import { legacyOverlayProposalAdapter } from './legacyOverlayProposalAdapter';
import { createProfileProposalService } from './profileProposalService';

// Обидва адаптери працюють з чинними адресами RTDB. Один старий шар на
// картку й автора — один слот. Другий ID для цього слота повертає конфлікт.
// Новий писач перевіряє знімок у транзакції. Старий UI ще може переписати
// шар звичайним set і зняти метадані сервісу. Спільний шлях запису й
// відновлення часткових операцій мають з'явитися разом із переходом.
export const profileProposalService = createProfileProposalService({
  handlers: { create: legacyCreateProposalAdapter, update: legacyOverlayProposalAdapter },
  getActorUid: () => auth.currentUser?.uid,
});
