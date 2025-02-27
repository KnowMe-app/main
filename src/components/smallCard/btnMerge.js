import { loadDuplicateUsers, mergeDuplicateUsers } from "components/config";

export const btnMerge = async (users, setUsers, setDuplicates) => {
  const { mergedUsers, totalDuplicates } = await mergeDuplicateUsers();
  console.log('mergedUsers :>> ', mergedUsers);

  // setDuplicates(totalDuplicates);

  // const delKeys = [
  //   'photos', 'areTermsConfirmed', 'attitude', 'breastSize', 'chin', 'bodyType', 'lastAction', 'clothingSize',
  //   'deviceHeight', 'education', 'experience', 'eyeColor', 'faceShape', 'glasses', 'hairColor', 'hairStructure',
  //   'language', 'lastLogin', 'lipsShape', 'noseShape', 'profession', 'publish', 'race', 'registrationDate',
  //   'reward', 'shoeSize', 'street', 'whiteList', 'blackList'
  // ];

  // const mergeValues = (currentVal, nextVal) => {
  //   const isArray = (value) => typeof value === 'string' && value.includes(',');
  //   const toArray = (value) =>
  //     isArray(value) ? value.split(',').map((item) => item.trim()) : value ? [String(value).trim()] : [];

  //   if (!currentVal) return nextVal || '';
  //   if (!nextVal) return currentVal;

  //   const uniqueValues = [...new Set([...toArray(currentVal), ...toArray(nextVal)])];
  //   return uniqueValues.join(', ');
  // };

  // let updatedUsers = { ...mergedUsers };

  // // Отримуємо всі пари дублікатів з `mergedUsers`
  // let pairs = [];
  // let processedUsers = new Set();

  // Object.values(mergedUsers).forEach(user => {
  //   if (!processedUsers.has(user.userId)) {
  //     let duplicatePair = Object.values(mergedUsers).filter(u => u !== user && u.userId !== user.userId);
  //     if (duplicatePair.length > 0) {
  //       pairs.push([user.userId, duplicatePair[0].userId]);
  //       processedUsers.add(user.userId);
  //       processedUsers.add(duplicatePair[0].userId);
  //     }
  //   }
  // });

  // let usersToDelete = new Set(); // Юзерів для видалення

  // pairs.forEach(([id1, id2]) => {
  //   const user1 = updatedUsers[id1];
  //   const user2 = updatedUsers[id2];

  //   if (!user1 || !user2) return;

  //   let primaryUser, donorUser;

  //   // Визначаємо основного юзера та донора
  //   if (!user1.userId.startsWith('VK')) {
  //     primaryUser = id1;
  //     donorUser = id2;
  //   } else if (!user2.userId.startsWith('VK')) {
  //     primaryUser = id2;
  //     donorUser = id1;
  //   } else {
  //     // Якщо обидва `VK`, залишаємо першого в парі
  //     primaryUser = id2;
  //     donorUser = id1;
  //   }

  //   for (const key of Object.keys(updatedUsers[donorUser])) {
  //     if (!delKeys.includes(key) && key !== 'userId') {
  //       updatedUsers[primaryUser][key] = mergeValues(updatedUsers[primaryUser][key], updatedUsers[donorUser][key]);
  //     }
  //   }

  //   usersToDelete.add(donorUser);
  // });

  // console.log('usersToDelete:', usersToDelete);

  // // Видаляємо лише юзерів, які йдуть другим у кожній парі
  // usersToDelete.forEach(userId => {
  //   // delete updatedUsers[userId];
  // });

  // console.log('Оновлений список користувачів:', updatedUsers);
  // setUsers(updatedUsers);
};
