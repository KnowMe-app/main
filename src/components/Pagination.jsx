import React from 'react';

export const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div style={{ margin: '20px 0', display: 'flex', justifyContent: 'center' }}>
      {pages.map(page => (
        <button
          key={page}
          style={{
            margin: '0 5px',
            padding: '5px 10px',
            backgroundColor: page === currentPage ? '#ddd' : '#fff',
          }}
          onClick={() => onPageChange(page)}
          disabled={page === currentPage}
        >
          {page}
        </button>
      ))}
    </div>
  );
};
