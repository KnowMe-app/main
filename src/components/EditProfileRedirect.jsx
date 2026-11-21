import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

// `/edit/:userId` — адреса з Telegram-сповіщень, журналу сповіщень і посилань
// на автора чернетки. Окремого екрана редагування більше немає: картку
// відкриває той самий `AddNewProfile`, що й зі «Списку» (реакції, «Назад /
// Вперед», та сама форма). Доти тут стояв `EditProfile` — друга копія форми
// зі своїми поломками: без лайка, з «Back», що нікуди не вів, і з пропозиціями
// редакторів, склеєними через кому.
export const ADMIN_CARD_RETURN_BACK_STATE = 'adminCardReturnBack';

const EditProfileRedirect = () => {
  const { userId } = useParams();
  const location = useLocation();
  // Відкрили всередині застосунку — «назад» картки веде туди, звідки прийшли;
  // посилання першою сторінкою вкладки (`key === 'default'`) повертає до списку.
  const cameFromApp = Boolean(location.key) && location.key !== 'default';
  const search = `?${new URLSearchParams({ userId: userId || '' }).toString()}`;

  return (
    <Navigate
      to={{ pathname: '/', search }}
      replace
      state={cameFromApp ? { [ADMIN_CARD_RETURN_BACK_STATE]: userId } : null}
    />
  );
};

export default EditProfileRedirect;
