import styled, { css, keyframes } from 'styled-components';
import { color } from './styles';

const STACK_CARD_RADIUS = '18px';

const matchingThemeVars = css`
  --matching-page-bg: ${({ $themeMode }) => ($themeMode === 'light'
    ? '#F6F7F9'
    : 'radial-gradient(circle at 50% 0%, rgba(247, 147, 30, 0.11), transparent 32%), linear-gradient(180deg, #17120e 0%, #0c0a09 100%)')};
  --matching-shell-bg: ${({ $themeMode }) => ($themeMode === 'light'
    ? '#F6F7F9'
    : 'radial-gradient(circle at 18% 0%, rgba(247, 147, 30, 0.16), transparent 28%), linear-gradient(180deg, #17120e 0%, #0c0a09 100%)')};
  --matching-card-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : '#17120e')};
  --matching-card-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8E2D8' : 'rgba(255, 214, 148, 0.14)')};
  --matching-card-shadow: ${({ $themeMode }) => ($themeMode === 'light'
    ? '0 16px 34px rgba(22, 22, 22, 0.08)'
    : '0 18px 40px rgba(0, 0, 0, 0.3), 0 0 22px rgba(247, 147, 30, 0.05)')};
  --matching-header-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#161616' : '#fff8ec')};
  --matching-muted-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#6B7280' : 'rgba(255, 248, 236, 0.88)')};
  --matching-panel-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : '#15120f')};
  --matching-panel-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#161616' : '#fff8ec')};
  --matching-section-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : 'rgba(26, 23, 20, 0.82)')};
  --matching-section-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8E2D8' : 'rgba(255, 214, 148, 0.11)')};
  --matching-section-shadow: ${({ $themeMode }) => ($themeMode === 'light' ? '0 10px 24px rgba(22, 22, 22, 0.06)' : '0 12px 28px rgba(0, 0, 0, 0.18)')};
  --matching-section-title: ${({ $themeMode }) => ($themeMode === 'light' ? '#161616' : '#ffd18a')};
  --matching-chip-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.045)')};
  --matching-chip-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E5E0D8' : 'rgba(255, 214, 148, 0.12)')};
  --matching-chip-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#161616' : '#fff8ec')};
  --matching-chip-label: ${({ $themeMode }) => ($themeMode === 'light' ? '#6B7280' : 'rgba(247, 185, 95, 0.76)')};
  --matching-accent: ${({ $themeMode }) => ($themeMode === 'light' ? '#FF9500' : '#f7931e')};
  --matching-contact-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#2A2A2A' : '#ffd899')};
  --matching-contact-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E5E0D8' : 'rgba(255, 214, 148, 0.12)')};
  --matching-hero-fallback: ${({ $themeMode }) => ($themeMode === 'light'
    ? 'linear-gradient(145deg, #e8edf4 0%, #d7dee8 100%)'
    : 'radial-gradient(circle at 26% 16%, rgba(247, 147, 30, 0.54), transparent 30%), radial-gradient(circle at 78% 18%, rgba(255, 218, 145, 0.16), transparent 24%), linear-gradient(145deg, #3a281b 0%, #15110f 56%, #070605 100%)')};
  --matching-hero-bottom: ${({ $themeMode }) => ($themeMode === 'light'
    ? 'linear-gradient(180deg, rgba(22, 22, 22, 0) 0%, rgba(22, 22, 22, 0.22) 100%)'
    : 'linear-gradient(180deg, transparent 0%, rgba(9, 7, 5, 0.36) 46%, rgba(9, 7, 5, 0.66) 100%)')};
  --matching-rail-bg: ${({ $themeMode }) => ($themeMode === 'light'
    ? 'rgba(246, 247, 249, 0.72)'
    : 'rgba(12, 9, 7, 0.72)')};
  --matching-rail-border: ${({ $themeMode }) => ($themeMode === 'light' ? 'rgba(229, 224, 216, 0.82)' : 'rgba(255, 214, 148, 0.1)')};
  --matching-action-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : '#211b16')};
  --matching-action-color: ${({ $themeMode }) => ($themeMode === 'light' ? '#FF9500' : '#fff8ec')};
  --matching-action-shadow: ${({ $themeMode }) => ($themeMode === 'light' ? '0 8px 18px rgba(22, 22, 22, 0.10)' : '0 8px 18px rgba(0, 0, 0, 0.22)')};
  color-scheme: ${({ $themeMode }) => ($themeMode === 'light' ? 'light' : 'dark')};
  transition: background 280ms cubic-bezier(0.4, 0, 0.2, 1), color 280ms cubic-bezier(0.4, 0, 0.2, 1);
`;

