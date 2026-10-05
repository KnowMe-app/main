import React, { useMemo } from 'react';
import styled from 'styled-components';
import { uiText } from '../../utils/uiTranslations';
import { useCardPrograms } from './CardRoleBlock';
import { ProgramCard } from './ProgramsView';

const Frame = styled.section`
  margin: -11px -11px 10px;
  background: var(--matching-section-bg, var(--km-bg, #faf8f5));
  border-bottom: 1px solid var(--matching-card-border, var(--km-border, #e7e1d8));
`;

const Rail = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scroll-snap-type: inline mandatory;
  scrollbar-width: none;
  touch-action: pan-x pan-y;
  &::-webkit-scrollbar { display: none; }
`;

const Slide = styled.div`
  min-width: 0;
  scroll-snap-align: start;
  scroll-snap-stop: always;
`;

const PhotoButton = styled.button`
  position: relative;
  display: block;
  width: 100%;
  height: min(40vh, 320px);
  padding: 0;
  border: 0;
  background: var(--matching-section-bg, #eee9e2);
  cursor: zoom-in;
  img { width: 100%; height: 100%; display: block; object-fit: cover; }
  &:focus-visible { outline: 3px solid var(--matching-accent, var(--km-accent, #e8791a)); outline-offset: -3px; }
`;

const ProgramSlide = styled.div`
  box-sizing: border-box;
  min-height: min(40vh, 320px);
  padding: 14px 12px 16px;
  background: var(--matching-card-bg, var(--km-card, #fff));
`;

const Eyebrow = styled.div`
  margin: 0 2px 9px;
  color: var(--matching-muted-text, var(--km-muted, #6f675f));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
`;

const Pager = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 2px 10px;
  color: var(--matching-muted-text, var(--km-muted, #6f675f));
  font-size: 11px;
`;

const Dot = styled.i`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $program }) => ($program ? 'var(--matching-accent, var(--km-accent, #e8791a))' : 'currentColor')};
  opacity: ${({ $program }) => ($program ? 1 : .45)};
`;

/**
 * Єдина свайп-зона організації: спочатку програми, потім її фото.
 * Без обох видів вмісту компонент не займає місця — лишається компактна
 * контактна картка. Нативний scroll-snap не перехоплює вертикаль сторінки.
 */
export const AgencyMediaCarousel = ({ card, photos = [], programsContext, language, onOpenPhoto }) => {
  const { programs } = useCardPrograms(card, true);
  const visiblePrograms = useMemo(() => programs.filter(program => !program.hidden), [programs]);
  const total = photos.length + visiblePrograms.length;
  if (!total) return null;

  return (
    <Frame aria-label={uiText('Фото та програми агенції', language)} onClick={event => event.stopPropagation()}>
      <Rail data-testid="agency-media-carousel">
        {visiblePrograms.map((program, index) => (
          <Slide key={program.id}>
            <ProgramSlide>
              <Eyebrow>{uiText('Програма {current} з {total}', language, { current: index + 1, total: visiblePrograms.length })}</Eyebrow>
              <ProgramCard
                program={program}
                facts={programsContext?.viewerType === program.type ? programsContext.facts : null}
                rates={programsContext?.rates}
                language={language}
              />
            </ProgramSlide>
          </Slide>
        ))}
        {photos.map((photo, index) => (
          <Slide key={`photo-${photo}-${index}`}>
            <PhotoButton type="button" onClick={() => onOpenPhoto?.(index)} aria-label={uiText('Відкрити фото', language)}>
              <img src={photo} alt="" />
            </PhotoButton>
          </Slide>
        ))}
      </Rail>
      {total > 1 ? (
        <Pager aria-hidden="true">
          {visiblePrograms.map(program => <Dot key={`program-dot-${program.id}`} $program />)}
          {photos.map((_, index) => <Dot key={`photo-dot-${index}`} />)}
          <span>{uiText('Свайпайте фото й програми', language)}</span>
        </Pager>
      ) : null}
    </Frame>
  );
};

export default AgencyMediaCarousel;
