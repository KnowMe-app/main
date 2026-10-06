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
import { AgencyProgramsPanel } from './ProgramsView';

/*
 * Чим картка агенції, клініки чи біологічних батьків каже про себе в стрічці.
 *
 * Донорку описують зріст, вага й пологи, і для неї рядок лишається як був.
 * Агенцію ж описують програми, а батьків — кого вони шукають; їхній зріст
 * донорці не каже нічого, а раніше рядок показував саме його.
 *
 * Агенцію ж описують програми — списком, по рядку на програму
 * (`AgencyProgramsPanel`), просто в тілі картки під іменем. Досі вони стояли
 * карусельлю повних карток **над** іменем, і хто це, читач дізнавався аж
 * під першою програмою.
 *
 * Програми дочитуються тут, коли картка вже в списку (`ensureCardPrograms`),
 * і спершу з `localStorage`: картка несе лише версію програм (`programsAt`).
 * Коли людина має дві ролі (донорка, яка ще й агентка), блок стоїть другою
 * анкетою під першою й підписаний роллю.
 */

const TEXT = 'var(--matching-header-text, var(--km-text, #1e1b18))';
const MUTED = 'var(--matching-muted-text, var(--km-muted, #6f675f))';

const Block = styled.div`
  color: ${TEXT};
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
`;

const RoleHeading = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${MUTED};
`;

// Назва — власна назва організації, тож без верхнього регістру підпису ролі.
const AgencyName = styled.span`
  text-transform: none;
  letter-spacing: 0;
  font-size: 13px;
  color: ${TEXT};
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
export const useCardPrograms = (card, enabled = true) => {
  useProgramsVersion();
  const at = readCardProgramsAt(card);
  const id = card?.userId || card?.id;
  useEffect(() => {
    if (enabled && at && id) ensureCardPrograms({ userId: id, programsAt: at });
  }, [at, enabled, id]);
  return enabled ? resolveCardPrograms(card) : { programs: [], loaded: true };
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

export const CardRoleBlock = ({ card, programsContext, language, showPrograms = true, accent = '' }) => {
  const roles = listProfileRoles(card);
  const isOrganisation = roles.some(role => ORGANISATION_ROLES.includes(role));
  const isParent = roles.includes('ip');
  const isAlsoPerson = roles.some(role => PERSON_ROLES.includes(role));
  const { programs } = useCardPrograms(card, isOrganisation && showPrograms);
  const seeking = pickText(card?.seeking);
  const hasParentContent = isParent && (seeking || pickText(card?.programLocation));
  // Назва агенції чи клініки окремо від імені людини (`agencyName`): у
  // картці з двома ролями імʼя в шапці — людини, а організація називає себе
  // тут, над своїми програмами.
  // A split organisation row deliberately removes its person role. The
  // dedicated organisation name still belongs to that row and must not
  // disappear merely because `isAlsoPerson` is false in the scoped card.
  const agencyName = isOrganisation ? pickText(card?.agencyName) : '';
  if (!hasParentContent && !(isOrganisation && (programs.length || agencyName))) return null;
  const organisationRole = roles.find(role => ORGANISATION_ROLES.includes(role));

  return (
    <Block onClick={event => event.stopPropagation()}>
      {/* Назву організації шапка рядка вже показує (`ProfileRow`), коли рядок
          — сама організація; підпис ролі з назвою потрібен лише тоді, коли
          шапка належить людині, а організація — друга анкета картки. */}
      {isOrganisation && isAlsoPerson && (programs.length || agencyName) ? (
        <RoleHeading>
          {getRoleLabel(organisationRole, language)}
          {agencyName ? <AgencyName> · {agencyName}</AgencyName> : null}
        </RoleHeading>
      ) : null}
      {hasParentContent ? (
        <Line>
          {seeking && SEEKING_PHRASES[seeking] ? <><b>{uiText('Шукають', language)}:</b> {uiText(SEEKING_PHRASES[seeking], language)}</> : null}
          {pickText(card?.programLocation) ? ` · ${pickText(card.programLocation)}` : ''}
          {card?.parentVia ? ` · ${uiText(labelOf(PARENT_VIA_OPTIONS, pickText(card.parentVia)).toLowerCase(), language)}` : ''}
        </Line>
      ) : null}
      {showPrograms && isOrganisation && programs.length && programsContext ? (
        <AgencyProgramsPanel
          card={card}
          accent={accent}
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