export const ROLE_COLORS = {
  ed: { accent: '#c2185b', light: 'rgba(194,24,91,0.07)', border: 'rgba(194,24,91,0.22)', text: '#9c1057', tag: 'rgba(252,228,236,0.9)' },
  ag: { accent: '#1565c0', light: 'rgba(21,101,192,0.07)', border: 'rgba(21,101,192,0.22)', text: '#0d47a1', tag: 'rgba(227,242,253,0.9)' },
  ip: { accent: '#00695c', light: 'rgba(0,105,92,0.07)', border: 'rgba(0,105,92,0.22)', text: '#004d40', tag: 'rgba(224,242,241,0.9)' },
  sm: { accent: '#6a1b9a', light: 'rgba(106,27,154,0.07)', border: 'rgba(106,27,154,0.22)', text: '#4a148c', tag: 'rgba(243,229,245,0.9)' },
  cl: { accent: '#0277bd', light: 'rgba(2,119,189,0.07)', border: 'rgba(2,119,189,0.22)', text: '#01579b', tag: 'rgba(225,245,254,0.9)' },
};

export const getRoleColors = role => ROLE_COLORS[role] || {
  accent: color.accent5,
  light: 'rgba(247,147,30,0.08)',
  border: 'rgba(247,147,30,0.25)',
  text: color.accent3,
  tag: 'rgba(255,243,224,0.9)',
};

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100dvh;
  padding: 0;
  ${matchingThemeVars}
  background: var(--matching-page-bg);
`;

export const InnerContainer = styled.div`
  max-width: 480px;
  width: 100%;
  min-height: 100dvh;
  background: transparent;
  padding: 0;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.22);
  border-radius: 8px;
  box-sizing: border-box;
  position: relative;

  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    box-shadow: none;
    border-radius: 0;
  }
`;

export const Grid = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  gap: 0;
  padding: 0 10px 10px;
  margin-bottom: 0;
  justify-content: center;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
`;

export const LoadMoreFooter = styled.div`
  position: relative;
  z-index: 5;
  display: flex;
  justify-content: center;
  padding: 6px 12px 24px;
`;

export const CardContainer = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 0;
`;

export const NextPhoto = styled.img`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  box-sizing: border-box;
  border: 2px solid ${color.gray3};
  border-radius: ${STACK_CARD_RADIUS};
  transform: translate(4px, -4px);
  z-index: 1;
`;

export const ThirdPhoto = styled.img`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  box-sizing: border-box;
  border: 2px solid ${color.gray4};
  border-radius: ${STACK_CARD_RADIUS};
  transform: translate(8px, -8px);
  z-index: 0;
`;

export const NextInfoCard = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 2px solid ${color.gray3};
  border-radius: ${STACK_CARD_RADIUS};
  transform: translate(4px, -4px);
  z-index: 1;
  background: var(--matching-card-bg, #fff);
  overflow: hidden;
`;

export const ThirdInfoCard = styled(NextInfoCard)`
  border-color: ${color.gray4};
  transform: translate(8px, -8px);
  z-index: 0;
`;

