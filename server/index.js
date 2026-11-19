require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const cache = new NodeCache({ stdTTL: 1800 });

// Required when hosted behind Render/Railway reverse proxies
app.set('trust proxy', 1);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: IS_PROD ? 'none' : 'lax',
  secure: IS_PROD, // Must be true for sameSite: 'none' over HTTPS
  maxAge: SEVEN_DAYS_MS,
};

const CODOLIO_BASE_URL =
  'https://node.codolio.com/api/contest-calendar/v1/all/get-contests';

async function refreshGoogleAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || 'Failed to refresh token');
  }

  return res.json();
}

// Health check route (useful for keeping free Render instance awake)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/google', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).json({ error: tokens.error_description || 'Token exchange failed' });
    }

    if (tokens.refresh_token) {
      res.cookie('gcal_refresh_token', tokens.refresh_token, COOKIE_OPTIONS);
    }

    res.json({ access_token: tokens.access_token });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.get('/api/auth/token', async (req, res) => {
  try {
    const refreshToken = req.cookies.gcal_refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No active session' });
    }

    const refreshed = await refreshGoogleAccessToken(refreshToken);
    res.cookie('gcal_refresh_token', refreshToken, COOKIE_OPTIONS);
    res.json({ access_token: refreshed.access_token });
  } catch (err) {
    res.clearCookie('gcal_refresh_token', COOKIE_OPTIONS);
    res.status(401).json({ error: 'Session expired, please reconnect' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('gcal_refresh_token', COOKIE_OPTIONS);
  res.json({ success: true });
});

app.get('/api/contests', async (req, res) => {
  try {
    const includeLong = req.query.includeLong === 'true';
    const cacheKey = `contests_${includeLong}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      return res.json({ source: 'cache', contests: cached });
    }

    const now = new Date();
    const endWindow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const url = new URL(CODOLIO_BASE_URL);
    url.searchParams.set('startDate', now.toISOString());
    url.searchParams.set('endDate', endWindow.toISOString());

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Codolio API responded with ${response.status}` });
    }

    const json = await response.json();

    if (!json.status?.success || !Array.isArray(json.data)) {
      return res.status(502).json({ error: 'Invalid data format from Codolio' });
    }

    const contests = json.data
      .filter((c) => new Date(c.contestEndDate) > now)
      .filter((c) => includeLong || c.contestDuration <= 86400)
      .sort((a, b) => new Date(a.contestStartDate) - new Date(b.contestStartDate))
      .map((c) => ({
        id: c._id,
        code: c.contestCode,
        name: c.contestName,
        platform: c.platform.toLowerCase(),
        type: c.contestType,
        startDate: c.contestStartDate,
        endDate: c.contestEndDate,
        durationMinutes: Math.round(c.contestDuration / 60),
        url: c.contestUrl,
      }));

    cache.set(cacheKey, contests);
    res.json({ source: 'api', contests });
  } catch (err) {
    console.error('Error fetching contests:', err);
    res.status(500).json({ error: 'Failed to fetch contests', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});