import React from 'react';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';

export const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const handlePrev = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  const buttonStyle = {
    margin: '0 5px',
    padding: '5px 10px',
  };

  return (
    <div
      style={{
        margin: '20px 0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <button
        onClick={handlePrev}
        disabled={currentPage === 1}
        style={buttonStyle}
      >
        <FaArrowLeft />
      </button>
      <span style={{ margin: '0 10px' }}>{`${currentPage} / ${totalPages}`}</span>
      <button
        onClick={handleNext}
        disabled={currentPage === totalPages}
        style={buttonStyle}
      >
        <FaArrowRight />
      </button>
    </div>
  );
};
