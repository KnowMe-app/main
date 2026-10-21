import React from 'react';
import styled from 'styled-components';
import { uiText } from 'utils/uiTranslations';
import { getStoredLanguage } from 'hooks/useAppSettings';

/**
 * Збій одного екрана не має бути білою сторінкою.
 *
 * Без межі помилка рендера знімає з DOM увесь застосунок разом із навігацією:
 * донорка, у якої впала стрічка, бачила порожній екран і не мала куди
 * натиснути, крім перезавантаження, про яке ще треба здогадатись. Межа стоїть
 * навколо маршрутів, тож навігація лишається, а новий маршрут (`resetKey`)
 * знімає стан помилки — перехід на інший екран працює одразу.
 */
export class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ScreenErrorBoundary] екран упав', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const language = getStoredLanguage();
    return (
      <Fallback role="alert">
        <Title>{uiText('Щось пішло не так', language)}</Title>
        <Text>{uiText('Екран не вдалося показати. Оновіть сторінку — введене раніше збережено.', language)}</Text>
        <ReloadButton type="button" onClick={() => window.location.reload()}>
          {uiText('Оновити сторінку', language)}
        </ReloadButton>
      </Fallback>
    );
  }
}

const Fallback = styled.div`
  max-width: 420px;
  margin: 64px auto;
  padding: 0 16px;
  display: grid;
  gap: 12px;
  text-align: center;
  color: var(--km-text, #1a1a1a);
`;

const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
`;

const Text = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--km-muted, #6b655e);
`;

const ReloadButton = styled.button`
  justify-self: center;
  border: 0;
  border-radius: var(--km-radius, 12px);
  padding: 12px 20px;
  background: var(--km-accent, #c9600f);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
`;
