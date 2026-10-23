import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from 'components/App';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';
import { Provider } from 'react-redux';
import { store, persistor } from 'redux/store';
import { Toaster } from 'react-hot-toast';
import { getStoredLanguage } from 'hooks/useAppSettings';
import { loadExtraLocale } from 'utils/locales';

const root = ReactDOM.createRoot(document.getElementById('root'));

const renderApp = () => root.render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <BrowserRouter basename="/main">
          <App />
          <Toaster
            toastOptions={{
              style: {
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                maxWidth: 'min(92vw, 520px)',
              },
            }}
          />
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);

// Словник обраної мови — до першого кадру: модулі мов вантажаться на вимогу
// (`utils/locales`), і без цього той, хто обрав японську, бачив би перший
// екран англійською. Українській і англійській чекати нема чого.
loadExtraLocale(getStoredLanguage())
  .catch(error => console.warn('[i18n] словник мови не довантажився', error))
  .finally(renderApp);
