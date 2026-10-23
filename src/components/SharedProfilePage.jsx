import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { FaGlobe } from 'react-icons/fa';
import ProfileRow from './ProfileRow';
import { MatchingThemeScope } from './Matching.styled';
import { ScreenLoading } from './RequireAuth';
import { readSharedProfileCard } from './profileShareRemote';
import { detectBrowserLanguage, hasStoredLanguagePreference, useAppSettings } from '../hooks/useAppSettings';
import { APP_LANGUAGES, isSupportedLanguage } from '../utils/locales';
import { expandProfileShareCard, isProfileShareToken } from '../utils/profileShare';
import { uiText } from '../utils/uiTranslations';

/*
 * Анкета за посиланням — третій публічний екран (поруч із `/login` і
 * `/policy`), і на відміну від них читає базу — але рівно один вузол:
 * `profileShares/{token}/card`. Він і є вся межа — знімок, який
 * власниця сама випустила й може відкликати (`utils/profileShare`). Сюди не
 * приїжджає ні картка стрічки, ні анкета, ні контакти з `profileContacts`.
 *
 * Картку малює той самий `ProfileRow`, що й стрічку й прев'ю «Мого профілю»,
 * — тому мова, переклад довідників і формат дат ідуть за гостем. Мова — з
 * адреси (`?lang=de`), інакше з браузера, якщо людина ще не обирала її сама.
 *
 * Сторінку не індексують (`noindex`), а запити фото не несуть адреси сторінки
 * (`no-referrer`): у ній токен, і він не мусить осідати в журналах чужих
 * серверів. Назва вкладки — без імені людини: історія браузера й закладки
 * бачать її довше, ніж живе посилання.
 */

const Page = styled(MatchingThemeScope)`
  min-height: 100vh;
  background: var(--matching-page-bg);
  padding: 0 16px 40px;
  box-sizing: border-box;
`;

const Top = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 460px;
  margin: 0 auto;
  padding: 14px 0 12px;
`;

const Brand = styled.span`
  font-family: var(--km-font-display, inherit);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--matching-header-text);
`;

const LanguageField = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  background: var(--km-fill);
  color: var(--matching-muted-text);
  font-size: 14px;

  &:focus-within { box-shadow: 0 0 0 3px var(--km-accent-ring, rgba(201, 96, 15, 0.25)); }
`;

const LanguageSelect = styled.select`
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--matching-header-text);
  font: inherit;
  font-weight: 600;
  padding-right: 2px;
  cursor: pointer;

  &:focus { outline: none; }
`;

const Frame = styled.main`
  max-width: 460px;
  margin: 0 auto;
`;

const Notice = styled.section`
  max-width: 460px;
  margin: 12vh auto 0;
  padding: 24px 20px;
  border-radius: 18px;
  background: var(--matching-card-bg);
  border: 1px solid var(--matching-card-border);
  text-align: center;

  h1 {
    margin: 0 0 8px;
    font-size: 19px;
    font-weight: 700;
  }

  p {
    margin: 0;
    color: var(--matching-muted-text);
    font-size: 15px;
    line-height: 1.45;
  }
`;

const RetryButton = styled.button`
  margin-top: 16px;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 12px;
  background: var(--matching-accent);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
`;

const Footer = styled.footer`
  max-width: 460px;
  margin: 18px auto 0;
  color: var(--matching-muted-text);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;

  a {
    color: var(--matching-accent);
    font-weight: 600;
    text-decoration: none;
  }
`;

const HEAD_TAGS = [
  { name: 'robots', content: 'noindex, nofollow' },
  { name: 'referrer', content: 'no-referrer' },
];

const useShareHead = language => {
  useEffect(() => {
    const previousTitle = document.title;
    const added = HEAD_TAGS.map(({ name, content }) => {
      const tag = document.createElement('meta');
      tag.setAttribute('name', name);
      tag.setAttribute('content', content);
      tag.setAttribute('data-profile-share', '');
      document.head.appendChild(tag);
      return tag;
    });
    return () => {
      added.forEach(tag => tag.remove());
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    document.title = `${uiText('Анкета', language)} · KnowMe`;
  }, [language]);
};

const PROGRAMS_CONTEXT = Object.freeze({ viewerType: '', facts: null });

export const SharedProfilePage = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const { language, setLanguage, themeMode } = useAppSettings();
  const [result, setResult] = useState({ status: 'loading' });
  const [expanded, setExpanded] = useState(true);
  useShareHead(language);

  // Мову вибирають раз — на вході. Далі її міняє лише сам гість.
  useEffect(() => {
    const requested = searchParams.get('lang');
    const target = isSupportedLanguage(requested)
      ? requested
      : (hasStoredLanguagePreference() ? '' : detectBrowserLanguage());
    if (target && target !== language) setLanguage(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!isProfileShareToken(token)) {
      setResult({ status: 'missing' });
      return;
    }
    setResult({ status: 'loading' });
    setResult(await readSharedProfileCard(token));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const user = useMemo(
    () => (result.status === 'ok' ? expandProfileShareCard(result.card) : null),
    [result],
  );
  const toggleExpanded = useCallback(() => setExpanded(previous => !previous), []);

  let content;
  if (result.status === 'loading') {
    content = <ScreenLoading />;
  } else if (result.status === 'ok' && user) {
    content = (
      <Frame data-testid="shared-profile">
        <ProfileRow
          user={user}
          programsContext={PROGRAMS_CONTEXT}
          preview
          canViewContacts={false}
          expanded={expanded}
          onToggleExpand={toggleExpanded}
        />
      </Frame>
    );
  } else if (result.status === 'error') {
    content = (
      <Notice role="alert" data-testid="shared-profile-error">
        <h1>{uiText('Не вдалося завантажити анкету', language)}</h1>
        <p>{uiText('Перевірте зʼєднання й спробуйте ще раз.', language)}</p>
        <RetryButton type="button" onClick={load}>{uiText('Спробувати ще раз', language)}</RetryButton>
      </Notice>
    );
  } else {
    content = (
      <Notice data-testid="shared-profile-missing">
        <h1>{uiText('Посилання недійсне', language)}</h1>
        <p>{uiText('Можливо, його відкликали або минув строк дії. Попросіть у людини, яка його надіслала, нове посилання.', language)}</p>
      </Notice>
    );
  }

  return (
    <Page $themeMode={themeMode}>
      <Top>
        <Brand>KnowMe</Brand>
        <LanguageField>
          <FaGlobe aria-hidden="true" />
          <LanguageSelect
            value={language}
            onChange={event => setLanguage(event.target.value)}
            aria-label={uiText('Мова', language)}
          >
            {APP_LANGUAGES.map(item => (
              <option key={item.code} value={item.code} lang={item.code}>{item.nativeName}</option>
            ))}
          </LanguageSelect>
        </LanguageField>
      </Top>
      {content}
      {result.status === 'ok' ? (
        <Footer>
          {uiText('Цю анкету показано за посиланням, яке створила її власниця. Вона може відкликати його будь-коли.', language)}
          <br />
          <Link to="/login">{uiText('Створити свою анкету', language)}</Link>
        </Footer>
      ) : null}
    </Page>
  );
};

export default SharedProfilePage;
