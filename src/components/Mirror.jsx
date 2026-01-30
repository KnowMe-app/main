import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

const MirrorLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  color: #1d1d1d;
`;

const MirrorStage = styled.div`
  position: relative;
  display: inline-flex;
  padding: 0;
  background: #f9f9f9;
  border-radius: 16px;
  border: 1px solid #e1e1e1;
`;

const MirrorViewport = styled.div`
  position: relative;
`;

const MirrorCanvas = styled.div`
  position: relative;
  background: linear-gradient(135deg, #ffffff 0%, #f3f6fb 100%);
  border: 2px solid #7d7d7d;
  border-radius: 6px;
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.08);
`;

const DimInput = styled.input`
  width: 64px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #1d1d1d;
  outline: none;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type='number'] {
    -moz-appearance: textfield;
  }
`;

const FormulaInputWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const FormulaIndicator = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: #9b9b9b;
`;

const WidthInputWrap = styled.div`
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: #6b6b6b;
`;

const HeightInputWrap = styled.div`
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: #6b6b6b;
`;

const HoleCircle = styled.div`
  position: absolute;
  border: 2px solid #3a3a3a;
  border-radius: 50%;
  background: rgba(58, 58, 58, 0.05);
`;

const HoleLabel = styled.div`
  position: absolute;
  font-size: 10px;
  color: #444;
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 4px;
  border-radius: 4px;
  transform: translate(-50%, -50%);
`;

const InputsGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
`;

const HoleCard = styled.div`
  background: #ffffff;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HoleRow = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #4a4a4a;
`;

const HoleToggle = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4a4a4a;

  input {
    margin: 0;
  }
`;

const HoleInput = styled.input`
  width: 70px;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
`;

const HoleInputWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const AddHoleButton = styled.button`
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: #2f7df6;
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(47, 125, 246, 0.25);

  &:hover {
    background: #1f6ae4;
  }
`;

const Caption = styled.p`
  margin: 0;
  font-size: 12px;
  color: #6b6b6b;
  text-align: center;
`;

const clampValue = (value, min, max) => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const evaluateExpression = expression => {
  const sanitized = expression.replace(/\s+/g, '');
  if (!sanitized) return null;
  const tokens = sanitized.match(/(\d+(\.\d+)?|[()+\-*/])/g);
  if (!tokens) return null;

  const output = [];
  const operators = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

  const pushOperator = operator => {
    while (
      operators.length &&
      operators[operators.length - 1] !== '(' &&
      precedence[operators[operators.length - 1]] >= precedence[operator]
    ) {
      output.push(operators.pop());
    }
    operators.push(operator);
  };

  tokens.forEach((token, index) => {
    const prevToken = tokens[index - 1];
    if (token === '-' && (index === 0 || ['+', '-', '*', '/', '('].includes(prevToken))) {
      output.push('0');
      pushOperator(token);
      return;
    }
    if (/^\d/.test(token)) {
      output.push(token);
      return;
    }
    if (['+', '-', '*', '/'].includes(token)) {
      pushOperator(token);
      return;
    }
    if (token === '(') {
      operators.push(token);
      return;
    }
    if (token === ')') {
      while (operators.length && operators[operators.length - 1] !== '(') {
        output.push(operators.pop());
      }
      if (operators[operators.length - 1] === '(') {
        operators.pop();
      }
    }
  });

  while (operators.length) {
    output.push(operators.pop());
  }

  const stack = [];
  for (const token of output) {
    if (/^\d/.test(token)) {
      stack.push(Number(token));
      continue;
    }
    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined) return null;
    switch (token) {
      case '+':
        stack.push(left + right);
        break;
      case '-':
        stack.push(left - right);
        break;
      case '*':
        stack.push(left * right);
        break;
      case '/':
        stack.push(left / right);
        break;
      default:
        return null;
    }
  }

  return stack.length === 1 && Number.isFinite(stack[0]) ? stack[0] : null;
};

