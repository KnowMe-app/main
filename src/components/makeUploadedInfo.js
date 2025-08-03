export const makeUploadedInfo = (existingData, state, overwrite) => {
  let uploadedInfo = { ...existingData };

  for (const field in state) {
    if (
      field === 'lastAction' ||
      field === 'loadingCounter' ||
      field === 'lastLogin' ||
      field === 'lastLogin2' ||
      field === 'deviceResize' ||
      field === 'deviceHeight' ||
      field === 'deviceWidth' ||
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
        if (overwrite && [state[field]].length === 1) {
          console.log('Якщо масив має лише одне значення, зберігаємо його як ключ-значення');
          uploadedInfo[field] = state[field];
        } else if (Array.isArray(state[field])) {
          if (field === 'photos') {
            uploadedInfo[field] = [...state[field]];
          } else {
            console.log('Розпилюємо стейт');
            uploadedInfo[field] = [...state[field]];
          }
        } else {
            console.log('Ключ є, записуємо / перезаписуємо як останній елемент масиву');
            const updatedField = existingData[field].filter(item => item !== state[field]);
            updatedField.push(state[field]);
            uploadedInfo[field] = updatedField;
          }
        }else if (overwrite && state[field]===''&& !Array.isArray(existingData[field])){
        console.log('Якщо це не масиви', state[field], existingData[field]);
        uploadedInfo[field] = '';
      } else if (overwrite && !Array.isArray(state[field]==='') && !Array.isArray(existingData[field])){
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
        const updatedField = state[field].filter(item => item !== existingData[field]);
        uploadedInfo[field] = [existingData[field], ...updatedField]
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