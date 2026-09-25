// Accurate, non-simulated Access & Visit Statistics Tracker

export interface AccessStats {
  totalVisits: number;
  todayVisits: number;
  lastDate: string;
}

const STORAGE_TOTAL_KEY = 'kaito_actual_total_visits';
const STORAGE_TODAY_KEY = 'kaito_actual_today_visits';
const STORAGE_DATE_KEY = 'kaito_actual_last_date';
const SESSION_COUNTED_KEY = 'kaito_visit_session_recorded';

function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Record a genuine visit/session.
 * Increments total count and today count honestly, without placeholder or mock figures.
 */
export function recordActualVisit(): AccessStats {
  const todayStr = getLocalDateString();

  try {
    const isSessionRecorded = sessionStorage.getItem(SESSION_COUNTED_KEY);
    const storedDate = localStorage.getItem(STORAGE_DATE_KEY);
    let storedTotal = parseInt(localStorage.getItem(STORAGE_TOTAL_KEY) || '0', 10);
    let storedToday = parseInt(localStorage.getItem(STORAGE_TODAY_KEY) || '0', 10);

    // If day changed, reset today's counter
    if (storedDate !== todayStr) {
      storedToday = 0;
      localStorage.setItem(STORAGE_DATE_KEY, todayStr);
    }

    // Only increment if this is a new browser tab/session activation
    if (!isSessionRecorded) {
      sessionStorage.setItem(SESSION_COUNTED_KEY, 'true');
      storedTotal += 1;
      storedToday += 1;

      localStorage.setItem(STORAGE_TOTAL_KEY, String(storedTotal));
      localStorage.setItem(STORAGE_TODAY_KEY, String(storedToday));

      // Also sync to mc_ values so legacy components don't see 420
      localStorage.setItem('mc_total_visits', String(storedTotal));
      localStorage.setItem('mc_today_visits', String(storedToday));
      localStorage.setItem('mc_last_visit_date', todayStr);

      window.dispatchEvent(new CustomEvent('kaito_access_stats_updated'));
    }

    return {
      totalVisits: Math.max(1, storedTotal),
      todayVisits: Math.max(1, storedToday),
      lastDate: todayStr
    };
  } catch {
    return {
      totalVisits: 1,
      todayVisits: 1,
      lastDate: todayStr
    };
  }
}

/**
 * Get current accurate access counts without incrementing
 */
export function getActualAccessStats(): AccessStats {
  const todayStr = getLocalDateString();
  try {
    const storedDate = localStorage.getItem(STORAGE_DATE_KEY);
    const storedTotal = parseInt(localStorage.getItem(STORAGE_TOTAL_KEY) || '1', 10);
    let storedToday = parseInt(localStorage.getItem(STORAGE_TODAY_KEY) || '1', 10);

    if (storedDate !== todayStr) {
      storedToday = 1;
    }

    return {
      totalVisits: Math.max(1, storedTotal),
      todayVisits: Math.max(1, storedToday),
      lastDate: todayStr
    };
  } catch {
    return {
      totalVisits: 1,
      todayVisits: 1,
      lastDate: todayStr
    };
  }
}
