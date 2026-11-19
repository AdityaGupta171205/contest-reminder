import { useEffect, useState, useMemo, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  buildGoogleCalendarViewUrl,
  fetchSyncedContests,
  addContestToGoogleCalendar,
} from './utils/calendar';
import ContestCalendar, { toLocalDateKey } from './components/ContestCalendar';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const PLATFORMS = ['all', 'codeforces', 'leetcode', 'atcoder', 'codechef', 'geeksforgeeks'];

export default function App() {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & Preferences
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeLong, setIncludeLong] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [selectedDate, setSelectedDate] = useState(null);

  // Google Calendar OAuth & Sync State
  const [accessToken, setAccessToken] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [syncedEvents, setSyncedEvents] = useState(new Map());
  const [syncingId, setSyncingId] = useState(null);
  const pendingContestRef = useRef(null);

  // 1. Silently restore 7-day login session on page load
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/token`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (data?.access_token) {
          setAccessToken(data.access_token);
          try {
            const existingMap = await fetchSyncedContests(data.access_token);
            setSyncedEvents(existingMap);
          } catch (err) {
            console.error('Could not fetch existing events:', err);
          }
        }
      })
      .finally(() => setAuthChecking(false));
  }, []);

  // 2. Fetch contests
  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`${API_BASE}/api/contests?includeLong=${includeLong}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load contests from server');
        return res.json();
      })
      .then((data) => {
        setContests(data.contests || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [includeLong]);

  // Helper to refresh token if the 1-hour access token expires while tab stays open
  const getFreshAccessToken = async () => {
    const res = await fetch(`${API_BASE}/api/auth/token`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    setAccessToken(data.access_token);
    return data.access_token;
  };

  const syncContestWithToken = async (token, contest) => {
    setSyncingId(contest.id);
    try {
      let createdEvent;
      try {
        createdEvent = await addContestToGoogleCalendar(token, contest, reminderMinutes);
      } catch (err) {
        // Retry once with a refreshed token if the 1-hour access token expired
        const freshToken = await getFreshAccessToken();
        if (!freshToken) throw err;
        createdEvent = await addContestToGoogleCalendar(freshToken, contest, reminderMinutes);
      }

      setSyncedEvents((prev) => {
        const next = new Map(prev);
        next.set(contest.id, createdEvent.htmlLink || null);
        return next;
      });
    } catch (err) {
      alert(`Error adding reminder: ${err.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  // 3. Authorization Code flow (issues 7-day refresh_token cookie via backend)
  const connectCalendar = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    onSuccess: async ({ code }) => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code }),
        });

        const data = await res.json();
        if (!res.ok || !data.access_token) {
          throw new Error(data.error || 'Failed to establish session');
        }

        const token = data.access_token;
        setAccessToken(token);

        let existingMap = new Map();
        try {
          existingMap = await fetchSyncedContests(token);
          setSyncedEvents(existingMap);
        } catch (err) {
          console.error('Could not fetch existing events:', err);
        }

        if (pendingContestRef.current) {
          const contestToSync = pendingContestRef.current;
          pendingContestRef.current = null;
          if (!existingMap.has(contestToSync.id)) {
            await syncContestWithToken(token, contestToSync);
          }
        }
      } catch (err) {
        pendingContestRef.current = null;
        alert(`Login failed: ${err.message}`);
      }
    },
    onError: () => {
      pendingContestRef.current = null;
      alert('Google Sign-In failed. Check your OAuth credentials.');
    },
  });

  const handleDisconnect = async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setAccessToken(null);
    setSyncedEvents(new Map());
  };

  const handleSetReminder = async (contest) => {
    if (syncedEvents.has(contest.id)) return;

    if (!accessToken) {
      pendingContestRef.current = contest;
      connectCalendar();
      return;
    }

    await syncContestWithToken(accessToken, contest);
  };

  const baseFilteredContests = useMemo(() => {
    return contests.filter((c) => {
      const matchesPlatform =
        selectedPlatform === 'all' || c.platform === selectedPlatform;
      const matchesSearch = c.name
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase());
      return matchesPlatform && matchesSearch;
    });
  }, [contests, selectedPlatform, searchQuery]);

  const listContests = useMemo(() => {
    if (!selectedDate) return baseFilteredContests;
    return baseFilteredContests.filter(
      (c) => toLocalDateKey(c.startDate) === selectedDate
    );
  }, [baseFilteredContests, selectedDate]);

  const formatDuration = (mins) => {
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div>
          <h1>Contest Radar</h1>
          <p className="subtitle">
            Live contest feed powered by Codolio • Direct Google Calendar sync
          </p>
        </div>

        <div className="auth-controls">
          <label className="reminder-select">
            Alert:
            <select
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(Number(e.target.value))}
            >
              <option value={10}>10 mins before</option>
              <option value={15}>15 mins before</option>
              <option value={30}>30 mins before</option>
              <option value={60}>1 hour before</option>
            </select>
          </label>

          {authChecking ? (
            <span className="duration">Checking session...</span>
          ) : !accessToken ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                pendingContestRef.current = null;
                connectCalendar();
              }}
            >
              Connect Google Calendar
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge-connected">Calendar Connected ✓</span>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleDisconnect}
                title="Disconnect Google account"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Filters */}
      <section className="controls">
        <div className="platform-tabs">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              className={`tab ${selectedPlatform === p ? 'active' : ''}`}
              onClick={() => setSelectedPlatform(p)}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="secondary-filters">
          <input
            type="text"
            placeholder="Search contests (e.g., Div. 2, Weekly)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeLong}
              onChange={(e) => setIncludeLong(e.target.checked)}
            />
            Include multi-day challenges
          </label>
        </div>
      </section>

      {/* Main Split Layout: Left List + Right Calendar */}
      <div className="main-layout">
        <main className="contest-list-column">
          {selectedDate && (
            <div className="date-filter-banner">
              <span>
                Filtered by date:{' '}
                <strong>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </strong>
              </span>
              <button className="btn-clear-date" onClick={() => setSelectedDate(null)}>
                Clear filter ×
              </button>
            </div>
          )}

          {loading && <div className="status-box">Loading upcoming contests...</div>}
          {error && <div className="status-box error">{error}</div>}

          {!loading && !error && listContests.length === 0 && (
            <div className="status-box">No upcoming contests match your filters.</div>
          )}

          <div className="contest-list">
            {listContests.map((contest) => {
              const isSynced = syncedEvents.has(contest.id);
              const isSyncing = syncingId === contest.id;
              const isLive = new Date(contest.startDate) <= new Date();
              const gcalViewUrl = buildGoogleCalendarViewUrl();

              return (
                <div key={contest.id} className="contest-card">
                  <div className="contest-info">
                    <div className="meta-row">
                      <span className={`platform-badge ${contest.platform}`}>
                        {contest.platform}
                      </span>
                      <span className="duration">
                        {formatDuration(contest.durationMinutes)}
                      </span>
                      {isLive && <span className="live-badge">LIVE NOW</span>}
                    </div>

                    <h3 className="contest-title">
                      <a href={contest.url} target="_blank" rel="noreferrer">
                        {contest.name}
                      </a>
                    </h3>

                    <p className="contest-time">
                      {new Date(contest.startDate).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="card-actions">
                    <button
                      className={`btn ${isSynced ? 'btn-synced' : 'btn-primary'}`}
                      disabled={isSynced || isSyncing}
                      onClick={() => handleSetReminder(contest)}
                    >
                      {isSyncing
                        ? 'Adding...'
                        : isSynced
                        ? 'Reminder Set ✓'
                        : 'Set Reminder'}
                    </button>

                    <a
                      href={gcalViewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline"
                      title="Open current month in Google Calendar"
                    >
                      Open GCal ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Right Side Calendar View */}
        <ContestCalendar
          contests={baseFilteredContests}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          syncedEvents={syncedEvents}
          syncingId={syncingId}
          onSetReminder={handleSetReminder}
        />
      </div>
    </div>
  );
}