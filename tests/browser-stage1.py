"""Stage 1 (client-only audit fixes) browser checks against the local SQLite server.

Covers: press state on pointerdown (and its release on cancel), answer feedback at 0 points (no "−100"),
the separate answer note, diffed DOM writes, two-step exit, locked results buttons, rAF error boundary,
connect wait/cancel with generation guard, Japanese network errors, landscape fit, hover:none key hints,
last-5-seconds timer, and failed submissions surviving screen changes and being resent from another screen.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import subprocess, tempfile, os, urllib.request, time, socket, json, re

root = Path(__file__).resolve().parents[1]
chromium = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None)


def value(label):
    a, op, b = re.fullmatch(r'(\d+) (.) (\d+)', label).groups()
    a, b = int(a), int(b)
    return {'+': a + b, '−': a - b, '×': a * b, '÷': a / b}[op]


def answer_of(page):
    left = value(page.locator('#lf math').get_attribute('aria-label'))
    right = value(page.locator('#rf math').get_attribute('aria-label'))
    return 'EQUAL' if left == right else 'LEFT' if left > right else 'RIGHT'


def actions(page):
    return page.evaluate('document.querySelectorAll(".results [data-lock]").length')


with tempfile.TemporaryDirectory(prefix='high-low-stage1-') as tmp:
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
            sent = []; page.on('request', lambda r: sent.append(json.loads(r.post_data)['action']) if r.url.endswith('/api/ranking') and r.post_data else None)
            page.goto(url)

            # Title prefetches the ranking profile.
            expect(page.locator('#play')).to_be_visible(); page.wait_for_timeout(400)
            assert 'profile' in sent, sent

            # Sound toggle persists per viewer.
            page.locator('#sound-toggle').click(); expect(page.locator('#sound-toggle')).to_have_attribute('aria-pressed', 'false')
            page.reload(); expect(page.locator('#sound-toggle')).to_have_text('♪ OFF')
            page.locator('#sound-toggle').click(); expect(page.locator('#sound-toggle')).to_have_attribute('aria-pressed', 'true')

            # --- Press state on pointerdown; released on pointercancel / touchcancel.
            page.locator('[data-difficulty="NORMAL"]').click(); page.locator('#play').click()
            page.wait_for_selector('#left:enabled', timeout=8000)
            pressed = page.evaluate('''()=>{const b=document.querySelector('#left');const out=[];
              b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0,pointerType:'touch'}));out.push(b.classList.contains('is-pressed'));
              b.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,isPrimary:true,pointerType:'touch'}));out.push(b.classList.contains('is-pressed'));
              b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0,pointerType:'touch'}));
              b.dispatchEvent(new Event('touchcancel',{bubbles:true}));out.push(b.classList.contains('is-pressed'));return out}''')
            assert pressed == [True, False, False], pressed

            # --- A miss at 0 points, made with a real press/release: press state, chosen-card feedback, ±0 everywhere.
            correct = answer_of(page); wrong = 'RIGHT' if correct == 'LEFT' else 'LEFT'
            box = page.locator('#' + wrong.lower()).bounding_box()
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); page.mouse.down()
            assert page.evaluate(f'document.querySelector("#{wrong.lower()}").classList.contains("is-pressed")')
            assert page.evaluate(f'getComputedStyle(document.querySelector("#{wrong.lower()}")).translate') == '0px 4px'
            assert page.locator('#score').inner_text() == '0'
            page.mouse.up()
            state = page.evaluate(f'''()=>({{pressed:document.querySelector('#{wrong.lower()}').classList.contains('is-pressed'),
              bad:document.querySelector('#{wrong.lower()}').classList.contains('pick-bad'),
              answer:document.querySelector('#{correct.lower()}').classList.contains('is-answer'),
              versus:document.querySelector('#versus').textContent,feedback:document.querySelector('#feedback').textContent,
              float:document.querySelector('.score-float')?.textContent,note:document.querySelector('#answer-note').textContent,
              noteShown:document.querySelector('#answer-note').classList.contains('show'),score:document.querySelector('#score').textContent,
              disabled:document.querySelector('#left').disabled}})''')
            assert state['pressed'] is False and state['bad'] and state['answer'] and state['disabled'], state
            assert state['versus'] == {'LEFT': '＞', 'RIGHT': '＜', 'EQUAL': '＝'}[correct], state
            assert '±0' in state['feedback'] and '−100' not in state['feedback'] and state['float'] == '±0', state
            assert state['score'] == '0' and state['noteShown'] and state['note'].startswith('正解：LEFT'), state
            # Feedback lock ends (500 ms after a miss) but the answer note stays for about a second, without moving the layout.
            zone = page.locator('.feedback-zone').bounding_box()
            page.wait_for_timeout(700)  # miss lock 500 ms + 150 ms minimum answer time (engine 0.2)
            after = page.evaluate('''({feedback:document.querySelector('#feedback').textContent,versus:document.querySelector('#versus').textContent,
              note:document.querySelector('#answer-note').classList.contains('show'),enabled:!document.querySelector('#left').disabled})''')
            assert after == {'feedback': '', 'versus': 'VS', 'note': True, 'enabled': True}, after
            assert page.locator('.feedback-zone').bounding_box() == zone
            page.wait_for_timeout(800)
            assert not page.evaluate("document.querySelector('#answer-note').classList.contains('show')")

            # --- Render writes only what changed (the timer bar transform is the per-frame exception).
            writes = page.evaluate('''()=>new Promise(done=>{let bar=0,other=0;const mo=new MutationObserver(list=>{for(const m of list){if(m.target.id==='bar')bar++;else other++}});
              mo.observe(document.querySelector('#app'),{subtree:true,childList:true,attributes:true,characterData:true});
              setTimeout(()=>{mo.disconnect();done({bar,other})},500)})''')
            assert writes['bar'] > 5 and writes['other'] <= 12, writes

            # --- Two-step exit, then locked/fading results with RETRY largest and lowest.
            page.locator('#exit').click(); expect(page.locator('#exit')).to_have_text('もう一度押すと中断')
            assert page.locator('#left').count() == 1
            page.locator('#exit').click(); expect(page.locator('.interrupted')).to_contain_text('記録は保存されません')
            assert page.locator('#retry').is_disabled() and page.locator('#title').is_disabled()
            page.wait_for_timeout(600); assert page.locator('#retry').is_enabled()
            r, t, k = (page.locator(s).bounding_box() for s in ['#retry', '#title', '#result-ranking'])
            assert r['height'] > t['height'] and r['y'] > t['y'] and r['y'] > k['y'], (r, t, k)

            # --- rAF error boundary: an exception mid-game interrupts without saving and without a page error.
            plays = page.evaluate("JSON.parse(localStorage.getItem('high-low:v1')||'{\"records\":{}}').records.NORMAL?.plays||0")
            page.locator('#retry').click(); page.wait_for_selector('#left:enabled', timeout=8000)
            page.evaluate("document.querySelector('#bar').remove()")
            expect(page.locator('.interrupted')).to_contain_text('エラーが発生したため中断', timeout=3000)
            assert page.evaluate("JSON.parse(localStorage.getItem('high-low:v1')||'{\"records\":{}}').records.NORMAL?.plays||0") == plays

            # --- Connect wait: buttons after 2 s, cancel, and late responses never start a game.
            held = []; hold = {'on': True}

            def gate(route):
                body = json.loads(route.request.post_data or '{}')
                if hold['on'] and body.get('action') == 'start':
                    held.append(route)
                else:
                    route.continue_()
            page.route('**/api/ranking', gate)
            page.wait_for_timeout(600); page.locator('#title').click()
            page.locator('[data-difficulty="EASY"]').click()  # different difficulty: the prefetched NORMAL run is discarded
            page.locator('#play').click(); page.wait_for_timeout(1000)
            assert page.locator('#connect-actions').is_hidden()
            page.wait_for_timeout(1300); expect(page.locator('#connect-actions')).to_be_visible()
            page.locator('#connect-back').click(); expect(page.locator('#play')).to_be_visible()
            for route in held: route.continue_()
            held.clear(); page.wait_for_timeout(1200)
            assert page.locator('#play').is_visible() and page.locator('#left').count() == 0
            page.locator('#play').click(); page.wait_for_timeout(2200)
            page.locator('#play-offline').click(); page.wait_for_selector('#left:enabled', timeout=8000)
            expect(page.locator('#online-mode')).to_contain_text('ランキングなしで遊んでいます')
            score_before = page.locator('#time').inner_text()
            for route in held: route.continue_()
            held.clear(); hold['on'] = False; page.wait_for_timeout(1000)
            expect(page.locator('#online-mode')).to_contain_text('ランキングなしで遊んでいます')
            assert page.locator('#time').inner_text() != score_before  # still the same running game
            page.locator('#exit').click(); page.locator('#exit').click()
            page.unroute('**/api/ranking')

            # --- Network failure wording.
            page.route('**/api/ranking', lambda route: route.abort())
            page.wait_for_timeout(600); page.locator('#title').click(); page.locator('#ranking').click()
            expect(page.locator('#rank-status')).to_contain_text('通信できませんでした')
            assert 'Failed' not in page.locator('#rank-status').inner_text()
            page.locator('#rank-title').click(); page.locator('[data-difficulty="HARD"]').click()  # discard the prefetched run
            page.locator('#play').click(); page.wait_for_selector('#left:enabled', timeout=8000)
            expect(page.locator('#online-mode')).to_contain_text('通信できませんでした')
            expect(page.locator('#online-mode')).to_contain_text('ランキング対象外')

            # --- Landscape phones: EQUAL >= 44px, feedback row and connection state on screen.
            page.locator('#exit').click(); page.locator('#exit').click(); page.wait_for_timeout(600)
            page.locator('#title').click(); page.locator('[data-difficulty="NORMAL"]').click(); page.locator('#play').click()
            page.wait_for_selector('#left:enabled', timeout=8000)
            for w, h in [(844, 390), (844, 342), (667, 320)]:
                page.set_viewport_size({'width': w, 'height': h}); page.wait_for_timeout(120)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), ('overflow', w, h)
                eq, zone, mode, right = (page.locator(s).bounding_box() for s in ['#equal', '.feedback-zone', '#online-mode', '#right'])
                assert eq['height'] >= 44, ('EQUAL height', w, h, eq)
                assert zone['y'] + zone['height'] <= h and eq['y'] + eq['height'] <= h and right['y'] + right['height'] <= h, ('landscape fit', w, h, eq, zone)
                assert mode and mode['height'] > 0, ('connection state hidden', w, h)
            page.set_viewport_size({'width': 390, 'height': 844})
            page.locator('#exit').click(); page.locator('#exit').click(); page.wait_for_timeout(600)
            page.unroute('**/api/ranking')

            # --- Full online game: last-5-seconds timer, failed submit survives screens, resend from another screen.
            def drop_submit(route):
                if json.loads(route.request.post_data or '{}').get('action') == 'submit':
                    route.abort()
                else:
                    route.continue_()
            # The quicker engine-0.2 flow makes this script exceed 6 starts/min for one player; continue as a fresh player.
            page.context.clear_cookies(); page.reload(); expect(page.locator('#play')).to_be_visible()
            page.route('**/api/ranking', drop_submit)
            page.locator('#play').click(); page.wait_for_selector('#left:enabled', timeout=8000)
            expect(page.locator('#online-mode')).to_have_text('オンライン記録対象')
            for _ in range(3):
                page.wait_for_selector('#left:enabled'); page.locator('#' + answer_of(page).lower()).click()
            page.wait_for_selector('.game.hurry', timeout=30000)
            assert page.evaluate("getComputedStyle(document.querySelector('#time')).color") == 'rgb(210, 58, 82)'
            page.wait_for_selector('.pulse', timeout=2000)
            starts_before = sent.count('start')
            page.wait_for_selector('#retry', timeout=10000)
            expect(page.locator('#online-result')).to_contain_text('通信できませんでした')
            expect(page.locator('#online-result')).to_contain_text('秒後に自動で再送します')  # engine 0.2: 3 automatic resends (1 s / 3 s / 3 s)
            expect(page.locator('#online-result button')).to_have_text('再送信', timeout=20000)
            assert sent.count('submit') >= 4, sent.count('submit')
            assert sent.count('start') == starts_before + 1  # next run prefetched
            page.wait_for_timeout(300); page.locator('#title').click()
            expect(page.locator('#outbox')).to_be_visible(); expect(page.locator('#outbox')).to_contain_text('NORMAL')
            page.locator('#ranking').click(); expect(page.locator('#outbox')).to_be_visible()
            expect(page.locator('#outbox button')).to_have_text('再送信')
            page.unroute('**/api/ranking')
            page.locator('#outbox button').click(); expect(page.locator('#outbox')).to_be_hidden(timeout=5000)
            assert sent.count('submit') >= 2

            # Nickname registration notice and maxlength.
            assert page.locator('#nickname').get_attribute('maxlength') == '16'
            page.locator('#nickname').fill('Stage One'); page.locator('#nickname-form button').click()
            expect(page.locator('#name-status')).to_have_text('登録しました')
            page.wait_for_timeout(1700); expect(page.locator('#name-status')).to_have_text('')
            assert not errors, errors
            browser.close()

            # --- Touch devices (hover:none) hide keyboard hints.
            browser = p.chromium.launch(executable_path=chromium, headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            phone = browser.new_context(**p.devices['iPhone 13']).new_page()
            phone.goto(url); phone.locator('#play').click(); phone.wait_for_selector('#left:enabled', timeout=8000)
            assert phone.locator('#left kbd').is_hidden() and phone.locator('#equal small').is_hidden()
            assert phone.evaluate("getComputedStyle(document.body).touchAction") == 'manipulation'
            assert phone.evaluate("getComputedStyle(document.querySelector('.game')).userSelect") == 'none'
            browser.close()
            print(json.dumps({'result': 'PASS', 'errors': errors}))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill(); server.wait()
