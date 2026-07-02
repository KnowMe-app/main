# KnowMe: Egg Donor

KnowMe is a React application for managing egg-donor profiles, profile matching, photos, contact details, medication and stimulation schedules, and data import/export workflows.

## Tech stack

- React 18 and react-scripts
- React Router with the `/main` GitHub Pages basename
- Redux Toolkit and Redux Persist
- Firebase Authentication, Firestore, Realtime Database, and Storage
- styled-components
- XLSX import/export utilities

## Local setup

1. Install an LTS version of Node.js.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a local `.env` file with the required Firebase and API variables.
4. Start the development server:

   ```bash
   npm start
   ```

The app runs locally at [http://localhost:3000](http://localhost:3000).

## Environment variables

The app expects these variables to be available at build/runtime:

```dotenv
REACT_APP_API_KEY=
REACT_APP_AUTH_DOMAIN=
REACT_APP_DATABASE_URL=
REACT_APP_PROJECT_ID=
REACT_APP_STORAGE_BUCKET=
REACT_APP_MESSAGING_SENDER_ID=
REACT_APP_APP_ID=
REACT_APP_USER1=
REACT_APP_OPENAI_API_KEY=
OPENAI_API_KEY=
```

Keep secrets in local `.env` files and GitHub Actions secrets. Do not commit generated builds or local environment files.

## Available scripts

- `npm start` — run the local development server.
- `npm run build` — create a production build in `build/`.
- `npm test` — run the test suite in watch mode.
- `npm run lint:js` — lint JavaScript and JSX sources under `src/`.

## Deployment

The repository deploys to GitHub Pages from the `main` branch using `.github/workflows/deploy.yml`.

The workflow:

1. checks out the repository;
2. installs Node.js 20;
3. creates `.env` from GitHub Actions secrets;
4. installs dependencies;
5. runs `npm run lint:js` and `npm run build`;
6. publishes the `build/` directory to the `gh-pages` branch.

The production URL is configured in `package.json` as `https://KnowMe-app.github.io/main`.

## Routing

The app is hosted under `/main`, so the router is configured with `basename="/main"` in `src/index.js`.

## Search filters

The add-profile page includes radio-button filters for user history of C-section, marital status, and Rh factor. The filters appear above the user list.

## Helper constants

Additional pagination constants live in `src/components/constants.js`:

- `INVALID_DATE_TOKENS` — invalid date values used as fallback search tokens when matching date records are unavailable.

## Features

- Includes an age filter for 43+ profiles.

## Local Storage card cache

Cards are stored in a shared `cards` object, while lists such as `favorite` and `load2` keep arrays of card identifiers.

```json
{
  "cards": {
    "1": { "id": "1", "title": "Card 1", "lastAction": 1690000000000 }
  },
  "load2": ["1"],
  "favorite": ["1"]
}
```

### API

- `addCardToList(id, listKey)` — adds an identifier to a list without duplicates.
- `updateCard(id, data, remoteSave)` — saves updates in local storage and sends them to the backend in parallel.
- `getCardsByList(listKey, remoteFetch)` — returns cards for a list; if data is older than the 6-hour TTL, it refreshes the data from the backend.

### Example

```js
addCardToList('1', 'load2');
addCardToList('1', 'favorite');

updateCard('1', { title: 'New title' }, saveToServer);

const load2Cards = await getCardsByList('load2', fetchCard);
const favoriteCards = await getCardsByList('favorite', fetchCard);
```

Each card has a `lastAction` field. If a card cannot be loaded from the backend, its identifier is removed from the related list.

`AddNewProfile` uses the `favorite` and `load2` lists through `cardsStorage` together with the `queries` object, where each search key maps to a list of identifiers. Before requesting the backend, the app reads from `queries`; if data is missing or older than 6 hours, it fetches fresh data from the backend.
