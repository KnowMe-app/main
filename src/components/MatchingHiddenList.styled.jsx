import styled, { css, keyframes } from 'styled-components';

export const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  padding: 0 10px 10px;
  box-sizing: border-box;
`;

export const HiddenHeaderTitle = styled.div`
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--matching-header-text);
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;

  span {
    color: var(--matching-muted-text);
    font-weight: 600;
    margin-left: 2px;
  }
`;

export const EditHint = styled.p`
  font-size: 11.5px;
  color: var(--matching-accent);
  background: color-mix(in srgb, var(--matching-accent) 12%, transparent);
  padding: 7px 14px;
  line-height: 1.4;
  margin: 0 0 8px;
  border-radius: 10px;
`;

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 2px 0 4px;
`;

export const Card = styled.div`
  background: var(--matching-card-bg);
  border: 1px solid var(--matching-card-border);
  border-radius: 20px;
  padding: 11px;
  cursor: ${({ $editMode }) => ($editMode ? 'default' : 'pointer')};
  transition: opacity 200ms ease, transform 200ms ease;
`;

export const Top = styled.div`
  display: flex;
  gap: 11px;
`;

export const Photo = styled.div`
  width: 58px;
  height: 58px;
  border-radius: 16px;
  flex: 0 0 auto;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  overflow: hidden;
`;

export const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

export const Name = styled.div`
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--matching-header-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const Location = styled.div`
  font-size: 12px;
  color: var(--matching-muted-text);
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;

  svg {
    flex: 0 0 auto;
    fill: var(--matching-accent);
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export const FactsRow = styled.div`
  font-size: 12.5px;
  color: var(--matching-header-text);
  opacity: 0.82;
  margin-top: 5px;
  line-height: 1.5;
`;

export const Fact = styled.i`
  font-style: normal;
  white-space: nowrap;
  display: inline-block;

  b {
    font-weight: 650;
  }

  &::after {
    content: '·';
    color: var(--matching-muted-text);
    margin: 0 5px;
    opacity: 0.6;
  }

  &:last-child::after {
    content: '';
    margin: 0;
  }
`;

export const Ctrl = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 6px;
  flex: 0 0 auto;
`;

const ctrlButtonBase = css`
  width: 42px;
  height: 26px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
  padding: 0;
  font: inherit;
`;

export const ReturnButton = styled.button`
  ${ctrlButtonBase}
  border: 1px solid color-mix(in srgb, var(--matching-accent) 45%, transparent);
  background: color-mix(in srgb, var(--matching-accent) 12%, transparent);
  color: var(--matching-accent);

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export const ChevronButton = styled.button`
  ${ctrlButtonBase}
  border: 1px solid var(--matching-card-border);
  background: var(--matching-card-bg);
  color: var(--matching-muted-text);

  b {
    font-size: 11px;
    font-weight: 600;
    color: var(--matching-muted-text);
  }

  svg {
    transition: transform 180ms ease;
    transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
  }
`;

export const Note = styled.p`
  font-size: 12.3px;
  color: var(--matching-muted-text);
  background: var(--matching-section-bg);
  border-radius: 14px;
  padding: 7px 10px;
  margin: 9px 0 0;
  line-height: 1.5;

  ${({ $clip }) => $clip && css`
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `}
`;

export const NoteMore = styled.span`
  display: block;
  font-size: 15px;
  font-weight: 700;
  line-height: 0.8;
  color: var(--matching-accent);
  margin: 4px 0 0 10px;
  cursor: pointer;
  letter-spacing: 1px;
`;

export const More = styled.div`
  margin-top: 9px;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
  background: var(--matching-section-bg);
  border-radius: 14px;
  padding: 9px 11px;
`;

export const GridRow = styled.p`
  margin: 0;
  font-size: 12.3px;
  line-height: 1.75;
  color: var(--matching-muted-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  b {
    color: var(--matching-header-text);
    font-weight: 600;
  }

  ${({ $wide }) => $wide && css`grid-column: 1 / -1;`}
`;

export const ContactsBlock = styled.div`
  margin-top: 8px;
  border: 1px solid var(--matching-card-border);
  border-radius: 14px;
  overflow: hidden;
`;

export const ContactsHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 11px;
  font-size: 12.3px;
  font-weight: 600;
  color: var(--matching-muted-text);
  background: var(--matching-card-bg);
  border: 0;
  cursor: pointer;
  font: inherit;
  text-align: left;
`;

export const ContactsStatus = styled.span`
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--matching-muted-text);
`;

export const ContactsBody = styled.div`
  padding: 2px 11px 6px;
  background: var(--matching-card-bg);
  border-top: 1px solid var(--matching-section-bg);