export const CardWrapper = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  border: 1px solid var(--matching-card-border, #E8E2D8);
  border-radius: ${STACK_CARD_RADIUS};
  box-sizing: border-box;
  overflow: hidden;
  background: var(--matching-card-bg, #fffdfa);
  box-shadow: var(--matching-card-shadow, 0 14px 32px rgba(33, 26, 17, 0.12));
  transition: background 280ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 280ms cubic-bezier(0.4, 0, 0.2, 1), border-color 280ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
`;

export const CommentInput = styled.textarea`
  width: 100%;
  margin: 0;
  display: block;
  box-sizing: border-box;
  padding: 0 40px 0 10px;
  resize: none;
  overflow: hidden;
  height: 16px;
  min-height: 16px;
  line-height: 16px;
  border: ${props => (props.plain ? 'none' : `1px solid ${color.gray3}`)};
  border-radius: ${props => (props.plain ? '0' : '8px')};
  outline: ${props => (props.plain ? 'none' : 'auto')};
`;

export const CommentBox = styled.div`
  position: relative;
  width: 100%;
`;

export const SharedCommentText = styled.div`
  padding: 0 10px 3px;
  font-size: 12px;
  line-height: 1.25;
  color: ${color.gray1};
  font-style: italic;
  white-space: pre-wrap;
  word-break: break-word;
`;

export const Card = styled.div`
  width: 100%;
  height: auto;
  aspect-ratio: ${({ $hasPhoto, $small }) =>
    $hasPhoto ? ($small ? '4 / 5' : '3 / 4') : 'auto'};
  min-height: ${({ $hasPhoto, $small, $compactWithoutPhoto }) =>
    !$hasPhoto && $compactWithoutPhoto ? ($small ? '180px' : '220px') : $small ? '260px' : '320px'};
  padding-bottom: 0;
  background: linear-gradient(180deg, #fffaf2 0%, #f8f5ef 100%);
  background-size: cover;
  background-position: center;
  border-radius: ${STACK_CARD_RADIUS};
  position: relative;
  overflow: hidden;
  box-shadow:
    0 10px 26px rgba(37, 29, 20, 0.14),
    0 0 0 1px rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.72);
  isolation: isolate;
  margin-bottom: 0;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 40%;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 0%, rgba(19, 15, 12, 0.58) 100%);
    pointer-events: none;
    z-index: 1;
  }
`;

const loadingWave = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`;

export const SkeletonCardInner = styled.div`
  position: relative;
  width: 100%;
  height: auto;
  aspect-ratio: ${({ $small }) => ($small ? '4 / 5' : '3 / 4')};
  min-height: ${({ $small }) => ($small ? '280px' : '340px')};
  overflow: hidden;
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 20%;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.5) 100%
    );
    pointer-events: none;
    z-index: 0;
  }
`;

export const SkeletonPhoto = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='30' r='20' fill='%23ccc'/%3E%3Crect x='15' y='55' width='70' height='35' fill='%23ccc'/%3E%3C/svg%3E");
  background-size: cover;
  background-position: center;
  filter: blur(20px);
`;

export const SkeletonInfo = styled.div`
  position: absolute;
  bottom: 55px;
  left: 10px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
`;

export const SkeletonLine = styled.div`
  height: 12px;
  background: ${color.paleAccent3};
  opacity: 0.7;
  border-radius: 4px;
  width: ${({ $w }) => $w || '80%'};
  animation: ${loadingWave} 1.5s infinite;
  background-size: 200% 100%;
  background-image: linear-gradient(90deg, ${color.paleAccent2} 25%, ${color.paleAccent5} 50%, ${color.paleAccent2} 75%);
`;

export const TopActions = styled.div`
  position: static;
  grid-column: 3;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  z-index: 10;
`;

export const ActionButton = styled.button`
  width: 35px;
  height: 35px;
  padding: 3px;
  border: none;
  background: var(--matching-action-bg, ${color.accent5});
  color: var(--matching-action-color, white);
  box-shadow: var(--matching-action-shadow, none);
  transition: transform 240ms cubic-bezier(0.4, 0, 0.2, 1), background 240ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 240ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.03);
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    background-color: ${color.gray3};
    color: ${color.gray4};
    cursor: default;
  }