const parseFormulaValue = rawValue => {
  const text = rawValue.trim();
  if (!text) return null;
  if (text.startsWith('=')) {
    const expression = text.slice(1).trim();
    if (!expression || /[^0-9+\-*/().\s]/.test(expression)) {
      return null;
    }
    return evaluateExpression(expression);
  }
  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const STORAGE_KEY = 'mirror-layout-v1';
const DEFAULT_MIRROR_SIZE = { width: 1280, height: 1784 };
const DEFAULT_HOLES = [
  { id: 'hole-1', label: 'Отвір 1', x: 862, y: 128, diameter: 120, hidden: false },
  { id: 'hole-2', label: 'Отвір 2', x: 1125, y: 862, diameter: 120, hidden: false },
  { id: 'hole-3', label: 'Отвір 3', x: 895, y: 1495, diameter: 76, hidden: false },
];

const normalizeHoles = holes =>
  holes.map(hole => ({
    ...hole,
    hidden: Boolean(hole.hidden),
  }));

const getInitialMirrorState = () => {
  if (typeof window === 'undefined') {
    return { mirrorSize: DEFAULT_MIRROR_SIZE, holes: DEFAULT_HOLES };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mirrorSize: DEFAULT_MIRROR_SIZE, holes: DEFAULT_HOLES };
    const parsed = JSON.parse(raw);
    const mirrorSize = parsed?.mirrorSize;
    const holes = Array.isArray(parsed?.holes) ? parsed.holes : null;
    if (
      mirrorSize &&
      Number.isFinite(mirrorSize.width) &&
      Number.isFinite(mirrorSize.height) &&
      holes
    ) {
      return { mirrorSize, holes: normalizeHoles(holes) };
    }
  } catch (error) {
    return { mirrorSize: DEFAULT_MIRROR_SIZE, holes: DEFAULT_HOLES };
  }
  return { mirrorSize: DEFAULT_MIRROR_SIZE, holes: DEFAULT_HOLES };
};

