import { auth } from 'components/config';
import { createProfileProposalAdapter } from './createProfileProposalAdapter';
import { updateProfileProposalAdapter } from './updateProfileProposalAdapter';
import { createProfileProposalService } from './profileProposalService';

// Сервіс визначає автора, ревізію та спільні дії. Адаптери лишаються межами
// застосування: створити анкету або застосувати окрему зміну до її цілі.
// Обидві операції використовують один обраний набір шляхів RTDB.
export const profileProposalService = createProfileProposalService({
  handlers: { create: createProfileProposalAdapter, update: updateProfileProposalAdapter },
  getActorUid: () => auth.currentUser?.uid,
});
