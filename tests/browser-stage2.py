"""Engine 0.2 browser checks: version mismatch stops the start, 3-2-1-GO countdown (2.0 s first / 1.1 s retry),
buttons stay disabled for the first 150 ms of each question, versioned assets, and a ranked run submits with finalElapsed."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import subprocess, tempfile, os, urllib.request, time, socket, json

root = Path(__file__).resolve().parents[1]
chromium = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None)

with tempfile.TemporaryDirectory(prefix='high-low-stage2-') as tmp:
    sock = socket.socket(); sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]; sock.close()
    url = f'http://127.0.0.1:{port}'
    server = subprocess.Popen(['node', 'server/index.js'], cwd=root,
                              env={**os.environ, 'PORT': str(port), 'PUBLIC_ORIGIN': url, 'HIGHLOW_DB': tmp + '/rank.sqlite'},
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(url, timeout=.3).close(); break
            except Exception:
                time.sleep(.1)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=chromium, headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
            errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
            assets = []; page.on('request', lambda r: assets.append(r.url.split('/')[-1]))
            bodies = []; page.on('request', lambda r: bodies.append(json.loads(r.post_data)) if r.url.endswith('/api/ranking') and r.post_data else None)
            page.goto(url); expect(page.locator('#play')).to_be_visible()
            for name in ['style.css?v=0.2', 'config.js?v=0.2', 'app.js?v=0.2', 'engine.js?v=0.2', 'ranking-client.js?v=0.2']:
                assert name in assets, (name, assets)

            # --- Version mismatch: the start is stopped with a reload prompt, no game begins.
            def stale(route):
                body = json.loads(route.request.post_data or '{}')
                if body.get('action') == 'start':
                    route.fulfill(status=409, content_type='application/json', body=json.dumps({'error': {'code': 'ENGINE_VERSION', 'message': 'ゲームが更新されました。ページを再読み込みしてください。'}}))
                else:
                    route.continue_()
            page.route('**/api/ranking', stale)
            page.locator('#play').click()
            expect(page.locator('#reload-note')).to_contain_text('再読み込み')
            page.wait_for_timeout(2600)
            assert page.locator('#left').count() == 0 and page.locator('#countdown').count() == 0
            expect(page.locator('#reload-page')).to_be_visible()
            page.locator('#reload-back').click(); expect(page.locator('#play')).to_be_visible()
            page.unroute('**/api/ranking')

            # --- First play: 3-2-1-GO over 2.0 s, start carries engineVersion + countdown 'first'.
            labels = []
            page.locator('#play').click(); page.wait_for_selector('#countdown b')
            t0 = time.time()
            while time.time() - t0 < 3:
                if page.locator('#left:enabled').count():
                    break
                text = page.locator('#countdown b').inner_text()
                if not labels or labels[-1] != text:
                    labels.append(text)
                page.wait_for_timeout(40)
            first_ms = (time.time() - t0) * 1000
            assert labels[:4] == ['3', '2', '1', 'GO!'], labels
            assert 1700 <= first_ms <= 2700, first_ms
            start = [b for b in bodies if b['action'] == 'start'][-1]['data']
            assert start['countdown'] == 'first' and start['engineVersion'] == 'high-low-0.2', start

            # --- Buttons stay disabled for the first 150 ms of a question.
            page.wait_for_selector('#left:enabled')
            page.locator('#left').click()
            seen = page.evaluate('''()=>new Promise(done=>{const out=[];const b=document.querySelector('#left');let t0=null;(function f(){
              if(!b.isConnected)return done(out);const s=document.querySelector('#versus').textContent==='VS';
              if(s&&t0===null)t0=performance.now();if(t0!==null)out.push([Math.round(performance.now()-t0),b.disabled]);
              if(t0!==null&&performance.now()-t0>260)return done(out);requestAnimationFrame(f)})()})''')
            early = [d for t, d in seen if t < 120]; late = [d for t, d in seen if t > 200]
            assert early and all(early) and late and not any(late), seen

            # --- RETRY uses the 1.1 s countdown (prefetched runs are requested as 'retry').
            page.locator('#exit').click(); page.locator('#exit').click(); page.wait_for_timeout(600)
            page.locator('#retry').click(); page.wait_for_selector('#countdown b')
            t0 = time.time(); page.wait_for_selector('#left:enabled', timeout=4000); retry_ms = (time.time() - t0) * 1000
            assert retry_ms < first_ms - 400 and retry_ms <= 1700, (retry_ms, first_ms)
            assert any(b['action'] == 'start' and b['data']['countdown'] == 'retry' for b in bodies)

            # --- A full ranked run submits finalElapsed and is accepted by the 0.2 server.
            page.locator('#exit').click(); page.locator('#exit').click(); page.wait_for_timeout(600)
            page.context.clear_cookies(); page.reload(); expect(page.locator('#play')).to_be_visible()
            page.locator('#play').click(); page.wait_for_selector('#left:enabled', timeout=8000)
            expect(page.locator('#online-mode')).to_have_text('オンライン記録対象')
            page.locator('#right').click()
            page.wait_for_selector('#retry', timeout=40000)
            expect(page.locator('#online-result')).to_contain_text('✓', timeout=10000)
            submit = [b for b in bodies if b['action'] == 'submit'][-1]['data']
            total = sum(a['elapsed'] for a in submit['answers']) + submit['finalElapsed']
            assert abs(total - 30000) < 5, total
            assert not errors, errors
            browser.close()
            print(json.dumps({'result': 'PASS', 'countdownLabels': labels[:4], 'firstMs': round(first_ms), 'retryMs': round(retry_ms), 'errors': errors}))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill(); server.wait()
