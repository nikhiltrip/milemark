import importlib
from fastapi.testclient import TestClient
import pytest


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('MILEMARK_DATA_DIR', str(tmp_path))
    from milemark import app as module
    module = importlib.reload(module)
    with TestClient(module.app, base_url='http://127.0.0.1:8000') as client:
        yield client, module


def test_rejects_host_rebinding_cross_origin_and_csrf(api):
    client, _ = api
    assert client.get('/api/session', headers={'host': 'evil.example'}).status_code == 403
    assert client.get('/api/session', headers={'origin': 'https://evil.example'}).status_code == 403
    assert client.post('/api/garmin/sync').status_code == 403
    data = client.get('/api/session').json()
    assert data['local'] is True
    assert data['connected'] is False


def test_sync_persists_snapshot_and_does_not_destroy_on_error(api, monkeypatch):
    client, module = api
    token = client.get('/api/session').json()['token']
    headers = {'x-milemark-token': token}
    value = {'runs': [], 'wellness': [], 'syncedAt': '2026-10-15'}
    monkeypatch.setattr(module.BRIDGE, 'sync', lambda **kwargs: value)
    assert client.post('/api/garmin/sync', headers=headers).json() == value
    assert client.get('/api/snapshot').json() == value
    def broken(**kwargs):
        raise RuntimeError('sensitive-internal-detail')
    monkeypatch.setattr(module.BRIDGE, 'sync', broken)
    response = client.post('/api/garmin/sync', headers=headers)
    assert response.status_code == 502
    assert 'sensitive-internal-detail' not in response.text
    assert client.get('/api/snapshot').json() == value


def test_mfa_and_login_errors_are_redacted(api, monkeypatch):
    client, module = api
    headers = {'x-milemark-token': client.get('/api/session').json()['token']}
    def broken(*args):
        raise RuntimeError('password-internal-never-output')
    monkeypatch.setattr(module.BRIDGE, 'login', broken)
    response = client.post('/api/garmin/login', headers=headers, json={'email': 'test@example.com', 'password': 'test-only-password'})
    assert response.status_code == 401
    assert 'password-internal' not in response.text
    assert 'test-only-password' not in response.text
    assert client.post('/api/garmin/mfa', headers=headers, json={'code': 'bad'}).status_code == 422


def test_sync_uses_browser_timezone_and_rejects_invalid_timezone(api, monkeypatch):
    client, module = api
    headers = {'x-milemark-token': client.get('/api/session').json()['token']}
    from unittest.mock import Mock
    sync = Mock(return_value={'runs': [], 'wellness': []})
    monkeypatch.setattr(module.BRIDGE, 'sync', sync)
    assert client.post('/api/garmin/sync', headers=headers, json={'timezone': 'America/Los_Angeles'}).status_code == 200
    sync.assert_called_once_with(timezone='America/Los_Angeles')
    assert client.post('/api/garmin/sync', headers=headers, json={'timezone': 'Invalid/Timezone'}).status_code == 422
