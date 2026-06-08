const FLOW_FORMULA_PREFIX = '=';

const normalizeFormulaOperator = char => {
  if (char === '×' || char === 'x' || char === 'X' || char === 'х' || char === 'Х') return '*';
  if (char === '÷' || char === ':') return '/';
  if (char === '−' || char === '–' || char === '—') return '-';
  return char;
};

const tokenizeFormula = rawExpression => {
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

    if ('+-*/()%'.includes(char)) {
      tokens.push({ type: char });
      index += 1;
      continue;
    }

    throw new Error('Formula contains unsupported characters');
  }

  return tokens;
};

export const formatFlowAmountResult = value => {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round((Object.is(value, -0) ? 0 : value) * 100) / 100;
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
};

export const evaluateFlowAmountFormula = rawFormula => {
  const formulaText = String(rawFormula || '').trim();
  const expression = formulaText.startsWith(FLOW_FORMULA_PREFIX)
    ? formulaText.slice(FLOW_FORMULA_PREFIX.length)
    : formulaText;
  const tokens = tokenizeFormula(expression);
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

export const resolveFlowAmountInput = rawAmount => {
  const amountText = String(rawAmount || '').trim().replace(/,/g, '.');
  if (!amountText) return '';
  if (!amountText.startsWith(FLOW_FORMULA_PREFIX)) return amountText;
  return formatFlowAmountResult(evaluateFlowAmountFormula(amountText));
};

export const isFormulaFlowAmount = rawAmount =>
  String(rawAmount || '').trim().startsWith(FLOW_FORMULA_PREFIX);
