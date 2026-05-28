export const yesNoOptions = [
  { placeholder: 'No', ukrainian: 'Ні' },
  { placeholder: 'Yes', ukrainian: 'Так' },
  { placeholder: 'Custom', ukrainian: 'Свій варіант', value: 'Свій варіант' },
];

export const inputFields = [
  
];

const hasDisplayText = value => typeof value === 'string' ? value.trim() !== '' : value != null;

export const getFieldLabel = field => {
  const candidates = [field?.ukrainian, field?.label, field?.name];
  const firstValue = candidates.find(hasDisplayText);

  return firstValue ?? '';
};

export const getFieldPlaceholder = field => field?.placeholder ?? '';

export const getFieldHint = field => field?.ukrainianHint ?? field?.hint ?? '';

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
  { name: 'name', label: 'Ім’я', ukrainian: 'Ім’я', placeholder: 'Марія', svg: 'user' },
  { name: 'surname', label: 'Прізвище', ukrainian: 'Прізвище', placeholder: 'Іваненко', svg: 'user' },
  { name: 'birth', label: 'Дата народження', ukrainian: 'Дата народження', placeholder: 'дд.мм.рррр', ukrainianHint: 'Формат: дд.мм.рррр', svg: 'no', width: '33%' },
  { name: 'country', label: 'Країна', ukrainian: 'Країна', placeholder: 'Україна', svg: 'no', width: '33%' },
  { name: 'region', label: 'Область', ukrainian: 'Область', placeholder: 'Київська', svg: 'no', width: '33%' },
  { name: 'city', label: 'Місто', ukrainian: 'Місто', placeholder: 'Київ', svg: 'no', width: '33%' },

  // контакти
  { name: 'email', label: 'Email', ukrainian: 'Email', placeholder: 'name@example.com', svg: 'mail' },
  { name: 'phone', label: 'Телефон', ukrainian: 'Телефон', placeholder: '380 67 123 45 67', ukrainianHint: 'Номер у міжнародному форматі', svg: 'phone' },
  { name: 'telegram', label: 'Telegram', ukrainian: 'Telegram', placeholder: 'username', svg: 'telegram-plane' },
  { name: 'facebook', label: 'Facebook', ukrainian: 'Facebook', placeholder: 'username', svg: 'facebook-f' },
  { name: 'instagram', label: 'Instagram', ukrainian: 'Instagram', placeholder: 'username', svg: 'instagram' },
  { name: 'tiktok', label: 'TikTok', ukrainian: 'TikTok', placeholder: 'username', svg: 'tiktok' },
  { name: 'twitter', label: 'X / Twitter', ukrainian: 'X / Twitter', placeholder: 'username', svg: 'no' },
  { name: 'linkedin', label: 'LinkedIn', ukrainian: 'LinkedIn', placeholder: 'username', svg: 'no' },
  { name: 'youtube', label: 'YouTube', ukrainian: 'YouTube', placeholder: 'username', svg: 'no' },
  { name: 'vk', label: 'VK', ukrainian: 'VK', placeholder: '123456789', svg: 'vk' },

  // медичне
  { name: 'ownKids', label: 'Кількість пологів', ukrainian: 'Кількість пологів', placeholder: '1', svg: 'no' },
  { name: 'lastDelivery', label: 'Останні пологи', ukrainian: 'Останні пологи', placeholder: 'дд.мм.рррр', ukrainianHint: 'Коли були останні пологи', svg: 'no', width: '33%' },
  {
    name: 'csection',
    label: 'Кесарів розтин',
    ukrainian: 'Кесарів розтин',
    placeholder: 'Ні / 1 / 2',
    svg: 'no',
    width: '33%',
    options: csectionOptions,
  },
  { name: 'experience', label: 'Кількість попередніх донацій', ukrainian: 'Кількість попередніх донацій', placeholder: '2', svg: 'no', width: '33%' },
  { name: 'allergy', label: 'Алергії', ukrainian: 'Алергії', placeholder: 'пеніцилін', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'surgeries', label: 'Перенесені операції', ukrainian: 'Перенесені операції', placeholder: 'апендицит у 2021', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'chronicDiseases', label: 'Хронічні захворювання', ukrainian: 'Хронічні захворювання', placeholder: 'відсутні', svg: 'no', width: '33%', options: yesNoOptions },

  // фізичні
  { name: 'maritalStatus', label: 'Чи перебуваєте в офіційному шлюбі', ukrainian: 'Чи перебуваєте в офіційному шлюбі', placeholder: 'Так / Ні / Інше', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'height', label: 'Зріст (см)', ukrainian: 'Зріст (см)', placeholder: '168', ukrainianHint: 'У сантиметрах', svg: 'no' },
  { name: 'weight', label: 'Вага (кг)', ukrainian: 'Вага (кг)', placeholder: '58', ukrainianHint: 'У кілограмах', svg: 'no' },
  { name: 'blood', label: 'Група крові та резус', ukrainian: 'Група крові та резус', placeholder: '3+', svg: 'no' },
  { name: 'clothingSize', label: 'Розмір одягу', ukrainian: 'Розмір одягу', placeholder: '38-40', svg: 'no', width: '33%' },
  { name: 'shoeSize', label: 'Розмір взуття', ukrainian: 'Розмір взуття', placeholder: '38', svg: 'no', width: '33%' },
  { name: 'breastSize', label: 'Розмір грудей', ukrainian: 'Розмір грудей', placeholder: '75B', svg: 'no', width: '33%' },
  { name: 'reward', label: 'Бажана винагорода ($)', ukrainian: 'Бажана винагорода ($)', placeholder: '500', svg: 'no' },
  { name: 'eyeColor', label: 'Колір очей', ukrainian: 'Колір очей', placeholder: 'голубі', svg: 'no', width: '33%', options: eyeColorOptions },
  { name: 'hairColor', label: 'Колір волосся', ukrainian: 'Колір волосся', placeholder: 'блонд', svg: 'no', width: '33%', options: hairColorOptions },
  { name: 'glasses', label: 'Окуляри', ukrainian: 'Окуляри', placeholder: '-2.5', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'hairStructure', label: 'Структура волосся', ukrainian: 'Структура волосся', placeholder: 'хвилясте', svg: 'no', width: '33%', options: hairStructureOptions },
  { name: 'race', label: 'Етнічна група', ukrainian: 'Етнічна група', placeholder: 'європейська', svg: 'no', width: '33%', options: raceOptions },
  { name: 'bodyType', label: 'Фігура', ukrainian: 'Фігура', placeholder: 'трикутник', svg: 'no', width: '33%', options: bodyTypeOptions },
  { name: 'faceShape', label: 'Форма обличчя', ukrainian: 'Форма обличчя', placeholder: 'овальне', svg: 'no', width: '33%', options: faceShapeOptions },
  { name: 'noseShape', label: 'Форма носа', ukrainian: 'Форма носа', placeholder: 'прямий', svg: 'no', width: '33%', options: noseShapeOptions },
  { name: 'lipsShape', label: 'Форма губ', ukrainian: 'Форма губ', placeholder: 'повні', svg: 'no', width: '33%', options: lipsShapeOptions },
  { name: 'chin', label: 'Підборіддя', ukrainian: 'Підборіддя', placeholder: 'гостре', svg: 'no', width: '33%', options: chinShapeOptions },

  // спосіб життя
  { name: 'smoking', label: 'Куріння', ukrainian: 'Куріння', placeholder: 'Так / Ні / Інше', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'alcohol', label: 'Вживання алкоголю', ukrainian: 'Вживання алкоголю', placeholder: 'Так / Ні / Інше', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'sport', label: 'Спорт', ukrainian: 'Спорт', placeholder: 'волейбол', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'hobbies', label: 'Хобі', ukrainian: 'Хобі', placeholder: 'читання', svg: 'no', width: '33%', options: yesNoOptions },

  // додатково
  { name: 'education', label: 'Освіта', ukrainian: 'Освіта', placeholder: 'Вища освіта', svg: 'no', width: '33%', options: educationOptions, modalOptions: educationModalOptions },
  { name: 'profession', label: 'Професія', ukrainian: 'Професія', placeholder: 'Лікар', svg: 'no', width: '33%' },
  { name: 'twinsInFamily', label: 'Чи були двійнята в родині?', ukrainian: 'Чи були двійнята в родині?', placeholder: 'Так / Ні / Інше', svg: 'no', width: '33%', options: yesNoOptions },
  { name: 'moreInfo_main', label: 'Про себе', ukrainian: 'Про себе', placeholder: 'Коротко розкажіть про себе', ukrainianHint: 'До 300 символів', svg: 'no', width: '100%' },

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
