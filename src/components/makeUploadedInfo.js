export const makeUploadedInfo = (existingData, state, overwrite) => {
  let uploadedInfo = { ...existingData };

  for (const field in state) {
    const value =
      Array.isArray(state[field]) && state[field].length === 1
        ? state[field][0]
        : state[field];

    if (
      field === 'lastAction' ||
      field === 'loadingCounter' ||
      field === 'lastLogin' ||
      field === 'lastLogin2' ||
      field === 'deviceResize' ||
      field === 'deviceHeight' ||
      field === 'deviceWidth' ||
      field === 'modifiedUser' ||
      field === 'saved_age' ||
      field === 'saved_height' ||
      field === 'saved_weight' ||
      field === 'saved_reward' ||
      field === 'saved_eyeColor' ||
      field === 'saved_blood' ||
      field === 'saved_country'
    ) {
      uploadedInfo[field] = value;
    } else if (existingData?.hasOwnProperty(field) && existingData[field] !== value) {
      if (Array.isArray(existingData[field])) {
        console.log('ExistingData на сервері є масивом');
        if (overwrite && !Array.isArray(value)) {
          console.log('Якщо масив має лише одне значення, зберігаємо його як ключ-значення');
          uploadedInfo[field] = value;
        } else if (Array.isArray(value)) {
          if (field === 'photos') {
            uploadedInfo[field] = [...value];
          } else {
            console.log('Розпилюємо стейт');
            uploadedInfo[field] = [...value];
          }
        } else {
          console.log('Ключ є, записуємо / перезаписуємо як останній елемент масиву');
          const updatedField = existingData[field].filter(item => item !== value);
          updatedField.push(value);
          uploadedInfo[field] = updatedField;
        }
      } else if (overwrite && typeof value === 'string' && value === '' && !Array.isArray(existingData[field])) {
        console.log('Якщо це не масиви', value, existingData[field]);
        uploadedInfo[field] = '';
      } else if (overwrite && !Array.isArray(value) && !Array.isArray(existingData[field])) {
        console.log('Якщо ЕxistingData не масив та state не масив і його треба перезаписати', value, existingData[field]);
        uploadedInfo[field] = value;
      } else if (existingData[field] === '') {
        console.log('Якщо це не масиви', value, existingData[field]);
        uploadedInfo[field] = value;
      } else if (!Array.isArray(value)) {
        console.log('Якщо ЕxistingData не масив та state не масив, то створюємо масив', value, existingData[field]);
        uploadedInfo[field] = [existingData[field], value];
      } else {
        console.log('ЕxistingData це не масив, а стейт це масив, дописуємо нові значення в масив', uploadedInfo.name);
        const updatedField = value.filter(item => item !== existingData[field]);
        uploadedInfo[field] = [existingData[field], ...updatedField];
      }
    } else if (!existingData?.hasOwnProperty(field) && value !== '') {
      if (field === 'postpone') {
        uploadedInfo[field] = Array.isArray(value) ? [...value] : value;
        // console.log('postpone на сервері не існує, створюємо, записуємо як перший елемент масиву', uploadedInfo[field]);
      } else {
        uploadedInfo[field] = value;
      }
      // console.log('Такого ключа на сервері не існує, створюємо, записуємо перше значення:', uploadedInfo[field]);
    }
  }
  return uploadedInfo;
};
