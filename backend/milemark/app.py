"""Loopback-only backend. Serves the built dashboard and local Garmin endpoints."""
from pathlib import Path
from urllib.parse import urlparse
import json
import os
import secrets
import sqlite3
import threading
import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, SecretStr
from .garmin import GarminBridge

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get('MILEMARK_DATA_DIR', ROOT / 'backend' / 'data'))
DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(DATA, 0o700)
BRIDGE = GarminBridge(DATA / 'garmin')
LOCK = threading.Lock()
CSRF = secrets.token_urlsafe(32)
last_login = 0.0
app = FastAPI(title='Milemark local bridge', docs_url=None, redoc_url=None, openapi_url=None)


def db():
    conn = sqlite3.connect(DATA / 'milemark.sqlite3')
    conn.execute('CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
    os.chmod(DATA / 'milemark.sqlite3', 0o600)
    return conn


def read_snapshot():
    with db() as conn:
        row = conn.execute('SELECT value FROM snapshot WHERE id=1').fetchone()
    return json.loads(row[0]) if row else {'runs': [], 'wellness': []}


@app.middleware('http')
async def local_only(request: Request, call_next):
    allowed = {'127.0.0.1', 'localhost', '[::1]'}
    if request.url.hostname not in allowed or (request.client and request.client.host not in {'127.0.0.1', '::1', 'testclient'}):
        return JSONResponse({'detail': 'Milemark only accepts local connections.'}, status_code=403)
    origin = request.headers.get('origin')
    if origin and origin not in {'http://127.0.0.1:8000', 'http://localhost:8000', 'http://127.0.0.1:5173', 'http://localhost:5173'}:
        return JSONResponse({'detail': 'Origin not allowed.'}, status_code=403)
    if request.method not in {'GET', 'HEAD', 'OPTIONS'} and not secrets.compare_digest(request.headers.get('x-milemark-token', ''), CSRF):
        return JSONResponse({'detail': 'Refresh the dashboard and try again.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return response


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr


class MFA(BaseModel):
    code: str = Field(pattern=r'^\d{4,10}$')


def busy():
    if not LOCK.acquire(blocking=False):
        raise HTTPException(409, 'A Garmin request is already running. Please wait.')


@app.get('/api/session')
def session():
    return {'local': True, 'token': CSRF, 'connected': bool(BRIDGE.client and not BRIDGE.pending) or (DATA / 'garmin' / 'garmin_tokens.json').exists()}


@app.post('/api/garmin/login')
def login(body: Login):
    global last_login
    busy()
    try:
        if time.monotonic() - last_login < 15:
            raise HTTPException(429, 'Wait 15 seconds before another login attempt.')
        last_login = time.monotonic()
        pending = BRIDGE.login(body.email, body.password.get_secret_value())
        return {'needsMfa': pending}
    except HTTPException:
        raise
    except Exception:
        BRIDGE.client = None
        BRIDGE.pending = False
        raise HTTPException(401, 'Garmin sign-in failed. Check your credentials; Garmin may also be unavailable or limiting requests.') from None
    finally:
        LOCK.release()


@app.post('/api/garmin/mfa')
def mfa(body: MFA):
    busy()
    try:
        BRIDGE.mfa(body.code)
        return {'connected': True}
    except Exception:
        raise HTTPException(401, 'Code not accepted. Try again, or restart Garmin sign-in.') from None
    finally:
        LOCK.release()


@app.post('/api/garmin/sync')
def sync():
    busy()
    try:
        value = BRIDGE.sync()
        with db() as conn:
            conn.execute('INSERT OR REPLACE INTO snapshot VALUES(1, ?)', (json.dumps(value, allow_nan=False),))
        return value
    except Exception:
        raise HTTPException(502, 'Could not finish Garmin sync. Your previous import is preserved. Try again later or reconnect.') from None
    finally:
        LOCK.release()


@app.get('/api/snapshot')
def snapshot():
    return read_snapshot()


@app.post('/api/garmin/disconnect')
def disconnect():
    busy()
    try:
        BRIDGE.disconnect()
        with db() as conn:
            conn.execute('DELETE FROM snapshot')
        return {'connected': False}
    finally:
        LOCK.release()


if (ROOT / 'dist' / 'assets').exists():
    app.mount('/assets', StaticFiles(directory=ROOT / 'dist' / 'assets'), name='assets')


@app.get('/')
def index():
    if not (ROOT / 'dist' / 'index.html').exists():
        raise HTTPException(503, 'Build the dashboard first: npm run build')
    return FileResponse(ROOT / 'dist' / 'index.html')
