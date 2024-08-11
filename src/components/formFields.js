export const yesNoOptions = [
  { placeholder: 'No', ukrainian: 'Ні' },
  { placeholder: 'Yes', ukrainian: 'Так' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const fieldsMain = [
  { name: 'name', placeholder: 'Ваше ім’я', svg: 'user'},
  { name: 'surname', placeholder: 'Призіище', svg: 'user'},
  { name: 'email', placeholder: 'Електронна пошта', svg: 'mail'},
  { name: 'phone', placeholder: 'Нотмер телефону +380', svg: 'phone' },
  { name: 'telegram', placeholder: 'Телеграм @nickname', svg: 'telegram-plane' },
  { name: 'facebook', placeholder: 'facebook_nickname', svg: 'facebook-f' },
  { name: 'instagram', placeholder: 'instagram_nickname', svg: 'instagram' },
  { name: 'vk', placeholder: '0107655', hint: '0107655', svg: 'vk' },
  { name: 'height', placeholder: 'cm', hint: 'cm', svg: 'no',  ukrainian: 'зріст в см', ukrainianHint: 'зріст в см' },
  { name: 'weight', placeholder: 'kg', hint: 'kg', svg: 'no', ukrainian: 'вага в кг', ukrainianHint: 'вага в кг' },
  { name: 'blood', placeholder: '3+', hint: 'група крові та резус / 3+', svg: 'no',  },
  { name: 'ownKids', placeholder: '1', hint: 'own kids', svg: 'no', ukrainianHint: 'кілікість пологів' },
  { name: 'reward', placeholder: '500', hint: '$ reward', svg: 'no', ukrainianHint: 'бажана винагорода в $' },
];

export const inputFieldsEdRow2 = [
  { name: 'birth', placeholder: '30.01.2001', hint: 'DOB', svg: 'no', width: '33%', ukrainianHint: 'дата народження' },
  { name: 'lastDelivery', placeholder: '30.01.2021', hint: 'last delivery', svg: 'no', width: '33%', ukrainianHint: 'останні пологи' },
  // { name: 'csection', placeholder: '30.01.2020', hint: 'c-section', svg: 'no', width: '33%', ukrainianHint: 'кесарів розтин'},
  { name: 'experience', placeholder: '2', hint: 'donatin exp?', svg: 'no', width: '33%', ukrainianHint: 'досвід донацій' },
];

export const inputFieldsEdRowOpu = [
  { name: 'opuDate', placeholder: '30.03.2022', hint: 'date of OPU', svg: 'no', width: '33%', ukrainianHint: 'дата пункції' },
  { name: 'opuCountry', placeholder: 'Ireland', hint: 'country', svg: 'no', width: '33%', ukrainian: 'Ірландія', ukrainianHint: 'країна батьків' },
  { name: 'opuEggsNumber', placeholder: '15', hint: '№ of oocytes', svg: 'no', width: '33%', ukrainianHint: 'отримано клітин' },
];

export const inputFieldsEdRowLocation = [
  { name: 'country', placeholder: 'Country', hint: 'country', svg: 'no', width: '33%', ukrainian: 'Країна', ukrainianHint: 'країна' },
  { name: 'region', placeholder: 'Region', hint: 'region', svg: 'no', width: '33%', ukrainian: 'Область', ukrainianHint: 'область' },
  { name: 'city', placeholder: 'City', hint: 'city', svg: 'no', width: '33%', ukrainian: 'Місто', ukrainianHint: 'місто' },
];

export const inputFieldsEdRowLocationIp = [
  { name: 'country', placeholder: 'Country', hint: 'country', svg: 'no', width: '49.5%', ukrainian: 'Країна', ukrainianHint: 'країна' },
  { name: 'region', placeholder: 'Region', hint: 'region', svg: 'no', width: '49.5%', ukrainian: 'Область', ukrainianHint: 'область' },
];

export const inputFieldsEdRow3 = [
  { name: 'clothingSize', placeholder: '38-40', hint: 'clothing size', svg: 'no', width: '33%', ukrainianHint: 'розмір одягу' },
  { name: 'shoeSize', placeholder: '38', hint: 'shoe size', svg: 'no', width: '33%', ukrainianHint: 'розмір взуття' },
  { name: 'breastSize', placeholder: '75B', hint: 'breast size', svg: 'no', width: '33%', ukrainianHint: 'розмір грудей' },
];

export const inputFieldsEdRowFinal = [
  {
    name: 'moreInfo_main',
    placeholder: 'More about myself... (max 300 digits)',
    hint: 'extra info',
    svg: 'no',
    width: '100%',
    ukrainian: 'Більше про себе... (макс 300 символів)',
    ukrainianHint: 'додаткова інформація',
  },
];
export const inputFieldsEdRowFinalIP = [
  {
    name: 'moreInfo_main',
    placeholder: 'More about ourself... (max 300 digits)',
    hint: 'extra info about us',
    svg: 'no',
    width: '100%',
    ukrainian: 'Більше про нас... (макс 300 символів)',
    ukrainianHint: 'додаткова інформація',
  },
];

export const faceShapeOptions = [
  { placeholder: 'Oval', ukrainian: 'Овальне' },
  { placeholder: 'Round', ukrainian: 'Кругле' },
  { placeholder: 'Square', ukrainian: 'Квадратне' },
  { placeholder: 'Rectangle', ukrainian: 'Прямокутне' },
  { placeholder: 'Triangular', ukrainian: 'Трикутне' },
  { placeholder: 'Heart-shaped', ukrainian: 'У формі серця' },
  { placeholder: 'Oblong', ukrainian: 'Видовжене' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const noseShapeOptions = [
  { placeholder: 'Straight', ukrainian: 'Прямий' },
  { placeholder: 'Aquiline', ukrainian: 'Орлиний' },
  { placeholder: 'Crooked', ukrainian: 'Кирпатий' },
  { placeholder: 'Roman', ukrainian: 'Римський' },
  { placeholder: 'Snub', ukrainian: 'Витягнутий' },
  { placeholder: 'Greek', ukrainian: 'Грецький' },
  { placeholder: 'Nubian', ukrainian: 'Нубійський' },
  { placeholder: 'Upturned', ukrainian: 'Загострений' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const lipsShapeOptions = [
  { placeholder: 'Full', ukrainian: 'Повні' },
  { placeholder: 'Thin', ukrainian: 'Тонкі' },
  { placeholder: 'Wide', ukrainian: 'Широкі' },
  { placeholder: 'Plump', ukrainian: 'Пишні' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const chinShapeOptions = [
  { placeholder: 'Oval', ukrainian: 'Овальне' },
  { placeholder: 'Pointed', ukrainian: 'Гостре' },
  { placeholder: 'Round', ukrainian: 'Кругле' },
  { placeholder: 'Square', ukrainian: 'Квадратне' },
  { placeholder: 'Double', ukrainian: 'Подвійне' },
  { placeholder: 'Prominent', ukrainian: 'Виступаюче' },
  { placeholder: 'Slanted', ukrainian: 'Скошене' },
  { placeholder: 'Cleft', ukrainian: 'З ямкою' },
  { placeholder: 'Rectangular', ukrainian: 'Прямокутне' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

// Етнічна група
export const raceOptions = [
  { placeholder: 'European', ukrainian: 'Європейська' },
  { placeholder: 'Middle Eastern', ukrainian: 'Близькосхідна' },
  { placeholder: 'Indian', ukrainian: 'Індійська' },
  { placeholder: 'Asian', ukrainian: 'Азіатська' },
  { placeholder: 'African', ukrainian: 'Африканська' },
  { placeholder: 'Latino', ukrainian: 'Латиноамериканська' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const hairColorOptions = [
  { placeholder: 'Dark', ukrainian: 'Темне' },
  { placeholder: 'Fair', ukrainian: 'Русяве' },
  { placeholder: 'Blonde', ukrainian: 'Блонд' },
  { placeholder: 'Brown', ukrainian: 'Коричневе' },
  { placeholder: 'Chestnut', ukrainian: 'Каштанове' },
  { placeholder: 'Brunette', ukrainian: 'Брюнет' },
  { placeholder: 'Shoten', ukrainian: 'Шатен' },
  { placeholder: 'Red', ukrainian: 'Руде' },
  { placeholder: 'Dark Blonde', ukrainian: 'Темний блонд' },
  { placeholder: 'Dark Brown', ukrainian: 'Темно-коричневе' },
  { placeholder: 'Dark Chestnut', ukrainian: 'Темно-каштанове' },
  { placeholder: 'Dark Brunette', ukrainian: 'Темний брюнет' },
  { placeholder: 'Gray', ukrainian: 'Сіре' },
  // { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const eyeColorOptions = [
  { placeholder: 'Hazel', ukrainian: 'Карі' },
  { placeholder: 'Gray', ukrainian: 'Сірі' },
  { placeholder: 'Brown', ukrainian: 'Коричневі' },
  { placeholder: 'Blue', ukrainian: 'Сині' },
  { placeholder: 'Green', ukrainian: 'Зелені' },
  { placeholder: 'Brown-Green', ukrainian: 'Коричнево-зелені' },
  { placeholder: 'Gray-Green', ukrainian: 'Сіро-зелені' },
  { placeholder: 'Gray-Blue', ukrainian: 'Сіро-голубі' },
  { placeholder: 'Sky-Blue', ukrainian: 'Голубі' },
   { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const pickerFields = [
  { name: 'eyeColor', placeholder: 'Blue', hint: 'eyes', svg: 'no', width: '33%', options: eyeColorOptions, ukrainian: 'Голубі', ukrainianHint: 'колір очей' },
  {
    name: 'hairColor',
    placeholder: 'Blonde',
    hint: 'hair',
    svg: 'no',
    width: '33%',
    options: hairColorOptions,
    ukrainian: 'Блонд',
    ukrainianHint: 'колір волосся',
  },

];

//////////////////////////
export const hairStructureOptions = [
  { placeholder: 'Straight', ukrainian: 'Пряме' },
  { placeholder: 'Curly', ukrainian: 'Кучеряве' },
  { placeholder: 'Wavy', ukrainian: 'Хвилясте' },
  { placeholder: 'Smooth', ukrainian: 'Гладке' },
  { placeholder: 'Thick', ukrainian: 'Густе' },
  { placeholder: 'Thin', ukrainian: 'Тонке' },
  { placeholder: 'Porous', ukrainian: 'Пористе' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const bodyTypeOptions = [
  { placeholder: 'Pear', ukrainian: 'Груша' },
  { placeholder: 'Round', ukrainian: 'Яблуко' },
  { placeholder: 'Rectangle', ukrainian: 'Прямокутник' },
  { placeholder: 'Triangle', ukrainian: 'Трикутник' },
  { placeholder: 'Hourglass', ukrainian: 'Пісочний Годинник' },
  { placeholder: 'Inverted Triangle', ukrainian: 'Перевернутий трикутник' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const educationOptions = [
  { placeholder: 'Higher', ukrainian: 'Вища освіта' },
  { placeholder: 'Technical', ukrainian: 'Професійно-технічна освіта' },
  { placeholder: 'Secondary', ukrainian: 'Загальна середня освіта' },
  { placeholder: 'Other', ukrainian: 'Опишіть:' },
  { placeholder: 'Clear', ukrainian: 'Очистити' },
];

export const pickerFieldsEdRow2 = [
  {
    name: 'hairStructure',
    placeholder: 'Wavy',
    hint: 'hair structure',
    svg: 'no',
    width: '33%',
    options: hairStructureOptions,
    ukrainian: 'Хвилясте',
    ukrainianHint: 'структура волосся',
  },
  {
    name: 'race',
    placeholder: 'Asian',
    hint: 'human race',
    svg: 'no',
    width: '33%',
    options: raceOptions,
    ukrainian: 'Азіатська',
    ukrainianHint: 'етнічна група',
  },
  {
    name: 'bodyType',
    placeholder: 'Triangle',
    hint: 'body type',
    svg: 'no',
    width: '33%',
    options: bodyTypeOptions,
    ukrainian: 'Трикутник',
    ukrainianHint: 'фігура',
  },
  { name: 'faceShape', placeholder: 'Oval', hint: 'face shape', svg: 'no', width: '33%', options: faceShapeOptions, ukrainian: 'Овальне', ukrainianHint: 'форма обличчя'},
  { name: 'noseShape', placeholder: 'Straight', hint: 'nose shape', svg: 'no', width: '33%', options: noseShapeOptions, ukrainian: 'Приямий', ukrainianHint: 'форма носа' },
  { name: 'lipsShape', placeholder: 'Full', hint: 'lips shape', svg: 'no', width: '33%', options: lipsShapeOptions, ukrainian: 'Повні', ukrainianHint: 'форма губ' },
  { name: 'chin', placeholder: 'Pointed', hint: 'сhin', svg: 'no', width: '33%', options: chinShapeOptions, ukrainian: 'Гостре', ukrainianHint: 'підборіддя' },
  
  {
    name: 'maritalStatus',
    placeholder: 'please choose',
    hint: 'officially married',
    svg: 'no',
    width: '33%',
    options: yesNoOptions,
    ukrainian: 'оберіть варіант',
    ukrainianHint: 'офіційний шлюб',
  },
  {
    name: 'education',
    placeholder: 'Higher',
    hint: 'education',
    svg: 'no',
    width: '33%',
    options: educationOptions,
    ukrainian: 'Вища освіта',
    ukrainianHint: 'освіта',
  },
  {
    name: 'profession',
    placeholder: 'Astronaut',
    hint: 'profession',
    svg: 'no',
    width: '33%',
    ukrainian: 'Лікар',
    ukrainianHint: 'професія',
  },
];

//////////////////////

export const pickerFieldsEdRow4 = [
  { name: 'glasses', placeholder: '-2.5', hint: 'glasses', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'окуляри?' },
  // { name: 'allergy', placeholder: 'penicillin', hint: 'Allergy', svg: 'no', width: '33%', options: yesNoOptions },
  // {
  //   name: 'surgeries',
  //   placeholder: 'appendicite in 2021',
  //   hint: 'surgeries',
  //   svg: 'no',
  //   width: '33%',
  //   options: yesNoOptions,
  //   ukrainian: 'апендицит в 2021',
  //   ukrainianHint: 'операції',
  // },
];

export const pickerFieldsEdRow5 = [
  // { name: 'chronicDiseases', placeholder: 'No', hint: 'Chronic diseases', svg: 'no', width: '33%', options: yesNoOptions },
  // { name: 'smoking', placeholder: 'Sometimes', hint: 'Smoking', svg: 'no', width: '33%', options: yesNoOptions },
  // { name: 'alcohol', placeholder: 'Sometimes', hint: 'Alcohol', svg: 'no', width: '33%', options: yesNoOptions },
];

export const pickerFieldsEdRow6 = [
  // { name: 'sport', placeholder: 'Volleyball', hint: 'Sport', svg: 'no', width: '33%', options: yesNoOptions },
  // { name: 'hobbies', placeholder: 'Reading', hint: 'Hobbies', svg: 'no', width: '33%', options: yesNoOptions },
  // { name: 'twinsInFamily', placeholder: 'No', hint: 'Twins in the family?', svg: 'no', width: '33%', options: yesNoOptions },
];

export const pickerFieldsEdRow7 = [
  // {
  //   name: 'character',
  //   placeholder: 'Calm',
  //   hint: 'сharacter',
  //   svg: 'no',
  //   width: '33%',
  //   options: yesNoOptions,
  // },
  // {
  //   name: 'profession',
  //   placeholder: 'Astronaut',
  //   hint: 'Profession',
  //   svg: 'no',
  //   width: '33%',
  //   options: yesNoOptions,
  //   ukrainian: 'Вища освіта',
  //   ukrainianHint: 'освіта',
  // },
];

export const pickerFieldsIp = [
  { name: 'nameWife', placeholder: 'Name, Lastname of wife', hint: 'Wife', svg: 'no', width: '100%', ukrainian: 'Ім’я та прізвище дружини', ukrainianHint: 'Дружина' },
  { name: 'heightWife', placeholder: 'cm', hint: 'cm', svg: 'no', width: '10.5%', ukrainian: 'см', ukrainianHint: 'см' },
  { name: 'weightWife', placeholder: 'kg', hint: 'kg', svg: 'no', width: '10.5%', ukrainian: 'кг', ukrainianHint: 'кг' },
  { name: 'bloodWife', placeholder: '3+', hint: 'Rh+', svg: 'no', width: '10.5%' }, 
  { name: 'birthWife', placeholder: '30.01.1995', hint: 'DOB', svg: 'no', width: '33%', ukrainianHint: 'дата народження' },
  { name: 'raceWife', placeholder: 'Asian', hint: 'human race', svg: 'no', width: '33%', options: raceOptions, ukrainian: 'Азіатська', ukrainianHint: 'етнічна група'},
  { name: 'eyeColorWife', placeholder: 'Blue', hint: 'eyes color', svg: 'no', width: '33%', options: eyeColorOptions, ukrainian: 'Голубі', ukrainianHint: 'колір очей' },
  { name: 'faceShapeWife', placeholder: 'Oval', hint: 'face shape', svg: 'no', width: '33%', options: faceShapeOptions, ukrainian: 'Овальне', ukrainianHint: 'форма обличчя'},
  { name: 'noseShapeWife', placeholder: 'Straight', hint: 'nose shape', svg: 'no', width: '33%', options: noseShapeOptions, ukrainian: 'Приямий', ukrainianHint: 'форма носа' },
  { name: 'lipsShapeWife', placeholder: 'Full', hint: 'lips shape', svg: 'no', width: '33%', options: lipsShapeOptions, ukrainian: 'Повні', ukrainianHint: 'форма губ' },
  { name: 'hairColorWife', placeholder: 'Blonde', hint: 'hair color', svg: 'no', width: '33%', options: hairColorOptions, ukrainian: 'Блонд', ukrainianHint: 'колір волосся'},
  { name: 'chinWife', placeholder: 'Pointed', hint: 'сhin', svg: 'no', width: '33%', options: chinShapeOptions, ukrainian: 'Гостре', ukrainianHint: 'підборіддя' },
   { name: 'peculiaritiesWife', placeholder: 'Big eyes', hint: 'peculiarities', svg: 'no', width: '33%', ukrainian: 'Великі очі', ukrainianHint: 'особливості'},

  { name: 'nameHusband', placeholder: 'Name, Lastname of husband', hint: 'Husband', svg: 'no', width: '100%', ukrainian: 'Ім’я та прізвище чоловіка', ukrainianHint: 'Чоловік' },
  { name: 'heightHusband', placeholder: 'cm', hint: 'cm', svg: 'no', width: '10.5%', ukrainian: 'см', ukrainianHint: 'см' },
  { name: 'weightHusband', placeholder: 'kg', hint: 'kg', svg: 'no', width: '10.5%', ukrainian: 'кг', ukrainianHint: 'кг' },
  { name: 'bloodHusband', placeholder: '3+', hint: 'Rh+', svg: 'no', width: '10.5%' }, 
  { name: 'birthHusband', placeholder: '30.01.1995', hint: 'DOB', svg: 'no', width: '33%', ukrainianHint: 'дата народження' },
  { name: 'raceHusband', placeholder: 'Asian', hint: 'human race', svg: 'no', width: '33%', options: raceOptions, ukrainian: 'Азіатська', ukrainianHint: 'етнічна група'},
  { name: 'eyeColorHusband', placeholder: 'Blue', hint: 'eyes color', svg: 'no', width: '33%', options: eyeColorOptions, ukrainian: 'Голубі', ukrainianHint: 'колір очей' },
  { name: 'faceShapeHusband', placeholder: 'Oval', hint: 'face shape', svg: 'no', width: '33%', options: faceShapeOptions, ukrainian: 'Овальне', ukrainianHint: 'форма обличчя'},
  { name: 'noseShapeHusband', placeholder: 'Straight', hint: 'nose shape', svg: 'no', width: '33%', options: noseShapeOptions, ukrainian: 'Приямий', ukrainianHint: 'форма носа' },
  { name: 'lipsShapeHusband', placeholder: 'Full', hint: 'lips shape', svg: 'no', width: '33%', options: lipsShapeOptions, ukrainian: 'Повні', ukrainianHint: 'форма губ' },
  { name: 'hairColorHusband', placeholder: 'Blonde', hint: 'hair color', svg: 'no', width: '33%', options: hairColorOptions, ukrainian: 'Блонд', ukrainianHint: 'колір волосся'},
  { name: 'chinHusband', placeholder: 'Pointed', hint: 'сhin', svg: 'no', width: '33%', options: chinShapeOptions, ukrainian: 'Гостре', ukrainianHint: 'підборіддя' },
  { name: 'peculiaritiesHusband', placeholder: 'Big eyes', hint: 'peculiarities', svg: 'no', width: '33%', ukrainian: 'Великі очі', ukrainianHint: 'особливості' },

];

export const pickerFieldsEdMain = [

  ...pickerFields,
  ...pickerFieldsEdRow2,
  ...pickerFieldsEdRow4,
  ...pickerFieldsEdRow5,
  ...pickerFieldsEdRow6,
];

export const pickerFieldsAll = [

  ...pickerFields,
  ...pickerFieldsEdRow2,
  ...pickerFieldsEdRow4,
  ...pickerFieldsEdRow5,
  ...pickerFieldsEdRow6,
  ...pickerFieldsIp,
];
