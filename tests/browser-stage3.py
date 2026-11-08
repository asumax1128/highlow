"""Stage 3 browser checks: settings screen (hide name, storage notice, transfer code UI), hidden names on the board,
banned-word message, and the Node/cookie mode where transfer codes are unavailable."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import subprocess, tempfile, os, urllib.request, time, socket, json

root = Path(__file__).resolve().parents[1]
chromium = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None)

with tempfile.TemporaryDirectory(prefix='high-low-stage3-') as tmp:
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
            page.goto(url)
            for w, h in [(390, 844), (320, 568)]:
                page.set_viewport_size({'width': w, 'height': h}); page.wait_for_timeout(80)
                r = page.locator('#play').bounding_box(); assert r['y'] + r['height'] <= h, ('PLAY still on screen', w, h)
            page.set_viewport_size({'width': 390, 'height': 844})

            # Banned word: refused with a Japanese reason.
            page.locator('#ranking').click()
            page.locator('#nickname').fill('しね'); page.locator('#nickname-form button').click()
            expect(page.locator('#name-status')).to_contain_text('使用できない言葉')
            page.locator('#nickname').fill('Shy Student'); page.locator('#nickname-form button').click()
            expect(page.locator('#name-status')).to_have_text('登録しました')

            # Settings from the ranking screen: storage notice, hide toggle; Node/cookie mode has no transfer code.
            page.locator('#rank-settings').click()
            expect(page.locator('#storage-notice')).to_contain_text('7日')
            expect(page.locator('#hide-name')).to_be_enabled()
            assert page.locator('#show-code').is_disabled() and page.locator('#restore-code').is_disabled()
            expect(page.locator('.settings')).to_contain_text('この環境では引き継ぎコードは利用できません')
            page.locator('#hide-name').check(); expect(page.locator('#hide-status')).to_contain_text('非表示にしました')
            page.locator('#settings-back').click(); expect(page.locator('#rank-title')).to_be_visible()

            # Play a run; the board shows the hidden player without a name but with rank and score.
            page.locator('#rank-title').click(); page.locator('[data-difficulty="EASY"]').click(); page.locator('#play').click()
            page.wait_for_selector('#left:enabled', timeout=8000); page.locator('#left').click()
            page.wait_for_selector('#retry', timeout=40000); expect(page.locator('#online-result')).to_contain_text('✓', timeout=10000)
            page.wait_for_timeout(16000)  # ranking boards are cached for 15 s
            page.locator('#result-ranking').click(); page.locator('#rank-difficulty').select_option('EASY'); page.locator('#rank-period').select_option('all')
            row = page.locator('#rank-rows tr').first; expect(row).to_contain_text('非公開プレイヤー')
            assert 'Shy Student' not in page.locator('#rank-rows').inner_text()
            assert 'is-hidden' in row.get_attribute('class') and '1' == row.locator('td').first.inner_text()

            # Title → settings link works; back returns to the title.
            page.locator('#rank-title').click(); page.locator('#settings').click(); expect(page.locator('#hide-name')).to_be_checked()
            page.locator('#settings-back').click(); expect(page.locator('#play')).to_be_visible()
            assert not errors, errors
            browser.close()

            # Apps Script mode (token): the code is shown and a wrong code is refused without changing the player.
            browser = p.chromium.launch(executable_path=chromium, headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            gas = browser.new_page(viewport={'width': 390, 'height': 844})
            state = {'token': 'tok-' + 'a' * 40}
            def fake(route):
                body = json.loads(route.request.post_data or '{}')
                if body.get('token') and body['token'] not in (state['token'], 'tok-' + 'b' * 40):
                    route.fulfill(content_type='application/json', body=json.dumps({'error': {'code': 'UNAUTHORIZED', 'message': 'x'}})); return
                token = body.get('token') or state['token']
                name = 'Second' if token.endswith('b' * 40) else None
                route.fulfill(content_type='application/json', body=json.dumps({'token': token, 'player': {'nickname': name, 'hidden': False}, 'registered': bool(name)}))
            gas.route('**/config.js*', lambda r: r.fulfill(content_type='text/javascript', body="window.HIGHLOW_RANKING_CONFIG={endpoint:'https://script.google.com/macros/s/test/exec',gas:true};"))
            gas.route('https://script.google.com/**', fake)
            gas.goto(url); gas.locator('#settings').click()
            gas.locator('#show-code').click(); expect(gas.locator('#code-text')).to_have_value(state['token'])
            gas.locator('#restore-code').fill('wrong-code'); gas.locator('#restore-button').click(); gas.locator('#restore-button').click()
            expect(gas.locator('#code-status')).to_contain_text('正しくありません')
            assert gas.evaluate("localStorage.getItem('high-low:ranking-token:v1')") == state['token']
            gas.locator('#restore-code').fill('tok-' + 'b' * 40); gas.locator('#restore-button').click(); gas.locator('#restore-button').click()
            expect(gas.locator('#code-status')).to_contain_text('復元しました：Second')
            assert gas.evaluate("localStorage.getItem('high-low:ranking-token:v1')") == 'tok-' + 'b' * 40
            browser.close()
            print(json.dumps({'result': 'PASS', 'errors': errors}))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill(); server.wait()
