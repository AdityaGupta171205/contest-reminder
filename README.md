# Contest Radar (`contest-reminder`)

A full-stack web application that aggregates upcoming competitive programming contests across **Codeforces, LeetCode, AtCoder, CodeChef, and GeeksforGeeks** (powered by Codolio's contest feed) and lets you set **one-click Google Calendar reminders** with customizable popup alerts.

---

## Features

- **Multi-Platform Contest Feed:** Live aggregation of upcoming coding contests from Codeforces, LeetCode, AtCoder, CodeChef, and GeeksforGeeks.
- **One-Click Google Calendar Sync:** Directly inserts contest events into your primary Google Calendar with customizable popup notifications (10m, 15m, 30m, or 1h before start).
- **Duplicate Prevention:** Automatically checks your existing Google Calendar events (`extendedProperties.private.codolioId`) so you never add the same contest twice.
- **7-Day Persistent Login Session:** Uses Google's OAuth 2.0 Authorization Code flow with HTTP-only refresh token cookies so you stay signed in across page reloads and mobile sessions.
- **Interactive Monthly Calendar View:** Side-by-side split dashboard with platform color-coded dots, day agenda previews, and instant date filtering.
- **Smart Filtering:** Filter by platform, search by contest name, and toggle multi-day challenges on or off.

---

## Tech Stack

- **Frontend:** React 18, Vite, CSS3, `@react-oauth/google`
- **Backend:** Node.js, Express, `node-cache`, `cookie-parser`, `cors`
- **APIs & Services:** Google Calendar API v3, Google OAuth 2.0, Codolio Contest Calendar API
- **Hosting:** Vercel (Frontend) & Render (Backend)

---

## Project Structure

```text
contest-reminder/
├── client/                     # React + Vite frontend
│   ├── public/                 # Favicon & static assets
│   ├── src/
│   │   ├── components/
│   │   │   └── ContestCalendar.jsx
│   │   ├── utils/
│   │   │   └── calendar.js
│   │   ├── App.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env
│   ├── index.html
│   └── package.json
└── server/                     # Node.js + Express backend
    ├── .env
    ├── index.js
    └── package.json
```

---

## Local Setup

### 1. Prerequisites
- Node.js (v18+ recommended)
- A Google Cloud project with the **Google Calendar API** enabled and an **OAuth 2.0 Web Client ID** (`http://localhost:5173` added to Authorized JavaScript origins).

### 2. Clone the Repository
```bash
git clone https://github.com/AdityaGupta171205/contest-reminder.git
cd contest-reminder
```

### 3. Configure & Start the Backend
```bash
cd server
npm install
```

Create a `server/.env` file:
```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

Start the Express server:
```bash
node index.js
```

### 4. Configure & Start the Frontend
Open a second terminal:
```bash
cd client
npm install
```

Create a `client/.env` file:
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
```

Start the Vite dev server:
```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Deployment

- **Backend (Render):** Deployed as a Web Service with Root Directory set to `server`, `NODE_ENV=production`, and `CLIENT_ORIGIN` pointing to the Vercel frontend URL.
- **Frontend (Vercel):** Deployed with Root Directory set to `client` and `VITE_API_BASE_URL` pointing to the Render backend URL.
