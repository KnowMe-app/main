export const makeUploadedInfo = (existingData, state, overwrite) => {
  const isPlainObject = value =>
    Object.prototype.toString.call(value) === '[object Object]';

  const stableNormalize = value => {
    if (Array.isArray(value)) {
      return value.map(item => stableNormalize(item));
    }

    if (isPlainObject(value)) {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = stableNormalize(value[key]);
          return acc;
        }, {});
    }

    return value;
  };

  const isDeepEqual = (left, right) =>
    JSON.stringify(stableNormalize(left)) === JSON.stringify(stableNormalize(right));

  const hasValueInArray = (arr, value) =>
    Array.isArray(arr) && arr.some(item => isDeepEqual(item, value));

  const dedupeArrayDeep = arr => {
    if (!Array.isArray(arr)) return arr;

    const result = [];
    arr.forEach(item => {
      if (!hasValueInArray(result, item)) {
        result.push(item);
      }
    });

    return result;
  };

  let uploadedInfo = { ...existingData };

  for (const field in state) {
    if (field.startsWith('device')) {
      continue;
    }

    if (
      field === 'lastAction' ||
      field === 'loadingCounter' ||
      field === 'lastLogin' ||
      field === 'lastLogin2' ||
      field === 'modifiedUser'||
      field === 'saved_age' || field === 'saved_height' || field === 'saved_weight' || field === 'saved_reward'|| field === 'saved_eyeColor' || field === 'saved_blood' || field === 'saved_country'
    ) {
      // console.log('Перезатираємо поле яке відправляємо');
      uploadedInfo[field] = state[field];
    }
    /////////////////////////////////////////////////////
     else if (existingData?.hasOwnProperty(field) &&
      // Дублікати пропускаємо
      existingData[field] !== state[field]
    ) {
      if (Array.isArray(existingData[field])) {
        console.log('ExistingData на сервері є масивом');
        if (overwrite && !Array.isArray(state[field])) {
          console.log('Якщо масив має лише одне значення, зберігаємо його як ключ-значення');
          uploadedInfo[field] = state[field];
        } else if (Array.isArray(state[field])) {
          if (field === 'photos') {
            uploadedInfo[field] = [...state[field]];
          } else {
            console.log('Розпилюємо стейт');
            uploadedInfo[field] = dedupeArrayDeep([...state[field]]);
          }
        } else {
            console.log('Ключ є, записуємо / перезаписуємо як останній елемент масиву');
            const updatedField = existingData[field].filter(item => !isDeepEqual(item, state[field]));
            updatedField.push(state[field]);
            uploadedInfo[field] = dedupeArrayDeep(updatedField);
          }
        }else if (overwrite && state[field]===''&& !Array.isArray(existingData[field])){
        console.log('Якщо це не масиви', state[field], existingData[field]);
        uploadedInfo[field] = '';
      } else if (overwrite && state[field] !== '' && !Array.isArray(state[field]) && !Array.isArray(existingData[field])){
        console.log('Якщо ЕxistingData не масив та state не масив і його треба перезаписати', state[field], existingData[field]);
        uploadedInfo[field] = state[field];
      } else if (existingData[field]===''){
        console.log('Якщо це не масиви', state[field], existingData[field]);
        uploadedInfo[field] = state[field];
      } else if (!Array.isArray(state[field])){
        console.log('Якщо ЕxistingData не масив та state не масив, то створюємо масив', state[field], existingData[field]);
        uploadedInfo[field] = [existingData[field], state[field]];
      } else {
        console.log('ЕxistingData це не масив, а стейт це масив, дописуємо нові значення в масив', uploadedInfo.name);
        const updatedField = state[field].filter(item => !isDeepEqual(item, existingData[field]));
        uploadedInfo[field] = dedupeArrayDeep([existingData[field], ...updatedField]);
      }
    } else if (!existingData?.hasOwnProperty(field) && state[field] !== '') {
      if (field === 'postpone') {
        uploadedInfo[field] = [state[field]];
        // console.log('postpone на сервері не існує, створюємо, записуємо як перший елемент масиву', uploadedInfo[field]);
      }
      uploadedInfo[field] = state[field];
      // console.log('Такого ключа на сервері не існує, створюємо, записуємо перше значення:', uploadedInfo[field]);
    }
  }
  return uploadedInfo;
};
