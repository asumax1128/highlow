"""Smoke test for the verified GitHub Pages test deployment; no scored result is posted."""
from playwright.sync_api import sync_playwright,expect
import json
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 # Managed proxy CA exception applies only to the QA browser, not product TLS.
 page=browser.new_page(viewport={'width':390,'height':844},has_touch=True,ignore_https_errors=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('https://asumax1128.github.io/highlow/',wait_until='networkidle')
 page.locator('#ranking').click();expect(page.locator('#rank-status')).not_to_contain_text('読み込んでいます',timeout=35000)
 text=page.locator('#rank-status').inner_text();assert '上位100' in text or 'まだ記録がありません' in text,text
 page.screenshot(path='/workspace/sites/high-low/artifacts/published-ranking-mobile.png')
 page.locator('#rank-title').click();page.locator('#play').click();page.wait_for_selector('#left:enabled',timeout=35000)
 assert page.locator('#online-mode').inner_text()=='オンライン記録対象'
 page.locator('#left').click();assert page.locator('#left').is_disabled()
 page.screenshot(path='/workspace/sites/high-low/artifacts/published-play-mobile.png')
 page.locator('#exit').click();expect(page.locator('.interrupted')).to_be_visible()
 assert not errors,errors
 print(json.dumps({'publishedPage':'PASS','liveGoogleRanking':'PASS','onlinePlay':'PASS','errors':errors}))
 browser.close()
