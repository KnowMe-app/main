import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchUserById } from './config';
import styled from 'styled-components';
import { color } from './styles';

const Container = styled.div`
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
  color: ${color.black};
`;

const Photo = styled.img`
  max-width: 100%;
  display: block;
  margin-bottom: 20px;
`;

const Field = styled.div`
  margin-bottom: 8px;
`;

const UserCard = () => {
  const { userId } = useParams();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const load = async () => {
      const data = await fetchUserById(userId);
      setUser(data);
    };
    load();
  }, [userId]);

  if (!user) return <Container>Loading...</Container>;

  return (
    <Container>
      {user.photos && user.photos.length > 0 && (
        <Photo src={user.photos[0]} alt="User" />
      )}
      {Object.entries(user).map(([key, value]) => (
        <Field key={key}>
          <strong>{key}:</strong> {Array.isArray(value) ? value.join(', ') : String(value)}
        </Field>
      ))}
    </Container>
  );
};

export default UserCard;
