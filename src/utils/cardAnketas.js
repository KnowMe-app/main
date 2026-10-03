import { listProfileRoles } from './matchingPeerVisibility';

/*
 * Анкети, з яких складається картка стрічки.
 *
 * Людина буває у двох ролях одразу — донорка, яка ще й агентка. Картка
 * стрічки в неї одна (`matchingCards/{uid}`), і поки рядок малював її одним
 * блоком, плашка на фото казала основну роль («Агенція»), а під нею стояли
 * зріст, вага, пологи й донації — донорська анкета під підписом агенції.
 * Тепер така картка показується двома окремими анкетами: особистою (донорка
 * чи СМ — тіло, пологи, «Про себе») і анкетою організації (назва агенції чи
 * клініки й програми). Дані ті самі, розкладка — по ролі.
 *
 * Розщеплюється лише пара «людина + організація»: донорка й СМ користуються
 * тими самими полями анкети, тож дві їхні картки були б однаковими.
 */
const PERSON_ROLES = ['ed', 'sm'];
const ORGANISATION_ROLES = ['ag', 'cl'];

export const ANKETA_ROLE_KIND = Object.freeze({ person: 'person', organisation: 'organisation' });

export const listCardAnketaRoles = user => {
  const roles = listProfileRoles(user);
  const personRoles = roles.filter(role => PERSON_ROLES.includes(role));
  const organisationRoles = roles.filter(role => ORGANISATION_ROLES.includes(role));
  if (!personRoles.length || !organisationRoles.length) return [];
  const person = personRoles[personRoles.length - 1];
  const organisation = organisationRoles[organisationRoles.length - 1];
  // Порядок — той, у якому ролі лежать у картці: основна роль остання.
  return roles.indexOf(person) < roles.indexOf(organisation) ? [person, organisation] : [organisation, person];
};

export const isOrganisationAnketaRole = role => ORGANISATION_ROLES.includes(role);

/** Рядки стрічки для картки: роль анкети кожного, `''` — уся картка одним рядком. */
export const listFeedRowAnketaRoles = user => {
  const roles = listCardAnketaRoles(user);
  return roles.length ? roles : [''];
};
