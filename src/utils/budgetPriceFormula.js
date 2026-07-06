// Formula support for budget prices, mirroring the Flow amount formulas.
// A price starting with "=" is a formula: numbers, + - * / ( ) and identifiers.
// Identifiers: EUR / USD resolve to the NBU UAH rate, idNN resolves to the
// price of budget item NN (so a service can be composed of sub-services).

export const BUDGET_FORMULA_PREFIX = '=';

const ITEM_REFERENCE_REGEX = /\bid(\d+)\b/gi;

const normalizeFormulaOperator = char => {
  if (char === '×' || char === 'x' || char === 'X' || char === 'х' || char === 'Х') return '*';
  if (char === '÷' || char === ':') return '/';
  if (char === '−' || char === '–' || char === '—') return '-';
  return char;
};

export const isBudgetPriceFormula = value =>
  typeof value === 'string' && value.trim().startsWith(BUDGET_FORMULA_PREFIX);

export const stripBudgetFormulaPrefix = value => {
  const text = String(value || '').trim();
  return text.startsWith(BUDGET_FORMULA_PREFIX) ? text.slice(BUDGET_FORMULA_PREFIX.length) : text;
};

export const extractBudgetFormulaItemIds = value => {
  const ids = [];
  for (const match of String(value || '').matchAll(ITEM_REFERENCE_REGEX)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
};

const tokenizeBudgetFormula = rawExpression => {
  const expression = String(rawExpression || '');
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const rawChar = expression[index];
    const char = normalizeFormulaOperator(rawChar);

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/\d/.test(char) || char === '.' || char === ',') {
      let numberText = '';
      let decimalSeen = false;

      while (index < expression.length) {
        const nextChar = expression[index];
        if (/\d/.test(nextChar)) {
          numberText += nextChar;
          index += 1;
          continue;
        }
        if (nextChar === '.' || nextChar === ',') {
          if (decimalSeen) break;
          decimalSeen = true;
          numberText += '.';
          index += 1;
          continue;
        }
        break;
      }

      if (!/\d/.test(numberText)) {
        throw new Error('Formula number is invalid');
      }
      tokens.push({ type: 'number', value: Number(numberText) });
      continue;
    }

    if (/[A-Za-z_]/.test(rawChar) && !/[xXхХ]/.test(rawChar)) {
      let name = '';
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) {
        name += expression[index];
        index += 1;
      }
      tokens.push({ type: 'identifier', name });
      continue;
    }

    if (/[xXхХ]/.test(rawChar)) {
      tokens.push({ type: '*' });
      index += 1;
      continue;
    }

    if ('+-*/()%'.includes(char)) {
      tokens.push({ type: char });
      index += 1;
      continue;
    }

    throw new Error('Formula contains unsupported characters');
  }

  return tokens;
};

export const evaluateBudgetPriceFormula = (rawFormula, resolveIdentifier) => {
  const tokens = tokenizeBudgetFormula(stripBudgetFormulaPrefix(rawFormula));
  let position = 0;

  const peek = () => tokens[position];
  const consume = type => {
    if (peek()?.type !== type) return false;
    position += 1;
    return true;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = peek().type;
      position += 1;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = () => {
    let value = parseFactor();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = peek().type;
      position += 1;
      const right = parseFactor();
      if (operator === '/' && right === 0) {
        throw new Error('Formula division by zero');
      }
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  const parseFactor = () => {
    let value;
    if (consume('+')) {
      value = parseFactor();
    } else if (consume('-')) {
      value = -parseFactor();
    } else if (consume('(')) {
      value = parseExpression();
      if (!consume(')')) {
        throw new Error('Formula closing parenthesis is missing');
      }
    } else if (peek()?.type === 'number') {
      value = peek().value;
      position += 1;
    } else if (peek()?.type === 'identifier') {
      const resolved = Number(resolveIdentifier?.(peek().name));
      if (!Number.isFinite(resolved)) {
        throw new Error(`Formula identifier "${peek().name}" is unresolved`);
      }
      value = resolved;
      position += 1;
    } else {
      throw new Error('Formula value is missing');
    }

    while (consume('%')) {
      value /= 100;
    }
    return value;
  };

  if (tokens.length === 0) {
    throw new Error('Formula is empty');
  }

  const result = parseExpression();
  if (position !== tokens.length) {
    throw new Error('Formula has an unexpected token');
  }
  if (!Number.isFinite(result)) {
    throw new Error('Formula result is invalid');
  }
  return result;
};
