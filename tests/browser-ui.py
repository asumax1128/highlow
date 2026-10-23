"""Visual/layout QA for the pop theme and semantic math typesetting."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import subprocess,tempfile,os,urllib.request,time,socket,json
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='high-low-ui-') as tmp:
 sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close();url=f'http://127.0.0.1:{port}'
 server=subprocess.Popen(['node','server/index.js'],cwd=root,env={**os.environ,'PORT':str(port),'PUBLIC_ORIGIN':url,'HIGHLOW_DB':tmp+'/test.sqlite'},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  for _ in range(50):
   try:urllib.request.urlopen(url,timeout=.3).close();break
   except Exception:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url);page.evaluate('document.fonts.ready')
   for size in [(390,844),(360,740),(320,568),(1366,768),(844,390)]:
    w,h=size;page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(80)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),('title overflow',size)
    r=page.locator('#play').bounding_box();assert r['y']+r['height']<=h,('PLAY outside screen',size,r)
   page.set_viewport_size({'width':390,'height':844})
   for d in ['EASY','NORMAL','HARD']:
    page.locator('[data-difficulty="'+d+'"]').click()
    assert page.locator('body').get_attribute('data-difficulty')==d.lower()
    page.screenshot(path=str(root/f'artifacts/pop-title-{d.lower()}.png'))
    page.locator('#play').click();page.wait_for_selector('#left:enabled',timeout=8000)
    expect(page.locator('#lf math')).to_have_count(1);expect(page.locator('#rf math')).to_have_count(1)
    for w,h in [(390,844),(320,568),(844,390)]:
     page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(80)
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),('game overflow',d,w,h)
     r=page.locator('#right').bounding_box();assert r['y']+r['height']<=h,('card outside screen',d,w,h,r)
     if d!='EASY':
      r=page.locator('#equal').bounding_box();assert r['y']+r['height']<=h,('EQUAL outside screen',d,w,h,r)
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(root/f'artifacts/pop-play-{d.lower()}.png'))
    page.locator('#exit').click();page.locator('#title').click()
   # Every shipped HARD expression: MathML, original accessible text, no clipping.
   for w,h in [(390,844),(320,568),(844,390)]:
    page.set_viewport_size({'width':w,'height':h})
    metrics=page.evaluate('''async()=>{const {renderFormula,fitFormula}=await import('/formula.js');const {HARD_POOL}=await import('/engine.js');document.querySelector('#app').innerHTML='<header>数式表示の確認</header><section id="gallery" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:20px"></section>';for(const entry of HARD_POOL){const card=document.createElement('div');card.className='card';card.style.minHeight='155px';const span=document.createElement('span');span.className='formula';card.append(span);document.querySelector('#gallery').append(card);renderFormula(span,entry.text)}await document.fonts.ready;document.querySelectorAll('.formula').forEach(fitFormula);return [...document.querySelectorAll('.formula')].map(e=>({text:e.dataset.expression,label:e.firstChild.getAttribute('aria-label'),width:e.clientWidth,mathWidth:e.firstChild.getBoundingClientRect().width,font:getComputedStyle(e).fontFamily}))}''')
    for m in metrics:
     assert m['text']==m['label'],m
     assert m['mathWidth']<=m['width']+1,('formula clipping',w,m)
     assert 'HighLow Math' in m['font'],m
    assert page.evaluate('document.fonts.check(\'24px "HighLow Math"\')')
    assert page.locator('mfrac').count()>=3
    assert page.locator('msqrt').count()>=5
    assert page.locator('msub').count()==2
    assert page.locator('msup').count()>=5
    if w==390:page.screenshot(path=str(root/'artifacts/pop-math-gallery.png'),full_page=True)
   assert not errors,errors
   print(json.dumps({'result':'PASS','sizes':5,'themes':3,'hardExpressions':30,'mathFontLoaded':True,'clipping':False,'errors':errors}))
   browser.close()
 finally:
  server.terminate()
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:server.kill();server.wait()
