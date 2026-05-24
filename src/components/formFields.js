export const yesNoOptions = [
  { placeholder: 'No', ukrainian: 'Ні' },
  { placeholder: 'Yes', ukrainian: 'Так' },
];

export const inputFields = [
  
];

export const getFieldLabel = field =>
  field?.label ?? field?.ukrainianHint ?? field?.ukrainian ?? field?.hint ?? field?.name ?? '';

export const getFieldPlaceholder = field => field?.placeholder ?? '';

export const getFieldHint = field => field?.hint ?? '';

export const getOptionLabel = option =>
  option?.label ?? option?.ukrainian ?? option?.placeholder ?? option?.value ?? '';

export const getOptionValue = option =>
  option?.value ?? option?.placeholder ?? option?.label ?? '';


export const inputFieldsEdRowOpu = [
  { name: 'opuDate', placeholder: '30.03.2022', hint: 'date of OPU', svg: 'no', width: '33%', ukrainianHint: 'дата пункції' },
  { name: 'opuCountry', placeholder: 'Ireland', hint: 'country', svg: 'no', width: '33%', ukrainian: 'Ірландія', ukrainianHint: 'країна батьків' },
  { name: 'opuEggsNumber', placeholder: '15', hint: '№ of oocytes', svg: 'no', width: '33%', ukrainianHint: 'отримано клітин' },
];


export const faceShapeOptions = [
  { placeholder: 'Oval', ukrainian: 'Овальне' },
  { placeholder: 'Round', ukrainian: 'Кругле' },
  { placeholder: 'Square', ukrainian: 'Квадратне' },
  { placeholder: 'Rectangle', ukrainian: 'Прямокутне' },
  { placeholder: 'Triangular', ukrainian: 'Трикутне' },
  { placeholder: 'Heart-shaped', ukrainian: 'У формі серця' },
  { placeholder: 'Oblong', ukrainian: 'Видовжене' },

  
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
];

export const lipsShapeOptions = [
  { placeholder: 'Full', ukrainian: 'Повні' },
  { placeholder: 'Thin', ukrainian: 'Тонкі' },
  { placeholder: 'Wide', ukrainian: 'Широкі' },
  { placeholder: 'Plump', ukrainian: 'Пишні' },
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

  
];

// Етнічна група
export const raceOptions = [
  { placeholder: 'European', ukrainian: 'Європейська' },
  { placeholder: 'Middle Eastern', ukrainian: 'Близькосхідна' },
  { placeholder: 'Indian', ukrainian: 'Індійська' },
  { placeholder: 'Asian', ukrainian: 'азіатська' },
  { placeholder: 'African', ukrainian: 'Африканська' },
  { placeholder: 'Latino', ukrainian: 'Латиноамериканська' },

  
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
  //
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
   
];

export const hairStructureOptions = [
  { placeholder: 'Straight', ukrainian: 'Пряме' },
  { placeholder: 'Curly', ukrainian: 'Кучеряве' },
  { placeholder: 'Wavy', ukrainian: 'хвилясте' },
  { placeholder: 'Smooth', ukrainian: 'Гладке' },
  { placeholder: 'Thick', ukrainian: 'Густе' },
  { placeholder: 'Thin', ukrainian: 'Тонке' },
  { placeholder: 'Porous', ukrainian: 'Пористе' },

  
];

export const bodyTypeOptions = [
  { placeholder: 'Pear', ukrainian: 'Груша' },
  { placeholder: 'Round', ukrainian: 'Яблуко' },
  { placeholder: 'Rectangle', ukrainian: 'Прямокутник' },
  { placeholder: 'Triangle', ukrainian: 'трикутник' },
  { placeholder: 'Hourglass', ukrainian: 'Пісочний Годинник' },
  { placeholder: 'Inverted Triangle', ukrainian: 'Перевернутий трикутник' },

  
];

export const educationOptions = [
  { placeholder: 'No', ukrainian: 'Ні' },
  { placeholder: 'Yes', ukrainian: 'Так' },
];

export const educationModalOptions = [
  { placeholder: 'Higher', ukrainian: 'Вища освіта' },
  { placeholder: 'Technical', ukrainian: 'Професійно-технічна освіта' },
  { placeholder: 'Secondary', ukrainian: 'Загальна середня освіта' },
  { placeholder: 'Bachelor', ukrainian: 'Бакалавр' },
  { placeholder: 'Master', ukrainian: 'Магістр' },
  { placeholder: 'PhD', ukrainian: 'Доктор філософії (PhD)' },
];

export const csectionOptions = [
  { placeholder: '-', ukrainian: 'Ні' },
  { placeholder: '1', ukrainian: '1' },
  { placeholder: '2', ukrainian: '2' },
];