`;



export const ThemeToggleButton = styled.button`
  position: relative;
  flex: 0 0 auto;
  width: 64px;
  height: 34px;
  padding: 3px;
  border: 0;
  border-radius: 9999px;
  background: ${({ $themeMode }) => ($themeMode === 'light' ? '#f5f5f7' : '#24242a')};
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.06),
    ${({ $themeMode }) => ($themeMode === 'light'
      ? '0 6px 14px rgba(83, 61, 35, 0.12)'
      : '0 6px 16px rgba(0, 0, 0, 0.34)')};
  cursor: pointer;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 260ms cubic-bezier(0.4, 0, 0.2, 1),
    background 260ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 260ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 180ms ease;

  &:hover {
    transform: scale(1.03);
    box-shadow:
      inset 0 2px 7px rgba(0, 0, 0, 0.07),
      ${({ $themeMode }) => ($themeMode === 'light'
        ? '0 8px 18px rgba(83, 61, 35, 0.16)'
        : '0 8px 20px rgba(0, 0, 0, 0.42)')};
  }

  &:active {
    transform: scale(0.97);
    opacity: 0.92;
  }

  &:focus-visible {
    outline: 3px solid rgba(247, 147, 30, 0.48);
    outline-offset: 3px;
  }
`;

export const ThemeToggleTrackIcon = styled.span`
  position: absolute;
  top: 50%;
  width: 17px;
  height: 17px;
  transform: translateY(-50%);
  color: ${({ $active }) => ($active ? 'rgba(247, 147, 30, 0.78)' : 'rgba(120, 112, 104, 0.42)')};
  opacity: ${({ $active }) => ($active ? 0.95 : 0.5)};
  transition: opacity 260ms cubic-bezier(0.4, 0, 0.2, 1), color 260ms cubic-bezier(0.4, 0, 0.2, 1);

  ${({ $side }) => ($side === 'left' ? 'left: 9px;' : 'right: 9px;')}

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
`;

export const ThemeToggleKnob = styled.span`
  position: absolute;
  top: 4px;
  left: 4px;
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transform: translateX(${({ $themeMode }) => ($themeMode === 'light' ? '30px' : '0')});
  background: ${({ $themeMode }) => ($themeMode === 'light'
    ? 'linear-gradient(145deg, #dff2ff 0%, #9ed7ff 100%)'
    : 'linear-gradient(145deg, #162950 0%, #071327 100%)')};
  box-shadow:
    0 5px 12px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);
  transition:
    transform 280ms cubic-bezier(0.4, 0, 0.2, 1),
    background 280ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 280ms cubic-bezier(0.4, 0, 0.2, 1);
`;

export const ThemeToggleScene = styled.span`
  position: relative;
  width: 100%;
  height: 100%;
  display: block;

  &::before {
    content: '';
    position: absolute;
    border-radius: 999px;
    transition: all 280ms cubic-bezier(0.4, 0, 0.2, 1);
    ${({ $themeMode }) => ($themeMode === 'light'
      ? `
        width: 13px;
        height: 13px;
        left: 7px;
        top: 7px;
        background: #ffd45c;
        box-shadow: 0 0 0 4px rgba(255, 212, 92, 0.28);
      `
      : `
        width: 15px;
        height: 15px;
        left: 8px;
        top: 7px;
        background: #fffaf0;
        box-shadow: inset -5px -1px 0 #cbd7ef;
      `)}
  }

  &::after {
    content: '';
    position: absolute;
    transition: all 280ms cubic-bezier(0.4, 0, 0.2, 1);
    ${({ $themeMode }) => ($themeMode === 'light'
      ? `
        width: 19px;
        height: 9px;
        right: 5px;
        bottom: 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: -8px 0 0 -2px rgba(255, 255, 255, 0.9);
      `
      : `
        width: 3px;
        height: 3px;
        right: 8px;
        top: 8px;
        border-radius: 50%;
        background: #ffd45c;
        box-shadow: -8px 7px 0 #ffd45c, 2px 13px 0 rgba(255, 212, 92, 0.82);
      `)}
  }
`;

export const BackendTrafficToggleButton = styled(ActionButton)`
  width: auto;
  min-width: 54px;
  padding: 3px 8px;
  gap: 5px;
  color: ${({ $active }) => ($active ? '#fff' : color.accent3)};
  background-color: ${({ $active }) => ($active ? color.accent5 : '#fff')};
  border: 1px solid ${({ $active }) => ($active ? color.accent5 : color.gray)};
  border-radius: 50px;
  font-size: 14px;
  font-weight: 700;

  &:hover {
    background-color: ${({ $active }) => ($active ? color.accent4 || color.accent5 : color.paleAccent2)};
  }
`;

export const BackendTrafficToggleStatus = styled.span`
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
`;

export const HeaderContainer = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(64px, 1fr) auto minmax(64px, 1fr);
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
`;

