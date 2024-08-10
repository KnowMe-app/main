export const makeUploadedInfo = (existingData, state) => {
  let uploadedInfo = { ...existingData };

  for (const field in state) {
    if (
      field === 'loadingCounter' ||
      field === 'lastLogin' ||
      field === 'deviceResize' ||
      field === 'deviceHeight' ||
      field === 'deviceWidth' ||
      field === 'modifiedUser'||
      field === 'saved_age' || field === 'saved_height' || field === 'saved_weight' || field === 'saved_reward'|| field === 'saved_eyeColor' || field === 'saved_blood' || field === 'saved_country'

      // || field === 'areTermsConfirmed'
    ) {
      // console.log('Перезатираємо поле яке відправляємо');
      uploadedInfo[field] = state[field];
    }
    /////////////////////////////////////////////////////
     else if (
      existingData?.hasOwnProperty(field) &&
      // Дублікати пропускаємо
      existingData[field] !== state[field]
    ) {
      // console.log('ExistingData на сервері має хоча б одне заповнене поле');
      if (Array.isArray(existingData[field])) {
        // console.log('ExistingData на сервері є масивом: ', existingData[field]);
        /////////////////////////////////////////////////////
        if (field === 'coordinate') {
          // console.log('Поле яке відправляємо це coordinate');
          const isDuplicate = item => item.latitude === state[field].latitude && item.longitude === state[field].longitude;
          const updatedField = existingData[field].filter(item => !isDuplicate(item));
          updatedField.push(state[field]);
          uploadedInfo[field] = updatedField;
          // console.log("Додаємо новий об'єкт / переносимо в кінець масиву повтор:", uploadedInfo[field]);
        }
     
         else {
          const updatedField = existingData[field].filter(item => item !== state[field]);
          updatedField.push(state[field]);
          uploadedInfo[field] = updatedField;
          // console.log('Ключ є, записуємо / перезаписуємо як останній елемент масиву:', uploadedInfo[field]);

          if (Array.isArray(state[field])) {
            if (field === 'photos') {
              uploadedInfo[field] = [...state[field]];
            } else {
              uploadedInfo[field] = [...state[field]];
            }
          }
        }
        // TODO: Перевірити чи працює ЕxistingData (whiteList), яка не є масивом на сервері видаляється
      }  else {
        uploadedInfo[field] = [existingData[field], state[field]];
        // console.log('ЕxistingData на сервері та state мають по 1 значенню, створюємо масив', uploadedInfo[field]);
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
