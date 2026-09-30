import React from 'react';
import styled from 'styled-components';
import {
  AGENCY_SERVICE_OPTIONS,
  PARENT_VIA_OPTIONS,
  resolveCardPrograms,
} from '../../utils/donorPrograms';
import { listProfileRoles } from '../../utils/matchingPeerVisibility';
import { uiText } from '../../utils/uiTranslations';
import { ProgramsSummary } from './ProgramsView';

/*
 * Чим картка агенції, клініки чи біологічних батьків каже про себе в стрічці.
 *
 * Донорку описують зріст, вага й пологи, і для неї рядок лишається як був.
 * Агенцію ж описують послуги й програми, а батьків — кого вони шукають; їхній
 * зріст донорці не каже нічого, а раніше рядок показував саме його.
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

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const Tag = styled.span`
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid ${BORDER};
  font-size: 12px;
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
  const services = String(card?.services || '').split(',').map(item => item.trim()).filter(Boolean);
  const { programs } = resolveCardPrograms(card);
  const facts = [
    pickText(card?.workLocations),
    card?.foundedYear ? uiText('з {year} року', language, { year: pickText(card.foundedYear) }) : '',
    card?.programsCompleted ? uiText('{count} програм проведено', language, { count: pickText(card.programsCompleted) }) : '',
  ].filter(Boolean);
  const seeking = pickText(card?.seeking);
  const hasOrgContent = isOrganisation && (services.length || facts.length || programs.length);
  const hasParentContent = isParent && (seeking || pickText(card?.programLocation));
  if (!hasOrgContent && !hasParentContent && !programs.length) return null;

  return (
    <Block onClick={event => event.stopPropagation()}>
      {isOrganisation && services.length ? (
        <Tags>
          {services.map(key => <Tag key={key}>{uiText(labelOf(AGENCY_SERVICE_OPTIONS, key) || key, language)}</Tag>)}
        </Tags>
      ) : null}
      {isOrganisation && facts.length ? <Line>{facts.join(' · ')}</Line> : null}
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
          onOpen={() => programsContext.onOpenPrograms?.(card)}
        />
      ) : null}
    </Block>
  );
};

export default CardRoleBlock;
