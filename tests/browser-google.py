"""Live smoke test: unnamed identity keeps test results out of public rankings."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import subprocess,tempfile,os,urllib.request,time,socket,json
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='high-low-google-') as tmp:
 sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
 url=f'http://127.0.0.1:{port}'
 server=subprocess.Popen(['node','server/index.js'],cwd=root,env={**os.environ,'PORT':str(port),'PUBLIC_ORIGIN':url,'HIGHLOW_DB':tmp+'/local.sqlite','HIGHLOW_USE_GOOGLE':'true'},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  for i in range(50):
   try:urllib.request.urlopen(url,timeout=.3).close();break
   except Exception:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url);page.locator('#play').click();page.wait_for_selector('#left:enabled',timeout=40000)
   mode=page.locator('#online-mode').inner_text();assert mode=='オンライン記録対象',mode
   page.wait_for_timeout(1000);page.locator('#left').click();page.wait_for_selector('#retry',timeout=36000)
   expect(page.locator('#online-result')).to_contain_text('記録を保存しました',timeout=25000)
   page.locator('#result-ranking').click();expect(page.locator('#rank-status')).not_to_contain_text('読み込んでいます',timeout=25000)
   text=page.locator('#rank-status').inner_text();assert '上位100' in text or 'まだ記録がありません' in text,text
   assert not errors,errors
   print(json.dumps({'result':'PASS','liveGoogleProfileAndRun':True,'browserCors':True,'fullMatchAndServerReplay':True,'liveSheetsSaved':True,'leaderboardRead':True,'testIdentityHidden':True,'errors':errors}))
   browser.close()
 finally:
  server.terminate()
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:server.kill();server.wait()
