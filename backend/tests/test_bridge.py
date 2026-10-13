from datetime import date
from unittest.mock import MagicMock
from milemark.garmin import normalize_run, normalize_wellness, normalize_performance, GarminBridge


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
    bridge.client.get_daily_steps.return_value = [{'calendarDate': '2026-10-15', 'totalSteps': 12345}, {'calendarDate': '2026-10-14', 'totalSteps': 0}]
    bridge.client.get_sleep_daily.return_value = []
    bridge.client.get_hrv_data_range.side_effect = RuntimeError('device not supported')
    bridge.client.get_max_metrics_range.return_value = []
    bridge.client.get_training_readiness.return_value = []
    bridge.client.get_race_predictions.return_value = {}
    value = bridge.sync(date(2026, 10, 15))
    assert len(value['runs']) == 1
    assert len(value['wellness']) == 28
    assert len(value['warnings']) == 1
    assert value['wellness'][0]['hrvMs'] is None
    assert value['wellness'][0]['steps'] == 12345
    assert value['wellness'][1]['steps'] == 0
    assert value['wellness'][2]['steps'] is None
    assert set(call[0] for call in bridge.client.method_calls) == {'get_daily_steps', 'get_activities', 'get_sleep_data', 'get_sleep_daily', 'get_hrv_data_range', 'get_max_metrics_range', 'get_training_readiness', 'get_race_predictions'}


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


def test_bulk_sleep_and_hrv_normalization_matches_garmin_range_shapes():
    row = normalize_wellness('2026-10-15', {'values': {'sleepScore': 82, 'totalSleepTimeInSeconds': 28800, 'restingHeartRate': 49}},
                             {'calendarDate': '2026-10-15', 'lastNightAvg': 56, 'weeklyAvg': 53, 'baseline': {'balancedLow': 45, 'balancedUpper': 65}})
    assert row['sleepScore'] == 82
    assert row['sleepHours'] == 8
    assert row['hrvMs'] == 56
    assert row['hrv7DayMs'] == 53
    assert row['restingHr'] == 49
    assert normalize_wellness('2026-10-15', {'avgOvernightHrv': 57}, {})['hrvMs'] == 57


def test_performance_uses_dated_vo2_and_run_summary_metrics():
    runs = [{'date': '2026-10-14', 'vo2Max': 52}]
    result = normalize_performance([{'generic': {'calendarDate': '2026-10-01', 'vo2MaxPreciseValue': 51.2}}], [], {'calendarDate': '2026-10-14', 'timeMarathon': 14000}, runs)
    assert result['vo2Max'] == 52
    assert result['vo2Date'] == '2026-10-14'
    assert result['racePredictions']['marathonSec'] == 14000
    assert result['trainingReadiness'] is None


def test_activity_cadence_is_not_doubled_and_unavailable_fields_stay_null():
    row = {'activityId': 1, 'startTimeLocal': '2026-10-15 07:00:00', 'activityType': {'typeKey': 'running'}, 'distance': 5000, 'duration': 1800,
           'averageRunningCadenceInStepsPerMinute': 167, 'avgPower': 240, 'maxHR': 180, 'vO2MaxValue': 52, 'aerobicTrainingEffect': 3.4}
    value = normalize_run(row)
    assert value['cadenceSpm'] == 167
    assert value['avgPowerW'] == 240
    assert value['maxHr'] == 180
    assert value['vo2Max'] == 52
    assert value['groundContactMs'] is None


def test_all_non_running_sports_are_excluded():
    row = {'activityId': 1, 'startTimeLocal': '2026-10-15 07:00:00', 'distance': 5000, 'duration': 1800}
    for kind in ['cycling', 'road_biking', 'indoor_cycling', 'swimming', 'lap_swimming', 'open_water_swimming', 'walking', 'hiking', 'multisport', 'fitness_equipment']:
        assert normalize_run({**row, 'activityType': {'typeKey': kind}}) is None
    for kind in ['running', 'trail_running', 'treadmill_running', 'track_running', 'indoor_running', 'virtual_run']:
        assert normalize_run({**row, 'activityType': {'typeKey': kind}}) is not None
