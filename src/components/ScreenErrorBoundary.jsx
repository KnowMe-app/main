import React from 'react';
import styled from 'styled-components';
import { uiText } from 'utils/uiTranslations';
import { getStoredLanguage } from 'hooks/useAppSettings';

const CHUNK_RELOAD_KEY = 'screenChunkReloadAt';
const CHUNK_RELOAD_COOLDOWN_MS = 60 * 1000;

export const isChunkLoadError = error => (
  error?.name === 'ChunkLoadError' || /Loading (CSS )?chunk [\w-]+ failed/i.test(String(error?.message || ''))
);

/**
 * Екрани вантажаться окремими файлами (`React.lazy` у `App.jsx`), а деплой на
 * GitHub Pages стирає файли попередньої збірки. Вкладка, відкрита до деплою,
 * на переході до ще не завантаженого екрана просить файл, якого вже немає, —
 * і лікує це саме перезавантаження: нова `index.html` знає нові імена. Раз на
 * хвилину, щоб справжній збій мережі не крутив перезавантаження по колу.
 */
const claimChunkReload = () => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
};

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
    if (isChunkLoadError(error) && claimChunkReload()) window.location.reload();
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