export const pickerFields = [
  // базове
  { name: 'name', label: 'Ім’я', placeholder: 'Ваше ім’я', svg: 'user' },
  { name: 'surname', label: 'Прізвище', placeholder: 'Ваше прізвище', svg: 'user' },
  { name: 'birth', label: 'Дата народження', placeholder: 'дд.мм.рррр', hint: 'Формат: дд.мм.рррр', svg: 'no', width: '33%' },
  { name: 'country', label: 'Країна проживання', placeholder: 'україна', svg: 'no', width: '33%' },
  { name: 'region', label: 'Область', placeholder: 'київська', svg: 'no', width: '33%' },
  { name: 'city', label: 'Місто', placeholder: 'буча', svg: 'no', width: '33%' },

  // контакти
  { name: 'email', placeholder: 'name@example.com', svg: 'mail', ukrainianHint:'e-mail'},
  { name: 'phone', label: 'Телефон', placeholder: '+380 67 123 45 67', hint: 'Номер у міжнародному форматі', svg: 'phone'},
  { name: 'telegram', label: 'телеграм', placeholder: '@username', svg: 'telegram-plane' },
  { name: 'facebook', placeholder: 'username', svg: 'facebook-f', ukrainian: 'фейсбук', ukrainianHint:'фейсбук' },
  { name: 'instagram', label: 'інстаграм', placeholder: '@username', svg: 'instagram' },
  { name: 'tiktok', label: 'тікток', placeholder: '@username', svg: 'tiktok' },
  { name: 'twitter', label: 'твітер / x', placeholder: '@username', svg: 'no' },
  { name: 'linkedin', placeholder: 'username', svg: 'no', ukrainian: 'лінкедін', ukrainianHint:'лінкедін' },
  { name: 'youtube', label: 'ютуб', placeholder: '@channel', svg: 'no' },
  { name: 'vk', placeholder: 'username', hint: 'username', svg: 'vk', ukrainian: '', ukrainianHint:'' },

  // медичне
  { name: 'blood', label: 'Група крові та резус', placeholder: '3+', svg: 'no'  },
  { name: 'ownKids', label: 'Кількість пологів', placeholder: '1', svg: 'no' },
  { name: 'lastDelivery', placeholder: 'дд.мм.рррр', hint: 'last delivery', svg: 'no', width: '33%', ukrainianHint: 'останні пологи були (дд.мм.рррр)' },
  {
    name: 'csection',
    placeholder: 'Оберіть: Ні / 1 / 2',
    hint: 'c-section',
    svg: 'no',
    width: '33%',
    options: csectionOptions,
    label: 'Кесарів розтин',
  },
  { name: 'experience', label: 'Кількість попередніх донацій', placeholder: '2', svg: 'no', width: '33%' },
  { name: 'allergy', placeholder: 'пеніцилін', hint: 'Allergy', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'алергії' },
  {
    name: 'surgeries',
    placeholder: 'апендицит у 2021',
    hint: 'surgeries',
    svg: 'no',
    width: '33%',
    options: yesNoOptions,
    ukrainian: 'перенесені операції',
    ukrainianHint: 'перенесені операції',
  },
  { name: 'chronicDiseases', placeholder: '-', hint: 'Chronic diseases', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'хронічні захворювання' },

  // фізичні
  { name: 'height', label: 'зріст в см', placeholder: '168', hint: 'У сантиметрах', svg: 'no' },
  { name: 'weight', label: 'вага в кг', placeholder: '58', hint: 'У кілограмах', svg: 'no' },
  { name: 'clothingSize', placeholder: '38-40', hint: 'clothing size', svg: 'no', width: '33%', ukrainian: 'розмір одягу', ukrainianHint: 'розмір одягу' },
  { name: 'shoeSize', placeholder: '38', hint: 'shoe size', svg: 'no', width: '33%', ukrainian: 'розмір взуття', ukrainianHint: 'розмір взуття' },
  { name: 'breastSize', placeholder: '75b', hint: 'breast size', svg: 'no', width: '33%', ukrainian: 'розмір грудей', ukrainianHint: 'розмір грудей' },
  { name: 'reward', placeholder: '500', hint: '$ reward', svg: 'no', ukrainianHint: 'бажана винагорода в $' },
  { name: 'eyeColor', placeholder: 'голубі', hint: 'eyes', svg: 'no', width: '33%', options: eyeColorOptions, ukrainian: 'колір очей', ukrainianHint: 'колір очей' },
  {
    name: 'hairColor',
    placeholder: 'блонд',
    hint: 'hair',
    svg: 'no',
    width: '33%',
    options: hairColorOptions,
    ukrainian: 'колір волосся',
    ukrainianHint: 'колір волосся',
  },
  { name: 'glasses', placeholder: '-2.5', hint: 'glasses', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'окуляри?' },
 
  {
    name: 'hairStructure',
    placeholder: 'Хвилясте',
    hint: 'hair structure',
    svg: 'no',
    width: '33%',
    options: hairStructureOptions,
    ukrainian: 'структура волосся',
    ukrainianHint: 'структура волосся',
  },
  {
    name: 'race',
    placeholder: 'Азіатська',
    hint: 'human race',
    svg: 'no',
    width: '33%',
    options: raceOptions,
    ukrainian: 'етнічна група',
    ukrainianHint: 'етнічна група',
  },
  {
    name: 'bodyType',
    placeholder: 'Трикутник',
    hint: 'body type',
    svg: 'no',
    width: '33%',
    options: bodyTypeOptions,
    ukrainian: 'фігура',
    ukrainianHint: 'фігура',
  },
  { name: 'faceShape', placeholder: 'Овальне', hint: 'face shape', svg: 'no', width: '33%', options: faceShapeOptions, ukrainian: 'форма обличчя', ukrainianHint: 'форма обличчя'},
  { name: 'noseShape', placeholder: 'Прямий', hint: 'nose shape', svg: 'no', width: '33%', options: noseShapeOptions, ukrainian: 'форма носа', ukrainianHint: 'форма носа' },
  { name: 'lipsShape', placeholder: 'Повні', hint: 'lips shape', svg: 'no', width: '33%', options: lipsShapeOptions, ukrainian: 'форма губ', ukrainianHint: 'форма губ' },
  { name: 'chin', placeholder: 'Pointed', hint: 'сhin', svg: 'no', width: '33%', options: chinShapeOptions, ukrainian: 'підборіддя', ukrainianHint: 'підборіддя' },

  // спосіб життя
  { name: 'smoking', placeholder: '-', hint: 'Smoking', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'куріння' },
  { name: 'alcohol', placeholder: '-', hint: 'Alcohol', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'вживання алкоголю' },
  { name: 'sport', placeholder: 'Волейбол', hint: 'Sport', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'спорт' },
  { name: 'hobbies', placeholder: 'Читання', hint: 'Hobbies', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'хоббі'  },

  // додатково
  {
    name: 'maritalStatus',
    placeholder: 'Оберіть варіант',
    hint: 'officially married',
    svg: 'no',
    width: '33%',
    options: yesNoOptions,
    label: 'Сімейний стан',
  },
  {
    name: 'education',
    placeholder: 'Вища освіта',
    hint: '',
    svg: 'no',
    width: '33%',
    options: educationOptions,
    modalOptions: educationModalOptions,
    ukrainian: 'освіта',
    ukrainianHint: 'освіта',
  },
  {
    name: 'profession',
    placeholder: 'Лікар',
    hint: '',
    svg: 'no',
    width: '33%',
    ukrainian: 'професія',
    ukrainianHint: 'професія',
  },
  { name: 'twinsInFamily', placeholder: '-', hint: 'Twins in the family?', svg: 'no', width: '33%', options: yesNoOptions, ukrainianHint: 'чи були двійнята в родині?'  },
  {
    name: 'moreInfo_main',
    label: 'Про себе',
    placeholder: 'Коротко розкажіть про себе',
    hint: 'До 300 символів',
    svg: 'no',
    width: '100%',
  },

];

