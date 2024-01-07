import { useAuth } from 'hooks/useAuth';
import { useDispatch } from 'react-redux';
import { logOut } from 'redux/auth/operations';
import { Outlet } from 'react-router-dom';
// import { Toaster } from 'react-hot-toast';
import { Suspense } from 'react';
import { Header, Wrapper, ExtraWrapper, Username, NavLinkStyled, Button } from './Layout.styled';

export const Layout = () => {
  const dispatch = useDispatch();
  const { isLoggedIn, user } = useAuth();

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px' }}>
      <Header>
        <ExtraWrapper>
          <NavLinkStyled to="/">Home</NavLinkStyled>
          {isLoggedIn && <NavLinkStyled to="/contacts">Contacts</NavLinkStyled>}
        </ExtraWrapper>
        {isLoggedIn ? (
          <Wrapper>
            <Username>Welcome, {user.email}</Username>
            <Button type="button" onClick={() => dispatch(logOut())}> Logout </Button>
          </Wrapper>
        ) : (
          <div>
            <NavLinkStyled to="/register">Register</NavLinkStyled>
            <NavLinkStyled to="/login">Log In</NavLinkStyled>
          </div>
        )}
      </Header>
      <Suspense fallback={<div>Loading...</div>}>
        <Outlet />
      </Suspense>
      {/* <Toaster position="top-right" reverseOrder={false} /> */}
    </div>
  );
};