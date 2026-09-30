import React, { useEffect } from 'react';
import styled from 'styled-components';
import {
  PARENT_VIA_OPTIONS,
  resolveCardPrograms,
} from '../../utils/donorPrograms';
import { listProfileRoles } from '../../utils/matchingPeerVisibility';
import { getRoleLabel } from '../profileLayoutConfig';
import { ensureCardPrograms, readCardProgramsAt, useProgramsVersion } from '../../utils/programsStore';
import { uiText } from '../../utils/uiTranslations';
import { ProgramsSummary } from './ProgramsView';

/*
 * Чим картка агенції, клініки чи біологічних батьків каже про себе в стрічці.
 *
 * Донорку описують зріст, вага й пологи, і для неї рядок лишається як був.
 * Агенцію ж описують програми, а батьків — кого вони шукають; їхній зріст
 * донорці не каже нічого, а раніше рядок показував саме його.
 *
 * Програми дочитуються тут, коли картка вже в списку (`ensureCardPrograms`),
 * і спершу з `localStorage`: картка несе лише версію програм (`programsAt`).
 * Коли людина має дві ролі (донорка, яка ще й агентка), блок стоїть другою
 * анкетою під першою й підписаний роллю.
 */

const TEXT = 'var(--matching-header-text, var(--km-text, #1e1b18))';
const MUTED = 'var(--matching-muted-text, var(--km-muted, #6f675f))';
const BORDER = 'var(--matching-card-border, var(--km-border, #e7e1d8))';

const Block = styled.div`
  color: ${TEXT};
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 9px;
  border-top: 1px solid ${BORDER};
`;

const RoleHeading = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${MUTED};
`;

const Line = styled.div`
  font-size: 13px;
  color: ${MUTED};

  b { color: ${TEXT}; font-weight: 600; }
`;

const ORGANISATION_ROLES = ['ag', 'cl'];
const PERSON_ROLES = ['ed', 'sm'];

/** Картка, яку описують не тіло й пологи, а те, що вона пропонує чи шукає. */
export const isCounterpartyCard = card => {
  const roles = listProfileRoles(card);
  if (!roles.length || roles.some(role => PERSON_ROLES.includes(role))) return false;
  return roles.some(role => [...ORGANISATION_ROLES, 'ip'].includes(role));
};

const labelOf = (options, key) => options.find(option => option.key === key)?.label || '';

/** Дочитує програми картки, щойно вона у списку, і перемальовує, коли приїхали. */
export const useCardPrograms = card => {
  useProgramsVersion();
  const at = readCardProgramsAt(card);
  const id = card?.userId || card?.id;
  useEffect(() => {
    if (at && id) ensureCardPrograms({ userId: id, programsAt: at });
  }, [at, id]);
  return resolveCardPrograms(card);
};

// Кого шукають — знахідним відмінком, як читається рядок «Шукають: …».
const SEEKING_PHRASES = Object.freeze({
  ed: 'донорку ооцитів',
  sm: 'сурогатну маму',
  both: 'донорку й сурогатну маму',
});

const pickText = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  return String(raw ?? '').trim();
};

export const CardRoleBlock = ({ card, programsContext, language }) => {
  const roles = listProfileRoles(card);
  const isOrganisation = roles.some(role => ORGANISATION_ROLES.includes(role));
  const isParent = roles.includes('ip');
  const isAlsoPerson = roles.some(role => PERSON_ROLES.includes(role));
  const { programs } = useCardPrograms(card);
  const seeking = pickText(card?.seeking);
  const hasParentContent = isParent && (seeking || pickText(card?.programLocation));
  if (!hasParentContent && !programs.length) return null;
  const organisationRole = roles.find(role => ORGANISATION_ROLES.includes(role));

  return (
    <Block onClick={event => event.stopPropagation()}>
      {isOrganisation && isAlsoPerson && programs.length ? <RoleHeading>{getRoleLabel(organisationRole, language)}</RoleHeading> : null}
      {hasParentContent ? (
        <Line>
          {seeking && SEEKING_PHRASES[seeking] ? <><b>{uiText('Шукають', language)}:</b> {uiText(SEEKING_PHRASES[seeking], language)}</> : null}
          {pickText(card?.programLocation) ? ` · ${pickText(card.programLocation)}` : ''}
          {card?.parentVia ? ` · ${uiText(labelOf(PARENT_VIA_OPTIONS, pickText(card.parentVia)).toLowerCase(), language)}` : ''}
        </Line>
      ) : null}
      {programs.length && programsContext ? (
        <ProgramsSummary
          card={card}
          language={language}
          viewerType={programsContext.viewerType}
          facts={programsContext.facts}
          rates={programsContext.rates}
          displayCurrency={programsContext.displayCurrency}
          onDisplayCurrencyChange={programsContext.onDisplayCurrencyChange}
        />
      ) : null}
    </Block>
  );
};

export default CardRoleBlock;
