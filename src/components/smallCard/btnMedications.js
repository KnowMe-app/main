export const btnMedications = (userData, onOpenMedications) => {
  if (!userData?.userId || typeof onOpenMedications !== 'function') {
    return null;
  }

  const handleClick = event => {
    event.stopPropagation();
    onOpenMedications(userData);
  };

  return (
    <button style={styles.button} onClick={handleClick}>
      Ліки
    </button>
  );
};

const styles = {
  button: {
    padding: '3px 6px',
    backgroundColor: 'purple',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    position: 'static',
  },
};
