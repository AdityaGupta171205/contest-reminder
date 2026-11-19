import { useMemo, useState } from 'react';
import { buildGoogleCalendarViewUrl } from '../utils/calendar';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toLocalDateKey(dateInput) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ContestCalendar({
  contests,
  selectedDate,
  onSelectDate,
  syncedEvents,
  syncingId,
  onSetReminder,
}) {
  const todayKey = toLocalDateKey(new Date());
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const contestsByDate = useMemo(() => {
    const map = {};
    for (const c of contests) {
      const key = toLocalDateKey(c.startDate);
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [contests]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells = [];
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarCells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    calendarCells.push({
      day,
      key: toLocalDateKey(dateObj),
    });
  }

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    onSelectDate(todayKey);
  };

  const activeDayKey = selectedDate || todayKey;
  const activeDayContests = contestsByDate[activeDayKey] || [];

  return (
    <aside className="calendar-panel">
      {/* Calendar Month Navigation */}
      <div className="cal-header">
        <h3>
          {currentMonth.toLocaleString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <div className="cal-nav">
          <button className="btn-icon" onClick={prevMonth} title="Previous month">
            ‹
          </button>
          <button className="btn-today" onClick={goToday}>
            Today
          </button>
          <button className="btn-icon" onClick={nextMonth} title="Next month">
            ›
          </button>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="cal-grid cal-weekdays">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="cal-weekday">
            {d}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="cal-grid cal-days">
        {calendarCells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="cal-cell empty" />;
          }

          const dayContests = contestsByDate[cell.key] || [];
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDate;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : cell.key)}
              className={`cal-cell ${isToday ? 'today' : ''} ${
                isSelected ? 'selected' : ''
              } ${dayContests.length > 0 ? 'has-events' : ''}`}
            >
              <span className="cal-day-num">{cell.day}</span>
              <div className="cal-dots">
                {dayContests.slice(0, 4).map((c) => (
                  <span
                    key={c.id}
                    className={`cal-dot ${c.platform}`}
                    title={`${c.name} (${c.platform})`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Day Agenda Preview */}
      <div className="cal-agenda">
        <div className="cal-agenda-header">
          <span>
            {new Date(activeDayKey + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
          {selectedDate && (
            <button className="btn-clear-date" onClick={() => onSelectDate(null)}>
              Show all dates
            </button>
          )}
        </div>

        {activeDayContests.length === 0 ? (
          <p className="cal-empty-msg">No contests scheduled on this day.</p>
        ) : (
          <div className="cal-agenda-list">
            {activeDayContests.map((contest) => {
              const isSynced = syncedEvents.has(contest.id);
              const isSyncing = syncingId === contest.id;
              const gcalViewUrl = buildGoogleCalendarViewUrl();

              return (
                <div key={contest.id} className="cal-agenda-item">
                  <div>
                    <span className={`platform-badge ${contest.platform}`}>
                      {contest.platform}
                    </span>
                    <a
                      href={contest.url}
                      target="_blank"
                      rel="noreferrer"
                      className="cal-agenda-title"
                    >
                      {contest.name}
                    </a>
                    <div className="cal-agenda-time">
                      {new Date(contest.startDate).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      • {contest.durationMinutes}m
                    </div>
                  </div>

                  <div className="cal-agenda-actions" style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className={`btn btn-sm ${isSynced ? 'btn-synced' : 'btn-primary'}`}
                      disabled={isSynced || isSyncing}
                      onClick={() => onSetReminder(contest)}
                    >
                      {isSyncing ? '...' : isSynced ? '✓' : 'Set Reminder'}
                    </button>
                    <a
                    href={gcalViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-outline"
                    title="Open current month in Google Calendar"
                    >
                    ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}