export const pickerFieldsExtended = [
  { name: 'userId', placeholder: 'id123456', svg: 'user', ukrainian: 'id користувача', ukrainianHint: 'id користувача' },
  { name: 'role', placeholder: 'см / до / смдо / агент', svg: 'user', ukrainian: 'роль', ukrainianHint: 'роль користувача' },
  { name: 'myComment', placeholder: 'внутрішній коментар', svg: 'user', ukrainian: 'коментар', ukrainianHint: 'коментар' },
  { name: 'getInTouch', placeholder: '30.01.2025', svg: 'user', ukrainian: 'коли звернутись', ukrainianHint: 'коли звернутись' },
  { name: 'lastAction', placeholder: '-', svg: 'user', ukrainian: 'останні зміни', ukrainianHint: 'останні зміни' },
  { name: 'lastLogin2', placeholder: '-', svg: 'user', ukrainian: 'останній логін', ukrainianHint: 'останній логін' },
  { name: 'publish', placeholder: 'false', svg: 'user', ukrainian: 'опубліковано', ukrainianHint: 'анкета опублікована' },
  { name: 'fathersname', placeholder: 'по батькові', svg: 'user', ukrainian: 'по батькові', ukrainianHint: 'по батькові' },
  { name: 'otherLink', placeholder: 'https://example.com', svg: 'user', ukrainian: 'додатковий лінк', ukrainianHint: 'додатковий лінк' },

  // { name: 'name', placeholder: 'Ваше ім’я', svg: 'user', ukrainianHint: 'Ім’я' },
  // { name: 'surname', placeholder: 'Ваше призіище', svg: 'user', ukrainianHint: 'Прізвище'},
  // { name: 'email', placeholder: 'Електронна пошта', svg: 'mail', ukrainianHint:'E-mail'},
  // { name: 'phone', placeholder: '380', svg: 'phone', ukrainianHint:'номер телефону в форматі +380'},
  // { name: 'telegram', placeholder: '@username', svg: 'telegram-plane', ukrainian: 'телеграм', ukrainianHint:'телеграм' },
  // { name: 'facebook', placeholder: 'username', svg: 'facebook-f', ukrainian: 'фейсбук', ukrainianHint:'фейсбук' },
  // { name: 'instagram', placeholder: 'username', svg: 'instagram', ukrainian: 'інстаграм', ukrainianHint:'інстаграм' },
  
  ...pickerFields,

 ]
