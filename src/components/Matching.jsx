import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { fetchUsersCollectionInRTDB, getAllUserPhotos } from './config';
import { getCurrentValue } from './getCurrentValue';

const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
`;

const Card = styled.div`
  width: 120px;
  height: 160px;
  background-color: orange;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
`;

const Matching = () => {
  const [users, setUsers] = useState([]);

  const loadUsers = async () => {
    try {
      const data = await fetchUsersCollectionInRTDB();
      const withPhotos = await Promise.all(
        data.map(async user => {
          const photos = await getAllUserPhotos(user.userId);
          return { ...user, photos };
        })
      );
      setUsers(withPhotos);
    } catch (e) {
      console.error('Error loading users:', e);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <Grid>
      {users.map(user => {
        const photo = getCurrentValue(user.photos);

        return (
          <Card
            key={user.userId}
            style={
              photo
                ? { backgroundImage: `url(${photo})`, backgroundColor: 'transparent' }
                : {}
            }
          />
        );
      })}
    </Grid>
  );
};

export default Matching;
