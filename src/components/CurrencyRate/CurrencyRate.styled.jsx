import styled from 'styled-components';
import BackgroundPicture from './currency-wave.png';

export const Container = styled.div`
  width: 393px;
  min-height: 331px;
  border-radius: 30px;
  margin: 0 auto;
  margin-top: 32px;
  background: url(${BackgroundPicture}), linear-gradient(180deg, rgba(74, 86, 226, 0.8) 18%, rgb(74, 86, 226, 1) 10%);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: bottom;
  @media (max-width: 1279px) {
    width: 336px;
    min-height: 182px;
    background: url(${BackgroundPicture}), linear-gradient(180deg, rgba(74, 86, 226, 0.8) 27.5%, rgb(74, 86, 226, 1) 20%);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: bottom;
  }
  @media (max-width: 767px) {
    width: 280px;
    min-height: 174px;
    margin-top: 28px;

    background: url(${BackgroundPicture}), linear-gradient(180deg, rgba(74, 86, 226, 0.8) 34.5%, rgb(74, 86, 226, 1) 20%);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: bottom;
  }
`;

export const Table = styled.table`
  width: 100%;
  table-layout: fixed;
  border: none;
  text-align: center;
  font-family: 'Circe';
  font-style: normal;
  color: #ffffff;
  border-collapse: collapse;
  border-spacing: 0;
  border: 0;
  `;

export const Thead = styled.thead`
  font-weight: 700;
  font-size: 18px;
  line-height: calc(27 / 18);
`;

export const Tbody = styled.tbody`
  font-weight: 400;
  font-size: 16px;
  line-height: calc(24 / 16);
`;

export const RowHeading = styled.th`
  padding-top: 17px;
  padding-bottom: 16px;
  @media (max-width: 1279px) {
    padding-top: 11px;
    padding-bottom: 12px;
  }
`;

export const RowBody = styled.td`
  padding-top: 20px;
  padding-bottom: 4px;
  @media (max-width: 1279px) {
    padding-top: 16px;
    padding-bottom: 0;
  }
  @media (max-width: 767px) {
    padding-top: 12px;
    padding-bottom: 0;
  }
`;

