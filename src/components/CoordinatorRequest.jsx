import React from 'react';
import styled from 'styled-components';
import { uiText } from 'utils/uiTranslations';
import {
  buildCoordinatorPhoneLink,
  buildCoordinatorTelegramLink,
  resolveCoordinatorRequestLink,
} from 'utils/coordinatorContacts';

/*
 * Порожня видача з фільтром ролі — не «Немає доступних профілів», а привід
 * написати координаторові. Кейс 14.11: людина шукала сурогатну маму, побачила
 * порожній екран без причини й без дії — і видалила акаунт. Більшість СМ і
 * донорок анкету відкрито не публікують, тож пояснення каже саме це.
 *
 * Форми заявки (телефон, терміни, коментар) тут поки немає: вона потребує
 * нового вузла в базі й правил — окреме завдання. Лише месенджер і дзвінок.
 *
 * Змінні `--matching-*` мають запасні значення: той самий блок стоїть у
 * модалці видалення акаунта «Мого профілю», поза палітрою стрічки.
 */

const EXPLANATIONS = Object.freeze({
  sm: 'Більшість сурогатних мам не публікують анкету відкрито. Залиште запит — і координатор надішле добірку',
  ed: 'Більшість донорок не публікують анкету відкрито. Залиште запит — і координатор надішле добірку',
});
const DEFAULT_EXPLANATION = 'Не всі анкети опубліковані відкрито. Залиште запит — і координатор надішле добірку';

const Box = styled.section`
  display: grid;
  gap: 8px;
  margin: 8px 0;
  padding: 16px 14px;
  border-radius: 16px;
  background: var(--matching-card-bg, var(--km-surface, #fff));
  border: 1px solid var(--matching-card-border, var(--km-border, rgba(0, 0, 0, 0.1)));
  text-align: left;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--matching-header-text, var(--km-text, inherit));
`;

const Text = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--matching-muted-text, var(--km-muted, #6b6b6b));
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
`;

const ContactButton = styled.a`
  flex: 1 1 140px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 8px 14px;
  border-radius: 12px;
  border: 1px solid var(--matching-accent, var(--km-accent, #C9600F));
  background: ${({ $primary }) => ($primary ? 'var(--matching-accent, var(--km-accent, #C9600F))' : 'transparent')};
  color: ${({ $primary }) => ($primary ? 'var(--km-on-accent, #fff)' : 'var(--matching-accent, var(--km-accent, #C9600F))')};
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  box-sizing: border-box;

  &:focus-visible { outline: 2px solid var(--matching-accent, var(--km-accent, #C9600F)); outline-offset: 2px; }
`;

const CompactRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 8px;
  padding: 12px;
  font-size: 13px;
  color: var(--matching-muted-text, var(--km-muted, #6b6b6b));
`;

const CompactLink = styled.a`
  color: var(--matching-accent, var(--km-accent, #C9600F));
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;

`;

const linkProps = href => (href.startsWith('http')
  ? { href, target: '_blank', rel: 'noopener noreferrer' }
  : { href });

export const CoordinatorContactButtons = ({ language, onContact }) => {
  const telegram = buildCoordinatorTelegramLink();
  const phone = buildCoordinatorPhoneLink();
  // Невказаний контакт не показується: вимкнена кнопка лише обіцяла б канал,
  // якого немає.
  if (!telegram && !phone) return null;
  return (
    <Actions>
      {telegram && (
        <ContactButton
          $primary
          data-testid="coordinator-telegram"
          {...linkProps(telegram)}
          onClick={() => onContact?.('telegram')}
        >
          Telegram
        </ContactButton>
      )}
      {phone && (
        <ContactButton
          $primary={!telegram}
          data-testid="coordinator-phone"
          {...linkProps(phone)}
          onClick={() => onContact?.('phone')}
        >
          {uiText('Подзвонити', language)}
        </ContactButton>
      )}
    </Actions>
  );
};

const CoordinatorRequest = ({ role = '', language, compact = false, title, text, onContact }) => {
  if (compact) {
    const href = resolveCoordinatorRequestLink();
    if (!href) return null;
    return (
      <CompactRow data-testid="coordinator-request-compact">
        <span>{uiText('Не знайшли потрібну?', language)}</span>
        <CompactLink {...linkProps(href)} onClick={() => onContact?.('compact')}>
          {uiText('Залишити запит', language)}
        </CompactLink>
      </CompactRow>
    );
  }
  return (
    <Box data-testid="coordinator-request" aria-label={uiText('Запит координаторові', language)}>
      <Title>{title || uiText('Зараз немає публічних анкет під ці умови', language)}</Title>
      <Text>{text || uiText(EXPLANATIONS[role] || DEFAULT_EXPLANATION, language)}</Text>
      <CoordinatorContactButtons language={language} onContact={onContact} />
    </Box>
  );
};

export default CoordinatorRequest;