export const CardCount = styled.p`
  grid-column: 2;
  margin: 0;
  text-align: center;
  color: var(--matching-header-text, #fff8ec);
  font-weight: 700;
  text-shadow: ${({ $themeMode }) => ($themeMode === 'light' ? '0 1px 0 rgba(255,255,255,0.72)' : '0 1px 12px rgba(0, 0, 0, 0.28)')};
`;

export const LoadMoreButton = styled.button`
  margin: 0;
  border: none;
  border-radius: 8px;
  background-color: ${color.accent5};
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 16px;

  &:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.03);
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    background-color: ${color.gray3};
    color: ${color.gray4};
    cursor: default;
  }
`;

export const SubmitButton = styled.button`
  padding: 11px 14px;
  color: ${color.black};
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  align-self: flex-start;
  width: 100%;
  text-align: left;
  background: linear-gradient(180deg, ${color.oppositeAccent} 0%, #fffaf2 100%);
  box-shadow: inset 0 -1px 0 ${color.gray};
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${color.paleAccent2};
    border-color: ${color.paleAccent5};
    transform: translateY(-1px);
  }
`;

export const ExitButton = styled(SubmitButton)`
  background: #fff;
  color: ${color.accent3};
  border-color: ${color.gray};

  &:hover {
    background-color: ${color.paleAccent2};
  }
`;

export const FilterOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 15;
  display: ${props => (props.show ? 'block' : 'none')};
`;

export const FilterContainer = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: 320px;
  max-width: 80%;
  ${matchingThemeVars}
  background: var(--matching-panel-bg);
  color: var(--matching-panel-text);
  z-index: 20;
  transform: translateX(${props => (props.show ? '0' : '100%')});
  transition: transform 0.3s ease-in-out;
  padding: 10px;
  overflow-y: auto;

  input,
  textarea,
  select {
    background: var(--matching-chip-bg);
    color: var(--matching-panel-text);
    border-color: var(--matching-chip-border);
  }

  button {
    transition: background 220ms cubic-bezier(0.4, 0, 0.2, 1), color 220ms cubic-bezier(0.4, 0, 0.2, 1), border-color 220ms cubic-bezier(0.4, 0, 0.2, 1);
  }
`;

export const FilterResetButton = styled.button`
  width: 100%;
  padding: 10px;
  margin: 0 0 10px;
  border: 1px solid ${color.gray3};
  border-radius: 8px;
  background: ${color.accent5};
  color: #fff;
  font-weight: 600;
  cursor: pointer;
`;

export const CollectionSourceWrap = styled.div`
  margin: 0 0 10px;
  border: 1px solid ${color.gray3};
  border-radius: 8px;
  padding: 10px;
  background: var(--matching-section-bg, #fff);
  color: var(--matching-panel-text, #2c2d38);
`;

export const CollectionSourceTitle = styled.p`
  margin: 0 0 8px;
  font-weight: 600;
  color: #2c2d38;
`;

export const CollectionSourceLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  cursor: pointer;
  color: #2c2d38;

  input {
    accent-color: ${color.accent5};
  }
`;

export const Title = styled.span`
  color: ${props => getRoleColors(props.$role).text};
  font-weight: 800;
  margin-bottom: 4px;
  margin-right: 4px;
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-size: 10px;
  background: ${props => getRoleColors(props.$role).tag};
  border: 1px solid ${props => getRoleColors(props.$role).border};
  border-radius: 8px;
  padding: 3px 8px;
`;

export const HeaderIdentityRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
`;

export const HeaderIdentityRowSpaced = styled(HeaderIdentityRow)`
  margin-bottom: 8px;
`;

export const DonorName = styled.strong`
  display: inline-block;
  line-height: 1.2;
  color: #1f1f26;
  font-size: 18px;
  font-weight: 700;
`;

export const ProfileSection = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  padding-bottom: 8px;
`;

export const Info = styled.div`
  flex: 1;
`;

export const LocationLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-start;
  color: #6f7182;
  font-size: 12px;
`;

export const EggDonorPhotoLocation = styled(LocationLine)`
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.7;
`;

