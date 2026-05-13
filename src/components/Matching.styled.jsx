import styled, { keyframes } from 'styled-components';
import { color } from './styles';

const STACK_CARD_RADIUS = '18px';

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
  padding: 0;
  min-height: 100dvh;
  background:
    radial-gradient(circle at 50% -10%, rgba(214, 146, 68, 0.2), transparent 34%),
    linear-gradient(180deg, #1b1510 0%, #0c0b0d 100%);
`;

export const InnerContainer = styled.div`
  max-width: 480px;
  width: 100%;
  min-height: 100dvh;
  background: transparent;
  padding: 0;
  box-shadow: none;
  border-radius: 0;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
`;

export const Grid = styled.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 0;
  padding: 0 10px 10px;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  flex: 1;
  min-height: 0;
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
  width: 100%;
  max-width: 100%;
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
  background: #fff;
  overflow: hidden;
`;

export const ThirdInfoCard = styled(NextInfoCard)`
  border-color: ${color.gray4};
  transform: translate(8px, -8px);
  z-index: 0;
`;

export const CardWrapper = styled.div`
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 100%;
  border: 1px solid rgba(218, 167, 95, 0.28);
  border-radius: 26px;
  box-sizing: border-box;
  overflow: hidden;
  background: #15120f;
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
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
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 10px;
  z-index: 10;
`;

export const ActionButton = styled.button`
  width: 35px;
  height: 35px;
  padding: 3px;
  border: none;
  background-color: ${color.accent5};
  color: white;
  border-radius: 50px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:disabled {
    background-color: ${color.gray3};
    color: ${color.gray4};
    cursor: default;
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px 8px;
  color: rgba(255, 247, 232, 0.88);
`;

export const CardCount = styled.p`
  width: 100%;
  margin: 0;
  text-align: center;
  color: rgba(255, 247, 232, 0.86);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
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
  background: #fff;
  z-index: 20;
  transform: translateX(${props => (props.show ? '0' : '100%')});
  transition: transform 0.3s ease-in-out;
  padding: 10px;
  overflow-y: auto;
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
  background: #fff;
  color: #2c2d38;
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
    height: min(820px, calc(100dvh - 64px));
    min-height: 540px;
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
  background:
    radial-gradient(circle at 50% 0%, rgba(230, 166, 74, 0.16), transparent 34%),
    linear-gradient(180deg, #1a1511 0%, #0f0d0e 100%);
  color: #fff;
  border-radius: 26px;
  overflow: hidden;
  touch-action: pan-y;
`;

export const ModernProfileScroll = styled.div`
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
`;

export const ModernHero = styled.div`
  position: relative;
  min-height: clamp(330px, 56dvh, 480px);
  background:
    ${({ $image }) => $image ? `linear-gradient(180deg, rgba(12, 9, 7, 0.03) 0%, rgba(12, 9, 7, 0.12) 42%, rgba(12, 9, 7, 0.72) 100%), url(${$image})` : 'radial-gradient(circle at 30% 18%, rgba(247, 147, 30, 0.38), transparent 28%), radial-gradient(circle at 82% 12%, rgba(255, 211, 126, 0.16), transparent 24%), linear-gradient(145deg, #3b2c20 0%, #181318 58%, #080708 100%)'};
  background-size: cover;
  background-position: center 22%;
  display: flex;
  align-items: flex-end;
  padding: 24px 18px 96px;
  box-sizing: border-box;

  &::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 46%;
    background: linear-gradient(180deg, rgba(15, 12, 10, 0) 0%, rgba(15, 12, 10, 0.82) 100%);
    pointer-events: none;
  }
`;

export const ModernHeroFallbackMark = styled.div`
  position: absolute;
  inset: 72px 0 auto;
  margin: auto;
  width: 104px;
  height: 104px;
  border-radius: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: 38px;
  font-weight: 900;
  letter-spacing: 1px;
  background: rgba(255, 255, 255, 0.11);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(12px);
`;

export const ModernHeroContent = styled.div`
  position: relative;
  z-index: 2;
  width: 100%;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
`;

export const ModernRoleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-bottom: 10px;
  padding: 5px 11px;
  border-radius: 999px;
  color: #2a1705;
  background: linear-gradient(135deg, #ffd58a 0%, #f7931e 100%);
  box-shadow: 0 10px 26px rgba(247, 147, 30, 0.22);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.8px;
  text-transform: uppercase;
`;

export const ModernHeroTitle = styled.h2`
  margin: 0;
  color: #fff;
  font-size: clamp(30px, 8vw, 42px);
  line-height: 0.98;
  font-weight: 900;
`;

export const ModernHeroLocation = styled.p`
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.84);
  font-size: 14px;
  font-weight: 600;
`;

export const ModernHeroFacts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
`;

export const ModernFactPill = styled.span`
  display: inline-flex;
  gap: 5px;
  align-items: baseline;
  max-width: 100%;
  padding: 6px 9px;
  border-radius: 999px;
  color: #fff8ea;
  background: rgba(22, 18, 14, 0.42);
  border: 1px solid rgba(255, 213, 138, 0.28);
  backdrop-filter: blur(12px);
  font-size: 12px;
  line-height: 1.1;

  strong {
    color: #ffd58a;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }
`;

export const ModernProfileBody = styled.div`
  position: relative;
  z-index: 3;
  margin-top: -58px;
  padding: 0 12px 96px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const ModernSection = styled.section`
  background: rgba(31, 27, 23, 0.82);
  color: #fff4df;
  border: 1px solid rgba(255, 214, 150, 0.13);
  border-radius: 20px;
  padding: 12px;
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(18px);
`;

export const ModernSectionTitle = styled.h3`
  margin: 0 0 8px;
  color: #ffd58a;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.9px;
  text-transform: uppercase;
`;

export const ModernChipGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;

  @media (max-width: 380px) {
    grid-template-columns: 1fr;
  }
`;

export const ModernChip = styled.div`
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  padding: 7px 9px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 214, 150, 0.13);
  color: #fff3dd;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.16;

  strong {
    color: #dba55f;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.58px;
  }
`;

export const ModernBioText = styled.p`
  margin: 0;
  color: rgba(255, 244, 223, 0.88);
  white-space: pre-line;
  font-size: 14px;
  line-height: 1.44;
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

export const ModernGallery = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
`;

export const ModernGalleryImage = styled.img`
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 14px;
  background: #2a251f;
`;

export const ModernActionRail = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 16px;
  z-index: 8;
  display: flex;
  justify-content: space-between;
  padding: 0 22px;
  pointer-events: none;

  &::before {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -9px;
    width: min(250px, 62%);
    height: 76px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: rgba(9, 8, 7, 0.44);
    filter: blur(18px);
    z-index: -1;
  }

  & > span {
    pointer-events: auto;
  }

  button {
    position: static !important;
    width: 58px !important;
    height: 58px !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.34) !important;
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
