const fs = require('fs');
const path = require('path');

const config = () => fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

/**
 * Анкета підмішує позначки власника однієї картки, а не всю мапу.
 *
 * Мапа `multiData/getInTouch/{власник}` в адміна важила 160 КБ і приїжджала
 * на кожному вході разом із власною анкетою, яку `App.jsx` читає заради прав.
 */
describe('позначки власника в анкеті', () => {
  it('readProfileFromNodes читає позначку картки точково', () => {
    const source = config();
    const reader = source.slice(
      source.indexOf('export const readProfileFromNodes = async'),
      source.indexOf('export const fetchUsersByIds = async'),
    );
    expect(reader).not.toContain('readOwnerGetInTouchMap(ownerId)');
    expect(reader).not.toContain('readOwnerWriterMap(ownerId)');
    expect(reader).toContain('readOwnerValueForProfile(OWNER_GET_IN_TOUCH_PATH, ownerId, id, { hasLegacyGroups: ownerGetInTouchHasLegacyGroups })');
  });

  it('бере мапу, коли її вже завантажив екран, якому вона потрібна', () => {
    const source = config();
    const helper = source.slice(
      source.indexOf('const readOwnerValueForProfile = async'),
      source.indexOf('/** Скидає памʼять — після власного запису або зміни власника. */'),
    );
    expect(helper).toContain('const loadedMap = ownerValueMapCache.get(');
    expect(helper).toMatch(/get\(ref2\(database, `\$\{path\}\/\$\{owner\}\/\$\{id\}`\)\)/);
  });

  it('запис позначки не читає мапу заради попереднього значення', () => {
    const source = config();
    const writer = source.slice(source.indexOf('const setOwnerValue = async'), source.indexOf('export const readOwnerGetInTouchMap'));
    expect(writer).not.toContain('await readOwnerValueMap(path, owner)');
    expect(writer).toContain('await readOwnerValueForProfile(path, owner, id)');
  });
});

describe('фото на «Моєму профілі»', () => {
  it('читає список фото один раз на анкету, а не на кожен рендер', () => {
    const photos = fs.readFileSync(path.join(__dirname, 'Photos.jsx'), 'utf8');
    expect(photos).toContain("const remotePhotosRef = useRef({ userId: '', promise: null, applied: false });");
    expect(photos).toContain('promise: getAllUserPhotos(state.userId)');
  });
});
