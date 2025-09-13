import React from 'react';

const parseDate = str => {
  if (!str) return null;
  const inputPattern = /^\d{2}\.\d{2}\.\d{4}$/;
  if (inputPattern.test(str)) {
    const [day, month, year] = str.split('.');
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const storagePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (storagePattern.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return null;
};

const formatDate = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const isWeekend = date => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const diffDays = (date, base) =>
  Math.round((date - base) / (1000 * 60 * 60 * 24)) + 1;

const adjustForward = (date, base) => {
  let day = diffDays(date, base);
  while (isWeekend(date)) {
    date.setDate(date.getDate() + 1);
    day = diffDays(date, base);
  }
  return { date, day };
};

const adjustBackward = (date, base) => {
  let day = diffDays(date, base);
  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
    day = diffDays(date, base);
  }
  return { date, day };
};

const StimulationSchedule = ({ userData }) => {
  const base = parseDate(userData?.lastCycle);
  if (!userData?.stimulation || !base) return null;

  const visits = [];

  // Day 2
  let d = new Date(base);
  d.setDate(base.getDate() + 1);
  let first = adjustForward(d, base);
  visits.push(`${formatDate(first.date)} - ${first.day}й день циклу`);

  // Day 7
  d = new Date(base);
  d.setDate(base.getDate() + 6);
  let second = adjustBackward(d, base);
  visits.push(`${formatDate(second.date)} - ${second.day}й день циклу`);

  // Days 11-13
  let third;
  for (let n = 11; n <= 13; n++) {
    d = new Date(base);
    d.setDate(base.getDate() + n - 1);
    if (!isWeekend(d)) {
      third = { date: d, day: n };
      break;
    }
  }
  if (!third) {
    d = new Date(base);
    d.setDate(base.getDate() + 12);
    third = adjustBackward(d, base);
  }
  visits.push(`${formatDate(third.date)} - ${third.day}й день циклу`);

  // Transfer 19-22
  let transfer;
  for (let n = 19; n <= 22; n++) {
    d = new Date(base);
    d.setDate(base.getDate() + n - 1);
    if (!isWeekend(d)) {
      transfer = { date: d, day: n };
      break;
    }
  }
  if (!transfer) {
    d = new Date(base);
    d.setDate(base.getDate() + 21);
    transfer = adjustBackward(d, base);
  }
  visits.push(`${formatDate(transfer.date)} - ${transfer.day}й день циклу (перенос)`);

  // HCG 12 days after transfer
  d = new Date(transfer.date);
  d.setDate(d.getDate() + 12);
  let hcg = adjustForward(d, transfer.date);
  visits.push(`${formatDate(hcg.date)} - ХГЧ`);

  // Ultrasound 28 days after transfer
  d = new Date(transfer.date);
  d.setDate(d.getDate() + 28);
  let us = adjustForward(d, transfer.date);
  visits.push(`${formatDate(us.date)} - УЗД`);

  return (
    <div style={{ marginTop: '8px' }}>
      {visits.map((v, i) => (
        <div key={i}>{v}</div>
      ))}
    </div>
  );
};

export default StimulationSchedule;

