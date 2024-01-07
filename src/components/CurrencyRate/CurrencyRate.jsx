// import PropTypes from 'prop-types';
import axios from 'axios';
import { Loader } from 'components/Loader/Loader';
import { useEffect } from 'react';
import { useState } from 'react';
import { Container, Table, Tbody, Thead, RowHeading, RowBody } from './CurrencyRate.styled';

//===fetch rate===
const currencyAPI = async () => {
  try {
    return await axios.get('https://api.monobank.ua/bank/currency');
  } catch (error) {}
};
//===

const LS_KEY = 'savedRates';

export const CurrencyRate = () => {
  const [currencyRate, setCurrencyRate] = useState(JSON.parse(window.localStorage.getItem(LS_KEY)) ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timeToFetch = Date.now() - Number(currencyRate.fetchTime) <= 360000;
    if (timeToFetch) return;

    const visibleCurrencyCode = [840, 978];
    setLoading(true);
    const getCurrency = async () => {
      try {
        const { data } = await currencyAPI();
        const filterdCurrency = data.filter(item => visibleCurrencyCode.includes(Number(item.currencyCodeA)) && item.currencyCodeB !== 840);
        localStorage.setItem(LS_KEY, JSON.stringify({ cur: filterdCurrency, fetchTime: Date.now() }));
        setCurrencyRate(JSON.parse(localStorage.getItem(LS_KEY))); }
      catch (error) { return alert(`Something went wrong. ${error}. Please, try again later`); }
      finally { setLoading(false); }
    };
    getCurrency();
  }, [currencyRate]);

  return (
    <Container>
      <Table>
        <Thead>
          <tr>
            <RowHeading>Currency</RowHeading>
            <RowHeading>Purchase</RowHeading>
            <RowHeading>Sale</RowHeading>
          </tr>
        </Thead>
        {loading ? (
          <Loader />
        ) : (
          <Tbody>
            {currencyRate.cur?.map(({ currencyCodeA, rateBuy, rateSell }) => (
              <tr key={currencyCodeA}>
                <RowBody>{currencyCodeA === Number(840) ? 'USD' : 'EUR'}</RowBody>
                <RowBody>{+rateBuy.toFixed(2)}</RowBody>
                <RowBody>{+rateSell.toFixed(2)}</RowBody>
              </tr>
            ))}
          </Tbody>
        )}
      </Table>
    </Container>
  );
};
// Верстка мобілка, планшет, десктоп