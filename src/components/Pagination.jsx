import React from 'react';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import { KmIconButton } from './styles/knowme';

export const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const handlePrev = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  return (
    <div
      style={{
        margin: '20px 0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <KmIconButton
        type="button"
        onClick={handlePrev}
        disabled={currentPage === 1}
        aria-label="Попередня сторінка"
        title="Попередня сторінка"
      >
        <FaArrowLeft size={14} />
      </KmIconButton>
      <span style={{ color: 'var(--km-text)', fontSize: '14px' }}>{`${currentPage} / ${totalPages}`}</span>
      <KmIconButton
        type="button"
        onClick={handleNext}
        disabled={currentPage === totalPages}
        aria-label="Наступна сторінка"
        title="Наступна сторінка"
      >
        <FaArrowRight size={14} />
      </KmIconButton>
    </div>
  );
};
