"""Read-only personal Garmin adapter. Not an official Garmin API integration."""
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
import math
import os
from garminconnect import Garmin


def number(value, low=0, high=1_000_000):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) and low <= result <= high else None
    except (ValueError, TypeError):
        return None


def normalize_run(item):
    kind = (item.get('activityType') or {}).get('typeKey', '')
    if kind not in {'running', 'trail_running', 'treadmill_running', 'track_running', 'indoor_running', 'virtual_run'}:
        return None
    distance = number(item.get('distance'))
    duration = number(item.get('duration'))
    started = str(item.get('startTimeLocal') or item.get('startTimeGMT') or '')[:10]
    try:
        date.fromisoformat(started)
    except ValueError:
        return None
    if not distance or not duration:
        return None
    return {
        'id': f"garmin-{item['activityId']}", 'date': started,
        'name': str(item.get('activityName') or 'Run')[:160],
        'distanceKm': round(distance / 1000, 3), 'durationSec': duration,
        'avgHr': number(item.get('averageHR'), 20, 250),
        'elevationM': number(item.get('elevationGain')),
        # Names containing 'race' are not reliable proof of an all-out race.
        'race': item.get('eventType', {}).get('typeKey') == 'race',
    }


def normalize_wellness(day, sleep, hrv):
    dto = (sleep or {}).get('dailySleepDTO') or {}
    scores = dto.get('sleepScores') or {}
    summary = (hrv or {}).get('hrvSummary') or {}
    baseline = summary.get('baseline') or {}
    seconds = number(dto.get('sleepTimeSeconds'), 0, 86400)
    return {
        'date': day,
        'sleepScore': number((scores.get('overall') or {}).get('value'), 0, 100),
        'sleepHours': round(seconds / 3600, 2) if seconds is not None else None,
        'hrvMs': number(summary.get('lastNightAvg'), 0, 500),
        'hrvBaselineLow': number(baseline.get('balancedLow'), 0, 500),
        'hrvBaselineHigh': number(baseline.get('balancedUpper'), 0, 500),
    }


class GarminBridge:
    def __init__(self, token_dir: Path):
        self.token_dir = token_dir
        self.client = None
        self.pending = False

    def _save(self):
        self.token_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.token_dir, 0o700)
        self.client.client.dump(str(self.token_dir))
        self.client.password = None

    def login(self, email, password):
        self.client = Garmin(email, password, return_on_mfa=True, retry_attempts=1)
        status, _ = self.client.login()
        self.client.password = None
        self.pending = status == 'needs_mfa'
        if not self.pending:
            # Early-return login has not loaded the profile; restoring the saved
            # session through login loads it without resending a password.
            self._save()
            self.client = Garmin(retry_attempts=1)
            self.client.login(str(self.token_dir))
        return self.pending

    def mfa(self, code):
        if not self.client or not self.pending:
            raise ValueError('Start a Garmin login first.')
        self.client.resume_login({}, code)
        self.pending = False
        self._save()

    def restore(self):
        if not (self.token_dir / 'garmin_tokens.json').exists():
            return False
        self.client = Garmin(retry_attempts=1)
        self.client.login(str(self.token_dir))
        return True

    def disconnect(self):
        if self.client:
            self.client.logout(str(self.token_dir))
        else:
            Garmin().logout(str(self.token_dir))
        self.client = None
        self.pending = False

    def sync(self, today=None):
        if not self.client or self.pending:
            if not self.restore():
                raise ValueError('Connect your Garmin account first.')
        today = today or date.today()
        runs, warnings = [], []
        cutoff = today - timedelta(days=365)
        # Bounded pagination: at most 1,000 recent activities; no write methods.
        for start in range(0, 1000, 100):
            rows = self.client.get_activities(start, 100)
            if not isinstance(rows, list):
                raise ValueError('Garmin returned an unexpected activities response.')
            for row in rows:
                run = normalize_run(row)
                if run and run['date'] >= cutoff.isoformat():
                    runs.append(run)
            if len(rows) < 100 or any(str(r.get('startTimeLocal', ''))[:10] < cutoff.isoformat() for r in rows):
                break
        else:
            warnings.append('Activity import limited to the 1,000 most recent activities.')
        wellness = []
        for delta in range(14):
            day = (today - timedelta(days=delta)).isoformat()
            values = []
            for method in (self.client.get_sleep_data, self.client.get_hrv_data):
                try:
                    values.append(method(day))
                except Exception:
                    values.append({})
                    warnings.append(f"Some recovery data is unavailable for {day}.")
            wellness.append(normalize_wellness(day, *values))
        # No raw payloads, GPS coordinates, profile details, or tokens exported.
        return {'runs': sorted({r['id']: r for r in runs}.values(), key=lambda r: r['date'], reverse=True),
                'wellness': wellness, 'warnings': sorted(set(warnings)),
                'syncedAt': datetime.now(timezone.utc).isoformat()}
