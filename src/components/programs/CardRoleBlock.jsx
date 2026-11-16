import React, { useEffect } from 'react';
import styled from 'styled-components';
import { ORG_FEATURE_OPTIONS, PROGRAMS_OWNER_ROLES, parseOrgFeatures, parseSeekingRoles, resolveCardPrograms } from '../../utils/donorPrograms';
import { describeProgramWishes } from '../../utils/parentWishes';
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
  font-size: 13px;
  font-weight: 600;
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

// Ознаки організації — світлими чипами під назвою (`orgFeatures`).
const FeatureChips = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--matching-chip-bg, var(--km-fill, #F0EDE8));
    font-size: 12.5px;
    color: ${TEXT};
  }
`;

// Перші рядки «Про нас» батьків: без них рядок батьків — імʼя, місто й
// «Шукають донорку», і сусідні картки нічим не різнились.
const About = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: ${TEXT};
  overflow-wrap: anywhere;
`;

// Що з побажань батьків збіглось з анкетою донорки — нагорі, бо саме це
// відрізняє одних батьків від інших для неї.
const MatchBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--km-success, #2E9B55) 9%, transparent);

  b { font-size: 13px; font-weight: 600; color: var(--km-success, #2E9B55); }
`;

const ORGANISATION_ROLES = ['ag', 'cl'];
const PERSON_ROLES = ['ed', 'sm'];

/** Картка, яку описують не тіло й пологи, а те, що вона пропонує чи шукає. */
export const isCounterpartyCard = card => {
  const roles = listProfileRoles(card);
  if (!roles.length || roles.some(role => PERSON_ROLES.includes(role))) return false;
  return roles.some(role => [...ORGANISATION_ROLES, 'ip'].includes(role));
};

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
// Батьки обирають кількох (`parseSeekingRoles`), тож рядок складається з
// частин: «донорку ооцитів, агенцію та клініку».
const SEEKING_PHRASES = Object.freeze({
  ed: 'донорку ооцитів',
  sm: 'сурогатну маму',
  ag: 'агенцію',
  cl: 'клініку',
});

export const describeSeekingRoles = (value, language) => {
  const parts = parseSeekingRoles(value).map(key => uiText(SEEKING_PHRASES[key], language));
  if (parts.length < 2) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} ${uiText('та', language)} ${parts[parts.length - 1]}`;
};

const pickText = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  return String(raw ?? '').trim();
};

export const CardRoleBlock = ({ card, programsContext, language, showPrograms = true, accent = '', contact = null }) => {
  const roles = listProfileRoles(card);
  const isOrganisation = roles.some(role => ORGANISATION_ROLES.includes(role));
  const isParent = roles.includes('ip');
  const isAlsoPerson = roles.some(role => PERSON_ROLES.includes(role));
  // Програми веде й організація, і батьки (той самий вузол програм) — і той
  // самий перелік власників, що й у фільтра та дочитування стрічки.
  const ownsPrograms = roles.some(role => PROGRAMS_OWNER_ROLES.includes(role));
  const { programs } = useCardPrograms(card, ownsPrograms && showPrograms);
  const seekingText = describeSeekingRoles(card?.seeking, language);
  // Рядок батьків до розгортання — лише «кого шукають»: це поле є в картці
  // стрічки (`seekingRole`), тож рядок не міняється, коли дочитується анкета.
  // Як шукають і де програма — у «Більше про біологічних батьків»
  // (`buildParentDetailSections`): тут вони зʼявлялись аж після дочитування,
  // і рядок підстрибував під пальцем.
  const hasParentContent = isParent && Boolean(seekingText);
  // Назва агенції чи клініки окремо від імені людини (`agencyName`): у
  // картці з двома ролями імʼя в шапці — людини, а організація називає себе
  // тут, над своїми програмами.
  // A split organisation row deliberately removes its person role. The
  // dedicated organisation name still belongs to that row and must not
  // disappear merely because `isAlsoPerson` is false in the scoped card.
  const agencyName = isOrganisation ? pickText(card?.agencyName) : '';
  const features = isOrganisation ? parseOrgFeatures(card?.orgFeatures) : [];
  const aboutShort = isParent ? pickText(card?.aboutShort) : '';
  // Збіги побажань — лише донорці й лише з донорських програм батьків.
  const matchedWishes = isParent && programsContext?.viewerType === 'ed' && programsContext?.facts
    ? [...new Map(programs
      .filter(program => program.type === 'ed')
      .flatMap(program => describeProgramWishes(program, language, programsContext.facts))
      .filter(item => item.ok === true)
      .map(item => [item.key, item])).values()]
    : [];
  if (!hasParentContent && !aboutShort && !features.length && !(ownsPrograms && programs.length) && !(isOrganisation && agencyName)) return null;
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
      {features.length ? (
        <FeatureChips data-testid="org-feature-chips" aria-label={uiText('Чим відрізняються', language)}>
          {features.map(key => (
            <li key={key}>{uiText(ORG_FEATURE_OPTIONS.find(option => option.key === key)?.label || key, language)}</li>
          ))}
        </FeatureChips>
      ) : null}
      {hasParentContent ? (
        <Line data-testid="parent-seeking">
          <b>{uiText('Шукають', language)}</b> {seekingText}
        </Line>
      ) : null}
      {aboutShort ? <About data-testid="parent-about-short">«{aboutShort}»</About> : null}
      {matchedWishes.length ? (
        <MatchBox data-testid="parent-wish-matches">
          <b>{uiText('Що збігається з вами', language)}</b>
          <FeatureChips>
            {matchedWishes.map(item => <li key={item.key}>✓ {item.text}</li>)}
          </FeatureChips>
        </MatchBox>
      ) : null}
      {showPrograms && ownsPrograms && programs.length && programsContext ? (
        <AgencyProgramsPanel
          card={card}
          accent={accent}
          language={language}
          viewerType={programsContext.viewerType}
          facts={programsContext.facts}
          rates={programsContext.rates}
          displayCurrency={programsContext.displayCurrency}
          onDisplayCurrencyChange={programsContext.onDisplayCurrencyChange}
          timeline={programsContext.timeline}
          contact={contact}
        />
      ) : null}
    </Block>
  );
};

export default CardRoleBlock;
