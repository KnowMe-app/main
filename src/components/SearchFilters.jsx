import React from 'react';
import { CheckboxGroup } from './CheckboxGroup';

export const SearchFilters = ({ filters, onChange }) => {
  const groups = [
    {
      filterName: 'csection',
      label: 'C-section',
      options: [
        { val: 'cs2plus', label: 'cs2+' },
        { val: 'cs1', label: 'cs1' },
        { val: 'cs0', label: 'cs0' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'role',
      label: 'Role',
      options: [
        { val: 'ed', label: 'ed' },
        { val: 'sm', label: 'sm' },
        { val: 'ag', label: 'ag' },
        { val: 'ip', label: 'ip' },
        { val: 'cl', label: 'cl' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'maritalStatus',
      label: 'Marital status',
      options: [
        { val: 'married', label: 'заміжня' },
        { val: 'unmarried', label: 'незаміжня' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'blood',
      label: 'Rh factor',
      options: [
        { val: 'pos', label: 'рк+' },
        { val: 'neg', label: 'рк-' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'age',
      label: 'Age',
      options: [
        { val: 'le25', label: '≤25' },
        { val: '26_30', label: '26-30' },
        { val: '31_36', label: '31-36' },
        { val: '37_42', label: '37-42' },
        { val: '43_plus', label: '43+' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'userId',
      label: 'UserId',
      options: [
        { val: 'vk', label: 'vk' },
        { val: 'aa', label: 'aa' },
        { val: 'ab', label: 'ab' },
        { val: 'long', label: '>20' },
        { val: 'mid', label: '>8<20' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'fields',
      label: 'Fields',
      options: [
        { val: 'lt4', label: '<4' },
        { val: 'lt8', label: '<8' },
        { val: 'lt12', label: '<12' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'commentLength',
      label: 'Comment words',
      options: [
        { val: 'w0_9', label: '0-9' },
        { val: 'w10_29', label: '10-29' },
        { val: 'w30_49', label: '30-49' },
        { val: 'w50_99', label: '50-99' },
        { val: 'w100_199', label: '100-199' },
        { val: 'w200_plus', label: '200+' },
        { val: 'other', label: 'Все інше' },
      ],
    },
  ];

  return (
    <div style={{ margin: '10px 0', color: 'black' }}>
      {groups.map(group => (
        <CheckboxGroup key={group.filterName} label={group.label} filterName={group.filterName} options={group.options} filters={filters} onChange={onChange} />
      ))}
    </div>
  );
};