export const Table = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  row-gap: 5px;
  column-gap: 5px;
  font-size: 13px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 7px;

  & > div {
    line-height: 1.15;
    display: flex;
    flex-direction: column;
    background: #fbf9f5;
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    padding: 4px 7px;
  }

  & strong {
    font-size: 8px;
    color: ${props => props.$roleColor || color.accent3};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }

  & > div > span,
  & > div {
    color: #2f2f39;
    font-weight: 700;
  }
`;

export const MoreInfo = styled.div`
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-left: 4px solid ${props => (props.$isAdmin ? '#ff6b6b' : '#f7931e')};
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 14px;
  white-space: pre-line;
  color: #3e3f4c;
`;

export const Contact = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  font-size: 14px;
  border-top: ${props => (props.$withBorder ? `1px solid rgba(0, 0, 0, 0.08)` : 'none')};
  padding-top: ${props => (props.$withBorder ? '10px' : '0')};
  margin-top: ${props => (props.$withBorder ? '6px' : '0')};
`;

export const Icons = styled.div`
  display: flex;
  gap: 5px;
  font-size: inherit;
  color: ${color.accent5};
  align-items: center;
  flex-wrap: wrap;

  & a {
    width: 30px !important;
    height: 30px !important;
    border-radius: 8px;
    background: rgba(247, 147, 30, 0.1);
    border: 1px solid rgba(247, 147, 30, 0.22) !important;
    transition: all 0.15s ease;
  }

  & a:hover {
    background: rgba(255, 108, 0, 0.18);
    border-color: rgba(255, 108, 0, 0.38) !important;
    transform: translateY(-1px);
  }

  & svg {
    width: 13px !important;
    height: 13px !important;
  }
`;

export const IconsTrailing = styled(Icons)`
  margin-left: auto;
`;

export const BasicInfo = styled.div`
  position: absolute;
  bottom: 58px;
  left: 16px;
  right: 12px;
  text-align: left;
  color: #fff;
  font-weight: 700;
  text-shadow: 0 2px 14px rgba(16, 12, 8, 0.9);
  pointer-events: none;
  line-height: 1.2;
  font-size: 20px;
  z-index: 2;
`;

export const CardInfo = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  width: calc(100% - 24px);
  padding: 10px 11px;
  background: rgba(255, 255, 255, 0.88);
  color: #2c2d38;
  font-size: 13px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  backdrop-filter: blur(8px);
`;

export const RoleHeader = styled(Title)`
  margin-bottom: 2px;
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
`;

export const AdminToggle = styled.div`
  position: absolute;
  top: 5px;
  right: 5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${props => (props.published ? 'green' : 'red')};
  z-index: 10;
  cursor: pointer;
`;

export const Id = styled.div`
  position: absolute;
  right: 10px;
  top: 0;
  z-index: 2;
  font-size: 12px;
  color: ${color.gray3};
  text-align: right;
  display: inline-block;
  padding-right: 4px;
`;

export const ClickableId = styled(Id)`
  cursor: pointer;
`;

export const InfoSlide = styled.div`
  width: 100%;
  height: auto;
  min-height: auto;
  background: ${props =>
    props.$role
      ? `linear-gradient(160deg, #fffdf8 0%, ${getRoleColors(props.$role).light} 100%)`
      : 'linear-gradient(180deg, #fffdf8 0%, #f6f2eb 100%)'};
  color: #2c2d38;
  overflow-y: visible;
  box-sizing: border-box;
  padding: 10px 12px;
  padding-bottom: ${({ $reserveActionButtons }) => ($reserveActionButtons ? '56px' : '10px')};
`;

const slideLeft = keyframes`
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
`;

const slideRight = keyframes`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`;

export const AnimatedCard = styled(Card)`
  ${({ $activeProfile }) => $activeProfile && `
    flex: 1 1 auto;
    height: auto;
    min-height: min(480px, calc(100dvh - 66px));
    aspect-ratio: auto;
    padding-bottom: 0;
    background: transparent;
    box-shadow: none;
    border: none;

    &::after {
      display: none;
    }
  `}
  ${({ $backgroundImage }) =>
    $backgroundImage
      ? `background-image: url(${$backgroundImage}); background-color: transparent;`
      : 'background-color: #fff;'}
  animation: ${({ $dir }) =>
    $dir === 'left'
      ? slideLeft
      : $dir === 'right'
      ? slideRight
      : 'none'} 0.3s ease;
