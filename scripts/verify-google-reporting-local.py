"""Read-only real Google API verification through the actual Next route. Never logs credentials."""
import json, os, secrets, shutil, socket, subprocess, time
from pathlib import Path
import requests

port = 3106
with socket.socket() as sock:
    sock.bind(('127.0.0.1', port))
credential = Path.home() / 'Desktop' / 'LocalPro-Leonamai-Google-Setup' / 'localpro-service-account.json'
env = os.environ.copy()
monitor = secrets.token_urlsafe(48)
env.update({
    'GOOGLE_REPORTING_CREDENTIALS_JSON': credential.read_text(encoding='utf-8-sig'),
    'GOOGLE_REPORTING_GA4_PROPERTY_ID': '559398175',
    'GOOGLE_REPORTING_GSC_SITE_URL': 'sc-domain:localpro.lt',
    'GOOGLE_REPORTING_MONITOR_TOKEN': monitor,
    'NEXT_TELEMETRY_DISABLED': '1',
})
base = f'http://127.0.0.1:{port}'
server = subprocess.Popen([shutil.which('node'), 'node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', str(port)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError('Local Next process exited before readiness')
        try:
            r = requests.get(base + '/api/internal/analytics/health', timeout=4)
            if r.status_code == 401:
                break
        except requests.RequestException:
            pass
        time.sleep(0.4)
    else:
        raise RuntimeError('Local Next route not ready within 120 seconds')
    print('Actual Next health route: unauthenticated HTTP 401; no public report access', flush=True)
    r = requests.get(base + '/api/internal/analytics/health', headers={'Authorization': 'Bearer ' + monitor}, timeout=115)
    if r.status_code != 200:
        print('Authenticated report health HTTP', r.status_code, flush=True)
        try:
            body = r.json()
            print(json.dumps({'status': body.get('status'), 'sources': body.get('sources')}), flush=True)
        except ValueError:
            pass
        raise RuntimeError('Authenticated local reporting verification failed; raw body deliberately suppressed')
    result = r.json()
    assert result['status'] == 'success'
    assert set(result['sources']) == {'ga4', 'realtime', 'searchConsole', 'conversions', 'archiveFunnel'}
    assert all(s['status'] == 'success' for s in result['sources'].values())
    assert r.headers.get('Cache-Control') == 'private, no-store'
    print('Actual Next route + actual Google APIs:', json.dumps(result), flush=True)
    r = requests.get(base + '/api/admin/analytics', timeout=30)
    print('Unauthenticated admin reporting route HTTP', r.status_code, flush=True)
    assert r.status_code == 401
    print('READ-ONLY LOCAL RUNTIME VERIFICATION PASSED; production is not verified by this check', flush=True)
finally:
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(server.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        server.terminate()
