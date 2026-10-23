from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import subprocess,tempfile,os,urllib.request,time,socket,json
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='high-low-browser-') as tmp:
 sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
 url=f'http://127.0.0.1:{port}'
 env={**os.environ,'PORT':str(port),'PUBLIC_ORIGIN':url,'HIGHLOW_DB':tmp+'/rank.sqlite'}
 server=subprocess.Popen(['node','server/index.js'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  for i in range(50):
   try:
    urllib.request.urlopen(url,timeout=.3).close();break
   except Exception:time.sleep(.1)
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
   page=b.new_page(viewport={'width':390,'height':844},has_touch=True)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url)
   for w,h in [(390,844),(360,740),(320,568),(1366,768),(844,390)]:
    page.set_viewport_size({'width':w,'height':h})
    assert page.locator('#ranking').is_visible()
    
    if not page.evaluate('document.documentElement.scrollWidth <= innerWidth'):
     print(page.evaluate("[...document.querySelectorAll('*')].map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,50),rect:e.getBoundingClientRect().toJSON()})).filter(x=>x.rect.right>innerWidth||x.rect.left<0)"))
     page.screenshot(path=str(root/'artifacts/v1-overflow.png'))
     raise AssertionError((w,h))
    rect=page.locator('#play').bounding_box()
    assert rect['y']+rect['height']<=h,(w,h,rect)
   page.set_viewport_size({'width':390,'height':844})
   page.locator('#ranking').click()
   expect(page.locator('#rank-status')).to_contain_text('まだ記録')
   page.locator('#nickname').fill('Browser Tester');page.locator('#nickname-form button').click()
   expect(page.locator('#nickname')).to_have_value('Browser Tester')
   page.screenshot(path=str(root/'artifacts/v1-ranking-mobile.png'))
   page.locator('#rank-title').click()
   for difficulty in ['EASY','NORMAL','HARD']:
    page.locator('[data-difficulty="'+difficulty+'"]').click()
    page.locator('#play').click();page.wait_for_selector('#left:enabled',timeout=8000)
    assert page.locator('#equal').count()==(0 if difficulty=='EASY' else 1)
    assert page.locator('#online-mode').inner_text()=='オンライン記録対象'
    page.locator('#left').click();assert page.locator('#left').is_disabled()
    frozen=page.locator('#time').inner_text();page.wait_for_timeout(100);assert page.locator('#time').inner_text()==frozen
    page.wait_for_selector('#right:enabled');page.keyboard.press('ArrowRight');assert page.locator('#left').is_disabled()
    if difficulty=='NORMAL':
     page.wait_for_selector('#retry',timeout=34000)
     expect(page.locator('#online-result')).to_contain_text('記録を登録')
     page.locator('#result-ranking').click()
     expect(page.locator('#rank-rows tr')).to_have_count(1)
     assert 'Browser Tester' in page.locator('#rank-rows').inner_text()
     assert '1位' in page.locator('#rank-me').inner_text()
     page.screenshot(path=str(root/'artifacts/v1-ranking-record.png'))
     page.locator('#rank-period').select_option('all')
     expect(page.locator('#rank-rows tr')).to_have_count(1)
     page.locator('#rank-title').click()
    else:
     page.locator('#exit').click();assert '記録は保存されません' in page.locator('body').inner_text()
     page.locator('#retry').click();assert page.locator('#score').inner_text()=='0'
     page.locator('#exit').click();page.locator('#title').click()
   # Simulate unreachable API: leaderboard error is visible; game stays playable locally.
   page.route('**/api/ranking',lambda route:route.abort())
   page.locator('#ranking').click();expect(page.locator('#rank-status')).not_to_contain_text('読み込んでいます')
   page.locator('#rank-title').click();page.locator('#play').click();page.wait_for_selector('#left:enabled',timeout=8000)
   assert 'ランキング対象外' in page.locator('#online-mode').inner_text()
   assert not errors,errors
   print(json.dumps({'result':'PASS','sizes':5,'difficulties':3,'fullMatch':True,'rankingSavedAndRead':True,'networkFailureFallback':True,'errors':errors}))
   b.close()
 finally:
  server.terminate()
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:server.kill();server.wait()