`;

export const OwnerStatusMessage = styled.p`
  text-align: center;
  padding: 0 10px;
`;

export const ModernProfileShell = styled.div`
  position: relative;
  height: 100%;
  background: var(--matching-shell-bg);
  color: var(--matching-chip-text, #fff);
  transition: background 280ms cubic-bezier(0.4, 0, 0.2, 1), color 280ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: ${STACK_CARD_RADIUS};
  overflow: hidden;
  touch-action: pan-y;
  box-shadow: var(--matching-card-shadow);
`;

export const ModernProfileScroll = styled.div`
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scroll-padding-bottom: 96px;
  padding-bottom: 96px;
  box-sizing: border-box;
`;

export const ModernHero = styled.div`
  position: relative;
  min-height: clamp(330px, 55%, 470px);
  height: 55%;
  background: var(--matching-hero-fallback);
  background-size: cover;
  background-position: center 18%;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  cursor: ${({ $clickable }) => ($clickable ? 'zoom-in' : 'default')};

  &::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 18%;
    background: var(--matching-hero-bottom);
    pointer-events: none;
  }

  &:focus-visible {
    outline: 3px solid rgba(255, 149, 0, 0.75);
    outline-offset: -5px;
  }
`;

export const ModernHeroImage = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 16%;
  display: block;
`;

export const ModernHeroFallbackMark = styled.div`
  position: absolute;
  inset: 58px 0 auto;
  margin: auto;
  width: 112px;
  height: 112px;
  border-radius: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: 38px;
  font-weight: 900;
  letter-spacing: 1px;
  background: linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,149,0,0.16));
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(14px);
`;

export const ModernHeroContent = styled.div`
  position: relative;
  z-index: 2;
  width: 100%;
  box-sizing: border-box;
  padding: 14px 14px 12px;
  background: var(--matching-card-bg);
  border-bottom: 1px solid var(--matching-section-border);
  color: var(--matching-chip-text);
  text-shadow: none;
`;

export const ModernRoleBadge = styled.span`
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: calc(100% - 28px);
  padding: 5px 10px;
  border-radius: 999px;
  color: #FFFFFF;
  background: var(--matching-accent);
  box-shadow: 0 8px 18px rgba(255, 149, 0, 0.18);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.7px;
  text-transform: uppercase;
`;

export const ModernHeroTitle = styled.h2`
  margin: 0;
  color: var(--matching-chip-text);
  max-width: 100%;
  font-size: clamp(30px, 7vw, 36px);
  line-height: 1.04;
  font-weight: 750;
  text-wrap: balance;
`;

export const ModernHeroLocation = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  color: var(--matching-muted-text);
  font-size: 15px;
  font-weight: 600;

  svg {
    flex: 0 0 auto;
    color: var(--matching-accent);
  }
`;

export const ModernHeroFacts = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0;
  margin-top: 12px;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid var(--matching-contact-border);
  border-radius: 16px;
  background: var(--matching-card-bg);
`;

export const ModernFactPill = styled.span`
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  min-height: 54px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 7px 4px;
  color: var(--matching-chip-text);
  text-align: center;
  text-shadow: none;
  line-height: 1;

  & + &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 1px;
    background: var(--matching-contact-border);
  }

  .fact-value,
  .fact-label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fact-value {
    color: var(--matching-chip-text);
    font-size: clamp(14px, 3.8vw, 18px);
    font-weight: 750;
    letter-spacing: -0.2px;
  }

  .fact-label {
    color: var(--matching-muted-text);
    font-size: clamp(10px, 2.8vw, 12px);
    font-weight: 600;
    text-transform: lowercase;
  }

  @media (max-width: 380px) {
    min-height: 50px;
    padding: 6px 3px;
  }
`;

export const ModernProfileBody = styled.div`
  position: relative;
  z-index: 3;
  margin-top: 0;
  padding: 12px 12px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const ModernSection = styled.section`
  background: var(--matching-section-bg);
  color: var(--matching-chip-text);
  border-radius: 16px;
  padding: 12px;
  border: 1px solid var(--matching-section-border);
  box-shadow: var(--matching-section-shadow);
  backdrop-filter: none;
