import styled from 'styled-components';
import { NavLink } from 'react-router-dom';

export const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid #2a363b;
`;

export const ExtraWrapper = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Wrapper = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Username = styled.p`
font-weight: 400;
`;

export const NavLinkStyled = styled(NavLink)`
  border-radius: 4px;
  padding: 5px 15px;
  margin-left: 10px;
  display: inline-block;
  text-decoration: none;
  font-weight: 700;
  color: var(--secondary-text-color);
  transition: background-color var(--animation-timing-function);
  font-size: px;
  &.active {
    color: #fff;
    background-color: var(--accent-color);
  }
`;

export const Button = styled.button`
  margin-left: 10px;
  padding: 5px 15px;
  background-color: var(--accent-color);
  color: var(--primary-text-color);
  border-radius: 4px;
  font-weight: 700;
  transition: background-color var(--animation-timing-function);
  font-size: 16px;
  &:hover,
  &:focus {
    background-color: var(--accent-color-hover);
  }
`;