`;

export const ContactRow = styled.a`
  display: flex;
  align-items: center;
  min-height: 32px;
  font-size: 12.5px;
  color: var(--matching-accent);
  font-weight: 500;
  text-decoration: none;
  padding: 7px 0;
  border-bottom: 1px solid var(--matching-section-bg);

  &:last-child {
    border-bottom: 0;
  }

  &:active {
    opacity: 0.6;
  }

  span {
    color: var(--matching-muted-text);
    font-size: 11px;
    font-weight: 400;
    margin-right: 7px;
    display: inline-block;
    min-width: 64px;
  }
`;

export const EditableInput = styled.input`
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  padding: 0 1px;
  min-width: 14px;
  border-bottom: 1px dashed ${({ $pending }) => ($pending
    ? 'var(--matching-accent)'
    : 'color-mix(in srgb, var(--matching-muted-text) 55%, transparent)')};

  &:focus {
    outline: 0;
    border-bottom-color: var(--matching-accent);
    background: color-mix(in srgb, var(--matching-accent) 12%, transparent);
  }
`;

export const PendingBadge = styled.span`
  display: inline-block;
  margin-left: 3px;
  font-size: 9px;
  font-weight: 700;
  color: var(--matching-accent);
  vertical-align: super;
  cursor: help;
`;

export const EditableTextarea = styled.textarea`
  border: 1px dashed ${({ $pending }) => ($pending
    ? 'var(--matching-accent)'
    : 'color-mix(in srgb, var(--matching-muted-text) 55%, transparent)')};
  background: transparent;
  font: inherit;
  color: inherit;
  width: 100%;
  min-height: 44px;
  resize: vertical;
  border-radius: 10px;
  padding: 6px 8px;

  &:focus {
    outline: 0;
    border-color: var(--matching-accent);
    background: color-mix(in srgb, var(--matching-accent) 12%, transparent);
  }
`;

export const FieldError = styled.span`
  display: block;
  font-size: 10.5px;
  color: var(--km-danger, #d64545);
  margin-top: 2px;
`;

export const SkeletonRow = styled.div`
  background: var(--matching-card-bg);
  border: 1px solid var(--matching-card-border);
  border-radius: 20px;
  padding: 11px;
  display: flex;
  gap: 11px;
`;

const shimmer = keyframes`
  0% { background-position: -120px 0; }
  100% { background-position: 120px 0; }
`;

const shimmerBg = css`
  background: var(--matching-section-bg);
  background-image: linear-gradient(
    90deg,
    var(--matching-section-bg) 0px,
    color-mix(in srgb, var(--matching-accent) 10%, var(--matching-section-bg)) 40px,
    var(--matching-section-bg) 80px
  );
  background-size: 240px 100%;
  animation: ${shimmer} 1.3s ease-in-out infinite;
`;

export const SkeletonPhoto = styled.div`
  width: 58px;
  height: 58px;
  border-radius: 16px;
  flex: 0 0 auto;
  ${shimmerBg}
`;

export const SkeletonLines = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
`;

export const SkeletonLine = styled.div`
  height: ${({ $h }) => $h || '10px'};
  width: ${({ $w }) => $w || '100%'};
  border-radius: 6px;
  ${shimmerBg}
`;

export const FooterNote = styled.div`
  text-align: center;
  padding: 14px 10px 4px;
  font-size: 11.5px;
  color: var(--matching-muted-text);
`;

export const ErrorRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  font-size: 13px;
  color: var(--matching-muted-text);
  flex-wrap: wrap;
`;

export const RetryButton = styled.button`
  border: 1px solid var(--matching-accent);
  color: var(--matching-accent);
  background: transparent;
  border-radius: 9px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 48px 20px;
  color: var(--matching-muted-text);
`;

export const EmptyStateTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--matching-header-text);
`;

export const EmptyStateText = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  max-width: 320px;
`;

export const EmptyStateButton = styled.button`
  border: 0;
  background: var(--matching-accent);
  color: #fff;
  border-radius: 10px;
  padding: 9px 18px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`;

export const Sentinel = styled.div`
  height: 1px;
`;

export const ToastWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--matching-card-bg);
  color: var(--matching-header-text);
  border: 1px solid var(--matching-card-border);
  border-radius: 14px;
  padding: 10px 14px;
  box-shadow: var(--matching-card-shadow);
  font-size: 13px;
`;

export const ToastUndo = styled.button`
  border: 0;
  background: transparent;
  color: var(--matching-accent);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
`;
