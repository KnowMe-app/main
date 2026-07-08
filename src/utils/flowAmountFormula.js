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

    if (rawChar === '$') {
      tokens.push({ type: 'identifier', name: 'USD' });
      index += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(rawChar) && !/[xX]/.test(rawChar)) {
      let name = '';
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) {
        name += expression[index];
        index += 1;
      }
      tokens.push({ type: 'identifier', name });
      continue;
    }

    if (/[xX]/.test(rawChar)) {
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

export const formatFlowAmountResult = value => {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round((Object.is(value, -0) ? 0 : value) * 100) / 100;
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
};

export const evaluateFlowAmountFormula = (rawFormula, resolveIdentifier) => {
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
    let term = parseTerm();
    let value = term.value;
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = peek().type;
      position += 1;
      const right = parseTerm();
      const isPercentSum = term.isPercent && right.isPercent;
      const rightValue = right.isPercent && !term.isPercent ? value * right.value : right.value;
      value = operator === '+' ? value + rightValue : value - rightValue;
      term = { value, isPercent: isPercentSum };
    }
    return term;
  };

  const parseTerm = () => {
    let factor = parseFactor();
    let value = factor.value;
    let isPercent = factor.isPercent;
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = peek().type;
      position += 1;
      const right = parseFactor();
      if (operator === '/' && right.value === 0) {
        throw new Error('Formula division by zero');
      }
      value = operator === '*' ? value * right.value : value / right.value;
      isPercent = false;
    }
    return { value, isPercent };
  };

  const parseFactor = () => {
    let value;
    let isPercent = false;
    if (consume('+')) {
      const factor = parseFactor();
      value = factor.value;
      isPercent = factor.isPercent;
    } else if (consume('-')) {
      const factor = parseFactor();
      value = -factor.value;
      isPercent = factor.isPercent;
    } else if (consume('(')) {
      const expressionResult = parseExpression();
      value = expressionResult.value;
      isPercent = expressionResult.isPercent;
      if (!consume(')')) {
        throw new Error('Formula closing parenthesis is missing');
      }
    } else if (peek()?.type === 'number') {
      value = peek().value;
      position += 1;
    } else if (peek()?.type === 'identifier') {
      const name = peek().name;
      const resolved = Number(resolveIdentifier?.(name));
      if (!Number.isFinite(resolved)) {
        throw new Error(`Formula identifier "${name}" is unresolved`);
      }
      value = resolved;
      position += 1;
    } else {
      throw new Error('Formula value is missing');
    }

    while (consume('%')) {
      value /= 100;
      isPercent = true;
    }
    return { value, isPercent };
  };

  if (tokens.length === 0) {
    throw new Error('Formula is empty');
  }

  const result = parseExpression().value;
  if (position !== tokens.length) {
    throw new Error('Formula has an unexpected token');
  }
  if (!Number.isFinite(result)) {
    throw new Error('Formula result is invalid');
  }
  return result;
};

export const resolveFlowAmountInput = (rawAmount, resolveIdentifier) => {
  const amountText = String(rawAmount || '').trim().replace(/,/g, '.');
  if (!amountText) return '';
  if (!amountText.startsWith(FLOW_FORMULA_PREFIX)) return amountText;
  return formatFlowAmountResult(evaluateFlowAmountFormula(amountText, resolveIdentifier));
};

export const isFormulaFlowAmount = rawAmount =>
  String(rawAmount || '').trim().startsWith(FLOW_FORMULA_PREFIX);
