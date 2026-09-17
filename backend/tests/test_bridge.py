from datetime import date
from unittest.mock import MagicMock
from milemark.garmin import normalize_run, normalize_wellness, GarminBridge


def test_run_conversion_and_sport_filter():
    row = {'activityId': 123, 'startTimeLocal': '2026-10-14 07:00:00',
           'activityType': {'typeKey': 'running'}, 'distance': 10000,
           'duration': 3300, 'averageHR': 145}
    assert normalize_run(row)['distanceKm'] == 10
    assert normalize_run(row)['durationSec'] == 3300
    assert normalize_run({**row, 'activityType': {'typeKey': 'cycling'}}) is None
    assert normalize_run({**row, 'distance': float('nan')}) is None
    assert normalize_run({**row, 'startTimeLocal': 'bad'}) is None


def test_missing_health_values_stay_missing():
    assert normalize_wellness('2026-10-15', {}, {})['sleepHours'] is None
    result = normalize_wellness('2026-10-15', {'dailySleepDTO': {'sleepTimeSeconds': 27000, 'sleepScores': {'overall': {'value': 84}}}},
                                {'hrvSummary': {'lastNightAvg': 51, 'baseline': {'balancedLow': 40, 'balancedUpper': 65}}})
    assert result['sleepHours'] == 7.5
    assert result['sleepScore'] == 84
    assert result['hrvBaselineLow'] == 40
    assert result['hrvBaselineHigh'] == 65


def test_sync_is_read_only_bounded_and_handles_missing_hrv(tmp_path):
    bridge = GarminBridge(tmp_path)
    bridge.client = MagicMock()
    bridge.client.get_activities.return_value = [{'activityId': 1, 'activityName': 'Morning', 'activityType': {'typeKey': 'running'},
                                                 'distance': 5000, 'duration': 1800, 'startTimeLocal': '2026-10-14 06:00:00'}]
    bridge.client.get_sleep_data.return_value = {}
    bridge.client.get_hrv_data.side_effect = RuntimeError('device not supported')
    value = bridge.sync(date(2026, 10, 15))
    assert len(value['runs']) == 1
    assert len(value['wellness']) == 14
    assert len(value['warnings']) == 14
    assert value['wellness'][0]['hrvMs'] is None
    assert set(call[0] for call in bridge.client.method_calls) == {'get_activities', 'get_sleep_data', 'get_hrv_data'}


def test_login_and_mfa_follow_installed_client_contract(tmp_path, monkeypatch):
    fake = MagicMock()
    fake.login.return_value = ('needs_mfa', None)
    factory = MagicMock(return_value=fake)
    monkeypatch.setattr('milemark.garmin.Garmin', factory)
    bridge = GarminBridge(tmp_path / 'tokens')
    assert bridge.login('runner@example.com', 'test-only-password') is True
    assert fake.password is None
    bridge.mfa('123456')
    fake.resume_login.assert_called_once_with({}, '123456')
    fake.client.dump.assert_called_once_with(str(tmp_path / 'tokens'))
    assert bridge.pending is False
