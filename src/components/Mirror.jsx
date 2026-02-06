import React, { useMemo, useState } from 'react';
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
  padding: 18px 42px 32px 18px;
  background: #f9f9f9;
  border-radius: 16px;
  border: 1px solid #e1e1e1;
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

const HoleLine = styled.div`
  position: absolute;
  background: rgba(0, 0, 0, 0.2);
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

const HoleInput = styled.input`
  width: 70px;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
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

const Mirror = () => {
  const [mirrorWidth, setMirrorWidth] = useState(1280);
  const [mirrorHeight, setMirrorHeight] = useState(1784);
  const [holes, setHoles] = useState([
    { id: 'hole-1', label: 'Отвір 1', x: 862, y: 128, diameter: 120 },
    { id: 'hole-2', label: 'Отвір 2', x: 1125, y: 862, diameter: 120 },
    { id: 'hole-3', label: 'Отвір 3', x: 895, y: 1495, diameter: 76 },
  ]);

  const { stageWidth, stageHeight, scale } = useMemo(() => {
    const maxWidth = 280;
    const maxHeight = 420;
    const safeWidth = Math.max(mirrorWidth, 1);
    const safeHeight = Math.max(mirrorHeight, 1);
    const nextScale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight);
    return {
      stageWidth: safeWidth * nextScale,
      stageHeight: safeHeight * nextScale,
      scale: nextScale,
    };
  }, [mirrorHeight, mirrorWidth]);

  const handleDimensionChange = (setter, min, max) => event => {
    const value = Number(event.target.value);
    setter(clampValue(value, min, max));
  };

  const handleHoleChange = (id, key) => event => {
    const value = Number(event.target.value);
    setHoles(prev =>
      prev.map(hole =>
        hole.id === id
          ? { ...hole, [key]: clampValue(value, 0, 4000) }
          : hole,
      ),
    );
  };

  return (
    <MirrorLayout>
      <MirrorStage>
        <MirrorCanvas style={{ width: stageWidth, height: stageHeight }}>
          {holes.map(hole => {
            const centerX = hole.x * scale;
            const centerY = hole.y * scale;
            const diameter = hole.diameter * scale;
            const radius = diameter / 2;

            return (
              <React.Fragment key={hole.id}>
                <HoleLine
                  style={{
                    left: centerX,
                    top: 0,
                    width: 1,
                    height: stageHeight,
                    borderLeft: '1px dashed rgba(0, 0, 0, 0.35)',
                  }}
                />
                <HoleLine
                  style={{
                    left: 0,
                    top: centerY,
                    width: stageWidth,
                    height: 1,
                    borderTop: '1px dashed rgba(0, 0, 0, 0.35)',
                  }}
                />
                <HoleCircle
                  style={{
                    left: centerX - radius,
                    top: centerY - radius,
                    width: diameter,
                    height: diameter,
                  }}
                />
                <HoleLabel style={{ left: centerX, top: centerY + radius + 12 }}>
                  {`${hole.x}×${hole.y} мм, Ø${hole.diameter}`}
                </HoleLabel>
              </React.Fragment>
            );
          })}
        </MirrorCanvas>
        <WidthInputWrap>
          <DimInput
            type="number"
            value={mirrorWidth}
            onChange={handleDimensionChange(setMirrorWidth, 200, 4000)}
          />
          <span>мм</span>
        </WidthInputWrap>
        <HeightInputWrap>
          <DimInput
            type="number"
            value={mirrorHeight}
            onChange={handleDimensionChange(setMirrorHeight, 200, 4000)}
          />
          <span>мм</span>
        </HeightInputWrap>
      </MirrorStage>
      <Caption>
        Змінюйте розміри дзеркала та координати отворів (X — зліва, Y — зверху),
        щоб швидко перевіряти позиціонування.
      </Caption>
      <InputsGrid>
        {holes.map(hole => (
          <HoleCard key={hole.id}>
            <strong>{hole.label}</strong>
            <HoleRow>
              Горизонталь (X)
              <HoleInput
                type="number"
                value={hole.x}
                onChange={handleHoleChange(hole.id, 'x')}
              />
            </HoleRow>
            <HoleRow>
              Вертикаль (Y)
              <HoleInput
                type="number"
                value={hole.y}
                onChange={handleHoleChange(hole.id, 'y')}
              />
            </HoleRow>
            <HoleRow>
              Діаметр
              <HoleInput
                type="number"
                value={hole.diameter}
                onChange={handleHoleChange(hole.id, 'diameter')}
              />
            </HoleRow>
          </HoleCard>
        ))}
      </InputsGrid>
    </MirrorLayout>
  );
};

export default Mirror;
