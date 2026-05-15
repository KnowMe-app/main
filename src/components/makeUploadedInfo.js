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
      uploadedInfo[field] = state[field];
    }
    /////////////////////////////////////////////////////
     else if (existingData?.hasOwnProperty(field) &&
      // Дублікати пропускаємо
      existingData[field] !== state[field]
    ) {
      
      if (Array.isArray(existingData[field])) {
        if (overwrite && [state[field]].length === 1) {
          uploadedInfo[field] = state[field];
        } else if (Array.isArray(state[field])) {
          if (field === 'photos') {
            uploadedInfo[field] = [...state[field]];
          } else {
            uploadedInfo[field] = [...state[field]];
          }
        } else {
            const updatedField = existingData[field].filter(item => item !== state[field]);
            updatedField.push(state[field]);
            uploadedInfo[field] = updatedField;
          }
        }else if (overwrite && state[field]===''&& !Array.isArray(existingData[field])){
        uploadedInfo[field] = '';
      } else if (overwrite && !Array.isArray(state[field]==='') && !Array.isArray(existingData[field])){
        uploadedInfo[field] = state[field];
      } else if (existingData[field]===''){
        uploadedInfo[field] = state[field];
      } else if (!Array.isArray(state[field])){
        uploadedInfo[field] = [existingData[field], state[field]];
      } else {
        const updatedField = state[field].filter(item => item !== existingData[field]);
        uploadedInfo[field] = [existingData[field], ...updatedField]
      }
    } else if (!existingData?.hasOwnProperty(field) && state[field] !== '') {
      if (field === 'postpone') {
        uploadedInfo[field] = [state[field]];
      }
      uploadedInfo[field] = state[field];
    }
  }
  return uploadedInfo;
};