const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// Opens the current month view in Google Calendar
export function buildGoogleCalendarViewUrl() {
  return 'https://calendar.google.com/calendar/r/month';
}

// Returns a Map of { codolioId => htmlLink } for already-synced events
export async function fetchSyncedContests(accessToken) {
  const nowISO = new Date().toISOString();
  const url = new URL(CALENDAR_API_BASE);
  url.searchParams.set('timeMin', nowISO);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('maxResults', '250');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error('Failed to read existing calendar events');
  const data = await res.json();

  const syncedMap = new Map();
  for (const item of data.items || []) {
    const codolioId = item.extendedProperties?.private?.codolioId;
    if (codolioId) {
      syncedMap.set(codolioId, item.htmlLink || null);
    }
  }
  return syncedMap;
}

export async function addContestToGoogleCalendar(accessToken, contest, reminderMinutes = 30) {
  const eventBody = {
    summary: `${contest.name} [${contest.platform.toUpperCase()}]`,
    description: `Platform: ${contest.platform.toUpperCase()}\nDuration: ${contest.durationMinutes} mins\nContest Link: ${contest.url}`,
    location: contest.url,
    start: { dateTime: contest.startDate },
    end: { dateTime: contest.endDate },
    extendedProperties: {
      private: {
        codolioId: contest.id,
      },
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: Number(reminderMinutes) }],
    },
  };

  const res = await fetch(CALENDAR_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to insert calendar event');
  }

  return res.json();
}