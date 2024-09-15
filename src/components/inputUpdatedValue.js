import {
  formatEmail,
  formatFacebook,
  formatInstagram,
  formatNumber,
  formatPhoneNumber,
  formatTelegram,
  formatDate,
  removeSpacesLeaveEnter,
  removeExtraSpaces,
} from './inputValidations';

export const inputUpdateValue = (value, field, data) => {
  return (
    // field.name === 'birth'
    field.name?.startsWith('birth')
      ? formatDate(value)
      : field.name === 'lastDelivery'
      ? formatDate(value, true)
      : field.name === 'opuDate'
      ? formatDate(value, true)
      : // : field.name === 'experience'
      // ? createOpuData(value)
      field.name === 'phone'
      ? formatPhoneNumber(value)
      : field.name === 'reward'
      ? formatNumber(value, 9999)
      : field.name === 'ownKids'
      ? formatNumber(value, 10)
      : field.name === 'shoeSize'
      ? value.slice(0, 2)
      : field.name === 'clothingSize'
      ? value.slice(0, 50)
      : field.name === 'weight' ||
        field.name === 'weightWife' ||
        field.name === 'weightHusband' ||
        field.name === 'height' ||
        field.name === 'heightWife' ||
        field.name === 'heightHusband'
      ? formatNumber(value, 250)
      : field.name === 'telegram'
      ? formatTelegram(value)
      : field.name === 'facebook'
      ? formatFacebook(value)
      : field.name === 'instagram'
      ? formatInstagram(value)
      : field.name === 'email'
      ? formatEmail(value)
      : field.name === 'experience'
      ? formatNumber(value, 16)
      : field.name?.startsWith('more')
      ? removeSpacesLeaveEnter(value)
      : removeExtraSpaces(value)
  );
};
