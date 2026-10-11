"""Read-only personal Garmin adapter. Not an official Garmin API integration."""
from datetime import date, timedelta, datetime, timezone as utc_timezone
from pathlib import Path
from zoneinfo import ZoneInfo
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
    if not distance or not duration or item.get('activityId') is None:
        return None
    return {
        'id': f"garmin-{item['activityId']}", 'date': started,
        'name': str(item.get('activityName') or 'Run')[:160],
        'distanceKm': round(distance / 1000, 3), 'durationSec': duration,
        'avgHr': number(item.get('averageHR'), 20, 250),
        'elevationM': number(item.get('elevationGain')),
        'cadenceSpm': number(item.get('averageRunningCadenceInStepsPerMinute'), 40, 300),
        'maxHr': number(item.get('maxHR'), 20, 250),
        'avgPowerW': number(item.get('avgPower'), 1, 2000),
        'aerobicEffect': number(item.get('aerobicTrainingEffect'), 0, 5),
        'anaerobicEffect': number(item.get('anaerobicTrainingEffect'), 0, 5),
        'vo2Max': number(item.get('vO2MaxValue'), 10, 100),
        'groundContactMs': number(item.get('avgGroundContactTime'), 50, 1000),
        # Names containing 'race' are not reliable proof of an all-out race.
        'race': (item.get('eventType') or {}).get('typeKey') == 'race',
    }


def normalize_wellness(day, sleep, hrv):
    dto = (sleep or {}).get('dailySleepDTO') or {}
    values = (sleep or {}).get('values') or {}
    scores = dto.get('sleepScores') or {}
    summary = (hrv or {}).get('hrvSummary') or hrv or {}
    baseline = summary.get('baseline') or {}
    def pick(*items):
        return next((value for value in items if value is not None), None)
    seconds = number(pick(dto.get('sleepTimeSeconds'), values.get('totalSleepTimeInSeconds')), 1, 86400)
    return {
        'date': day,
        'sleepScore': number(pick((scores.get('overall') or {}).get('value'), values.get('sleepScore')), 0, 100),
        'sleepHours': round(seconds / 3600, 2) if seconds is not None else None,
        'hrvMs': number(pick(summary.get('lastNightAvg'), (sleep or {}).get('avgOvernightHrv'), values.get('avgOvernightHrv')), 1, 500),
        'hrv7DayMs': number(pick(summary.get('weeklyAvg'), values.get('hrv7dAverage')), 1, 500),
        'hrvBaselineLow': number(baseline.get('balancedLow'), 0, 500),
        'hrvBaselineHigh': number(baseline.get('balancedUpper'), 0, 500),
        'restingHr': number(pick((sleep or {}).get('restingHeartRate'), values.get('restingHeartRate')), 20, 250),
    }


def normalize_performance(metrics, readiness, predictions, runs):
    rows = metrics if isinstance(metrics, list) else []
    vo2 = [row.get('generic') for row in rows if isinstance(row, dict) and isinstance(row.get('generic'), dict)]
    vo2 = sorted((row for row in vo2 if number(row.get('vo2MaxPreciseValue') or row.get('vo2MaxValue'), 10, 100) is not None), key=lambda row: row.get('calendarDate', ''), reverse=True)
    from_run = next((r for r in sorted(runs, key=lambda r: r['date'], reverse=True) if r.get('vo2Max') is not None), None)
    value = vo2[0] if vo2 else None
    # Prefer the newest dated measurement, including VO2 reported on a run.
    if from_run and (not value or from_run['date'] > value.get('calendarDate', '')):
        value = {'vo2MaxValue': from_run['vo2Max'], 'calendarDate': from_run['date']}
    readiness_rows = readiness if isinstance(readiness, list) else []
    ready = next((r for r in sorted(readiness_rows, key=lambda x: x.get('timestampLocal', ''), reverse=True) if number(r.get('score'), 0, 100) is not None), {})
    pred = predictions if isinstance(predictions, dict) else {}
    return {
        'vo2Max': number(value.get('vo2MaxPreciseValue') or value.get('vo2MaxValue'), 10, 100) if value else None,
        'vo2Date': value.get('calendarDate') if value else None,
        'trainingReadiness': number(ready.get('score'), 0, 100),
        'readinessDate': ready.get('calendarDate') or str(ready.get('timestampLocal') or '')[:10] or None,
        'racePredictions': {'date': pred.get('calendarDate'), 'fiveKSec': number(pred.get('time5K'), 100, 100000),
                            'tenKSec': number(pred.get('time10K'), 100, 100000), 'halfSec': number(pred.get('timeHalfMarathon'), 100, 100000),
                            'marathonSec': number(pred.get('timeMarathon'), 100, 100000)},
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

    def sync(self, today=None, timezone='America/Los_Angeles'):
        if not self.client or self.pending:
            if not self.restore():
                raise ValueError('Connect your Garmin account first.')
        today = today or datetime.now(ZoneInfo(timezone)).date()
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
        def optional(name, *args):
            try:
                return getattr(self.client, name)(*args)
            except Exception:
                warnings.append(f'{name.removeprefix("get_").replace("_", " ").capitalize()} could not be retrieved. Other imported data is preserved.')
                return None
        end = today.isoformat()
        start = (today - timedelta(days=27)).isoformat()
        sleep_rows = optional('get_sleep_daily', start, end)
        hrv_range = optional('get_hrv_data_range', start, end)
        sleeps = {row.get('calendarDate'): row for row in sleep_rows if isinstance(row, dict)} if isinstance(sleep_rows, list) else {}
        summaries = hrv_range.get('hrvSummaries') or [] if isinstance(hrv_range, dict) else []
        hrvs = {row.get('calendarDate'): row for row in summaries if isinstance(row, dict)}
        wellness = []
        for delta in range(28):
            day = (today - timedelta(days=delta)).isoformat()
            sleep = sleeps.get(day, {})
            normalized = normalize_wellness(day, sleep, hrvs.get(day, {}))
            # Different Garmin devices expose overnight HRV in sleep details.
            # Only fetch recent missing details; bulk endpoints cover history.
            if delta < 7 and (normalized['sleepScore'] is None or normalized['hrvMs'] is None):
                detail = optional('get_sleep_data', day)
                if isinstance(detail, dict):
                    extra = normalize_wellness(day, detail, hrvs.get(day, {}))
                    normalized = {key: extra.get(key) if extra.get(key) is not None else value for key, value in normalized.items()}
            wellness.append(normalized)
        metrics = optional('get_max_metrics_range', (today - timedelta(days=90)).isoformat(), end)
        readiness = optional('get_training_readiness', end)
        predictions = optional('get_race_predictions')
        performance = normalize_performance(metrics, readiness, predictions, runs)
        # No raw payloads, GPS coordinates, profile details, or tokens exported.
        return {'runs': sorted({r['id']: r for r in runs}.values(), key=lambda r: r['date'], reverse=True),
                'wellness': wellness, 'performance': performance, 'warnings': sorted(set(warnings)),
                'syncedAt': datetime.now(utc_timezone.utc).isoformat()}