`;

export const ModernSectionTitle = styled.h3`
  margin: 0 0 8px;
  color: var(--matching-section-title);
  font-size: clamp(20px, 4.8vw, 22px);
  font-weight: 700;
  letter-spacing: 0.2px;
`;

export const ModernChipGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const ModernChip = styled.div`
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  max-width: 100%;
  padding: 7px 10px;
  border-radius: 13px;
  background: var(--matching-chip-bg);
  border: 1px solid var(--matching-chip-border);
  color: var(--matching-chip-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.15;

  strong {
    color: var(--matching-chip-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
`;


export const ModernFieldList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const ModernFieldRow = styled.div`
  display: grid;
  grid-template-columns: minmax(92px, 0.42fr) 1fr;
  gap: 12px;
  align-items: baseline;
  padding: 0 2px;
  color: var(--matching-muted-text);

  strong {
    color: var(--matching-chip-label);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  span {
    color: var(--matching-chip-text);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.25;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

export const ModernBioText = styled.p`
  margin: 0;
  color: var(--matching-muted-text);
  white-space: pre-line;
  font-size: 14px;
  line-height: 1.45;
`;

export const ModernMoreButton = styled.button`
  margin: 8px 0 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${color.accent5};
  font-weight: 900;
  cursor: pointer;
`;

export const ModernContactDetails = styled.details`
  margin: 0;
  padding: 0;
`;

export const ModernContactSummary = styled.summary`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  color: var(--matching-section-title);
  font-size: clamp(20px, 4.8vw, 22px);
  font-weight: 700;
  letter-spacing: 0.2px;
  cursor: pointer;
  list-style: none;
  user-select: none;

  &::-webkit-details-marker {
    display: none;
  }

  &::after {
    content: '⌄';
    color: var(--matching-accent);
    font-size: 16px;
    line-height: 1;
    transition: transform 0.18s ease;
  }

  ${ModernContactDetails}[open] & {
    margin-bottom: 8px;
  }

  ${ModernContactDetails}[open] &::after {
    transform: rotate(180deg);
  }
`;

export const ModernContactLinks = styled.div`
  display: flex;
  padding: 0 12px 12px;
  flex-wrap: wrap;
  gap: 8px;
`;

export const ModernContactLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 8px 10px;
  border-radius: 999px;
  background: var(--matching-card-bg);
  border: none;
  color: var(--matching-contact-text);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  text-decoration: none;

  svg {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    color: var(--matching-accent);
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const ModernDesktopNavButton = styled.button`
  position: absolute;
  top: 50%;
  ${({ $side }) => ($side === 'left' ? 'left: 8px;' : 'right: 8px;')}
  transform: translateY(-50%);
  z-index: 9;
  width: 26px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 999px;
  background: rgba(21, 18, 15, 0.26);
  color: rgba(255, 255, 255, 0.84);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: opacity 0.2s ease, background 0.2s ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    background: rgba(21, 18, 15, 0.68);
    color: #fff;
  }

  &:disabled {
    opacity: 0.24;
    cursor: default;
  }

  @media (max-width: 768px) {
    display: none;
  }
`;

export const ModernActionRail = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 8;
  display: flex;
  justify-content: space-between;
  min-height: 80px;
  box-sizing: border-box;
  align-items: center;
  padding: 10px 54px max(10px, env(safe-area-inset-bottom));
  pointer-events: none;
  background: var(--matching-rail-bg);
  border-top: 1px solid var(--matching-rail-border);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);

  & > span {
    pointer-events: auto;
  }

  button {
    position: static !important;
    width: 46px !important;
    height: 46px !important;
    border-radius: 50% !important;
    box-shadow: 0 10px 24px rgba(22, 22, 22, 0.18) !important;
  }
`;

export const ModernSwipeHint = styled.div`
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  padding: 6px 10px;
  border-radius: 999px;
  color: rgba(255,255,255,0.82);
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.12);
  font-size: 11px;
  font-weight: 800;
  backdrop-filter: blur(8px);
`;
