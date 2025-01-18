export const fieldMaritalStatus = maritalStatus => {
    switch (maritalStatus) {
      case 'Yes':
      case '+':
        return 'Заміжня';
      case 'No':
      case '-':
        return 'Незаміжня';
      default:
        return maritalStatus || '';
    }
  };