const Mirror = () => {
  const initialStateRef = useRef(getInitialMirrorState());
  const { mirrorSize: initialMirrorSize, holes: initialHoles } = initialStateRef.current;
  const [mirrorSize, setMirrorSize] = useState(initialMirrorSize);
  const [mirrorInputs, setMirrorInputs] = useState({
    width: String(initialMirrorSize.width),
    height: String(initialMirrorSize.height),
  });
  const [mirrorDrafts, setMirrorDrafts] = useState({
    width: String(initialMirrorSize.width),
    height: String(initialMirrorSize.height),
  });
  const [holes, setHoles] = useState(initialHoles);
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  }));
  const [holeInputs, setHoleInputs] = useState(() =>
    Object.fromEntries(
      initialHoles.map(hole => [
        hole.id,
        { x: String(hole.x), y: String(hole.y), diameter: String(hole.diameter) },
      ]),
    ),
  );
  const [holeDrafts, setHoleDrafts] = useState(() =>
    Object.fromEntries(
      initialHoles.map(hole => [
        hole.id,
        { x: String(hole.x), y: String(hole.y), diameter: String(hole.diameter) },
      ]),
    ),
  );
  const [focusedField, setFocusedField] = useState(null);
  const nextHoleIndex = useRef(holes.length + 1);
  const visibleHoles = useMemo(() => holes.filter(hole => !hole.hidden), [holes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { stageWidth, stageHeight, scale, offsetX, offsetY, isRotated } = useMemo(() => {
    const padding = 5;
    const maxWidth = Math.max(windowSize.width - padding * 2, 260);
    const maxHeight = Math.max(windowSize.height - padding * 2, 260);
    const safeMirrorWidth = Math.max(mirrorSize.width, 1);
    const safeMirrorHeight = Math.max(mirrorSize.height, 1);
    const rotate = safeMirrorHeight > safeMirrorWidth;
    const displayWidth = rotate ? safeMirrorHeight : safeMirrorWidth;
    const displayHeight = rotate ? safeMirrorWidth : safeMirrorHeight;
    let minX = 0;
    let minY = 0;
    let maxX = displayWidth;
    let maxY = displayHeight;

    const transformPoint = hole => ({
      x: rotate ? displayWidth - hole.y : hole.x,
      y: rotate ? hole.x : hole.y,
      diameter: hole.diameter,
    });

    visibleHoles.forEach(hole => {
      const transformed = transformPoint(hole);
      const radius = transformed.diameter / 2;
      minX = Math.min(minX, transformed.x - radius);
      minY = Math.min(minY, transformed.y - radius);
      maxX = Math.max(maxX, transformed.x + radius);
      maxY = Math.max(maxY, transformed.y + radius);
    });

    const boundsWidth = Math.max(maxX - minX, 1);
    const boundsHeight = Math.max(maxY - minY, 1);
    const usableWidth = Math.max(maxWidth - padding * 2, 1);
    const usableHeight = Math.max(maxHeight - padding * 2, 1);
    const nextScale = Math.min(usableWidth / boundsWidth, usableHeight / boundsHeight);
    return {
      stageWidth: boundsWidth * nextScale + padding * 2,
      stageHeight: boundsHeight * nextScale + padding * 2,
      scale: nextScale,
      offsetX: (0 - minX) * nextScale + padding,
      offsetY: (0 - minY) * nextScale + padding,
      isRotated: rotate,
    };
  }, [
    mirrorSize.height,
    mirrorSize.width,
    visibleHoles,
    windowSize.height,
    windowSize.width,
  ]);

  const handleMirrorInputChange = key => event => {
    const value = event.target.value;
    setMirrorDrafts(prev => ({ ...prev, [key]: value }));
  };

  const commitMirrorInput = key => {
    const rawValue = mirrorDrafts[key];
    const parsedValue = parseFormulaValue(rawValue);
    if (parsedValue === null) {
      setMirrorInputs(prev => ({
        ...prev,
        [key]: String(mirrorSize[key]),
      }));
      setMirrorDrafts(prev => ({
        ...prev,
        [key]: String(mirrorSize[key]),
      }));
      return;
    }

    const min = 200;
    const max = 4000;
    const clampedValue = clampValue(parsedValue, min, max);
    const nextSize = {
      ...mirrorSize,
      [key]: clampedValue,
    };

    setMirrorSize(nextSize);
    setMirrorInputs({
      width: String(Math.round(nextSize.width)),
      height: String(Math.round(nextSize.height)),
    });
  };

  const handleHoleInputChange = (id, key) => event => {
    const value = event.target.value;
    setHoleDrafts(prev => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }));
  };

  const commitHoleInput = (id, key) => {
    const rawValue = holeDrafts[id]?.[key] ?? '';
    const parsedValue = parseFormulaValue(rawValue);
    if (parsedValue === null) {
      setHoleInputs(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          [key]: String(holes.find(hole => hole.id === id)?.[key] ?? 0),
        },
      }));
      setHoleDrafts(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          [key]: String(holes.find(hole => hole.id === id)?.[key] ?? 0),
        },
      }));
      return;
    }
    const clampedValue = clampValue(parsedValue, 0, 4000);
    setHoles(prev =>
      prev.map(hole =>
        hole.id === id ? { ...hole, [key]: clampedValue } : hole,
      ),
    );
    setHoleInputs(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: String(Math.round(clampedValue)),
      },
    }));
  };

  const handleHoleInputKeyDown = (id, key) => event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitHoleInput(id, key);
    }
  };

  const handleMirrorInputKeyDown = key => event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitMirrorInput(key);
    }
  };

  const handleAddHole = () => {
    const newId = `hole-${nextHoleIndex.current}`;
    const newHole = {
      id: newId,
      label: `Отвір ${nextHoleIndex.current}`,
      x: 200,
      y: 200,
      diameter: 80,
      hidden: false,
    };
    nextHoleIndex.current += 1;
    setHoles(prev => [...prev, newHole]);
    setHoleInputs(prev => ({
      ...prev,
      [newId]: {
        x: String(newHole.x),
        y: String(newHole.y),
        diameter: String(newHole.diameter),
      },
    }));
    setHoleDrafts(prev => ({
      ...prev,
      [newId]: {
        x: String(newHole.x),
        y: String(newHole.y),
        diameter: String(newHole.diameter),
      },
    }));
  };

  const handleToggleHoleVisibility = id => event => {
    const { checked } = event.target;
    setHoles(prev =>
      prev.map(hole => (hole.id === id ? { ...hole, hidden: !checked } : hole)),
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = { mirrorSize, holes };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [mirrorSize, holes]);

  const overlapData = useMemo(() => {
    const overlaps = new Set();
    for (let i = 0; i < visibleHoles.length; i += 1) {
      for (let j = i + 1; j < visibleHoles.length; j += 1) {
        const holeA = visibleHoles[i];
        const holeB = visibleHoles[j];
        const dx = holeA.x - holeB.x;
        const dy = holeA.y - holeB.y;
        const distance = Math.hypot(dx, dy);
        const radiusSum = holeA.diameter / 2 + holeB.diameter / 2;
        if (distance < radiusSum) {
          overlaps.add(holeA.id);
          overlaps.add(holeB.id);
        }
      }
    }
    const overlapIds = visibleHoles
      .filter(hole => overlaps.has(hole.id))
      .map(hole => hole.id);
    return { overlaps, overlapIds };
  }, [visibleHoles]);

  const overlapPalette = ['#d64545', '#2f7df6', '#2e9b5f', '#b56c16', '#7a49c7'];

  const displayMirrorWidth = isRotated ? mirrorSize.height : mirrorSize.width;
  const displayMirrorHeight = isRotated ? mirrorSize.width : mirrorSize.height;
  const scaledMirrorWidth = displayMirrorWidth * scale;
  const scaledMirrorHeight = displayMirrorHeight * scale;
  const getHoleNumber = hole => {
    const labelMatch = hole.label?.match(/\d+/);
    if (labelMatch) return labelMatch[0];
    const idMatch = hole.id?.match(/\d+/);
    return idMatch ? idMatch[0] : '';
  };

  return (
    <MirrorLayout>
      <MirrorStage>
        <MirrorViewport style={{ width: stageWidth, height: stageHeight }}>
          <MirrorCanvas
            style={{
              width: scaledMirrorWidth,
              height: scaledMirrorHeight,
              position: 'absolute',
              left: offsetX,
              top: offsetY,
            }}
          >
            {visibleHoles.map(hole => {
              const displayX = isRotated ? displayMirrorWidth - hole.y : hole.x;
              const displayY = isRotated ? hole.x : hole.y;
              const centerX = displayX * scale;
              const centerY = displayY * scale;
              const diameter = hole.diameter * scale;
              const radius = diameter / 2;

              return (
                <React.Fragment key={hole.id}>
                  <HoleCircle
                    style={{
                      left: centerX - radius,
                      top: centerY - radius,
                      width: diameter,
                      height: diameter,
                      borderColor: overlapData.overlaps.has(hole.id)
                        ? overlapPalette[
                            overlapData.overlapIds.indexOf(hole.id) %
                              overlapPalette.length
                          ]
                        : '#3a3a3a',
                    }}
                  />
                  <HoleLabel style={{ left: centerX, top: centerY + radius + 12 }}>
                    {getHoleNumber(hole)}
                  </HoleLabel>
                </React.Fragment>
              );
            })}
          </MirrorCanvas>
        </MirrorViewport>
        <WidthInputWrap>
          <FormulaInputWrap>
            <DimInput
              type="text"
              inputMode="text"
              value={
                focusedField?.scope === 'mirror' && focusedField.key === 'width'
                  ? mirrorDrafts.width
                  : mirrorInputs.width
              }
              onChange={handleMirrorInputChange('width')}
              onFocus={() => setFocusedField({ scope: 'mirror', key: 'width' })}
              onBlur={() => {
                commitMirrorInput('width');
                setFocusedField(null);
              }}
              onKeyDown={handleMirrorInputKeyDown('width')}
            />
          </FormulaInputWrap>
          <span>мм</span>
        </WidthInputWrap>
        <HeightInputWrap>
          <FormulaInputWrap>
            <DimInput
              type="text"
              inputMode="text"
              value={
                focusedField?.scope === 'mirror' && focusedField.key === 'height'
                  ? mirrorDrafts.height
                  : mirrorInputs.height
              }
              onChange={handleMirrorInputChange('height')}
              onFocus={() => setFocusedField({ scope: 'mirror', key: 'height' })}
              onBlur={() => {
                commitMirrorInput('height');
                setFocusedField(null);
              }}
              onKeyDown={handleMirrorInputKeyDown('height')}
            />
          </FormulaInputWrap>
          <span>мм</span>
        </HeightInputWrap>
      </MirrorStage>
      <Caption>
        Змінюйте розміри дзеркала та координати отворів (X — зліва, Y — зверху).
        Формули вводьте через знак "=".
      </Caption>
      <AddHoleButton type="button" onClick={handleAddHole}>
        Додати отвір
      </AddHoleButton>
      <InputsGrid>
        {holes.map(hole => (
          <HoleCard key={hole.id}>
            <strong>{hole.label}</strong>
            <HoleToggle>
              <input
                type="checkbox"
                checked={!hole.hidden}
                onChange={handleToggleHoleVisibility(hole.id)}
              />
              Показувати на дзеркалі
            </HoleToggle>
            <HoleRow>
              Горизонталь (X)
              <HoleInputWrap>
                <FormulaIndicator>=</FormulaIndicator>
                <HoleInput
                  type="text"
                  inputMode="text"
                  value={
                    focusedField?.scope === 'hole' &&
                    focusedField.id === hole.id &&
                    focusedField.key === 'x'
                      ? holeDrafts[hole.id]?.x ?? ''
                      : holeInputs[hole.id]?.x ?? ''
                  }
                  onChange={handleHoleInputChange(hole.id, 'x')}
                  onFocus={() =>
                    setFocusedField({ scope: 'hole', id: hole.id, key: 'x' })
                  }
                  onBlur={() => {
                    commitHoleInput(hole.id, 'x');
                    setFocusedField(null);
                  }}
                  onKeyDown={handleHoleInputKeyDown(hole.id, 'x')}
                />
              </HoleInputWrap>
            </HoleRow>
            <HoleRow>
              Вертикаль (Y)
              <HoleInputWrap>
                <FormulaIndicator>=</FormulaIndicator>
                <HoleInput
                  type="text"
                  inputMode="text"
                  value={
                    focusedField?.scope === 'hole' &&
                    focusedField.id === hole.id &&
                    focusedField.key === 'y'
                      ? holeDrafts[hole.id]?.y ?? ''
                      : holeInputs[hole.id]?.y ?? ''
                  }
                  onChange={handleHoleInputChange(hole.id, 'y')}
                  onFocus={() =>
                    setFocusedField({ scope: 'hole', id: hole.id, key: 'y' })
                  }
                  onBlur={() => {
                    commitHoleInput(hole.id, 'y');
                    setFocusedField(null);
                  }}
                  onKeyDown={handleHoleInputKeyDown(hole.id, 'y')}
                />
              </HoleInputWrap>
            </HoleRow>
            <HoleRow>
              Діаметр
              <HoleInputWrap>
                <FormulaIndicator>=</FormulaIndicator>
                <HoleInput
                  type="text"
                  inputMode="text"
                  value={
                    focusedField?.scope === 'hole' &&
                    focusedField.id === hole.id &&
                    focusedField.key === 'diameter'
                      ? holeDrafts[hole.id]?.diameter ?? ''
                      : holeInputs[hole.id]?.diameter ?? ''
                  }
                  onChange={handleHoleInputChange(hole.id, 'diameter')}
                  onFocus={() =>
                    setFocusedField({ scope: 'hole', id: hole.id, key: 'diameter' })
                  }
                  onBlur={() => {
                    commitHoleInput(hole.id, 'diameter');
                    setFocusedField(null);
                  }}
                  onKeyDown={handleHoleInputKeyDown(hole.id, 'diameter')}
                />
              </HoleInputWrap>
            </HoleRow>
          </HoleCard>
        ))}
      </InputsGrid>
    </MirrorLayout>
  );
};

export default Mirror;
