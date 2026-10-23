from pathlib import Path
import re,zipfile
root=Path(__file__).resolve().parents[1]
css=(root/'dist/style.css').read_text()
css=re.sub(r"@import url\([^;]+;\n",'',css)
engine=re.sub(r'\bexport ', '', (root/'dist/engine.js').read_text())
storage=re.sub(r'\bexport ', '', (root/'dist/storage.js').read_text())
app=re.sub(r"import .*?;\n",'',(root/'dist/app.js').read_text())
html=(root/'dist/index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>').replace('<script type="module" src="app.js"></script>','<script type="module">'+engine+'\n'+storage+'\n'+app+'</script>')
(root/'artifacts/HIGH-LOW-v0.1.html').write_text(html)
with zipfile.ZipFile(root/'artifacts/HIGH-LOW-v0.1.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['dist','tests','scripts']:
  for p in (root/folder).glob('*'):
   if p.is_file():z.write(p,p.relative_to(root))
 for name in ['package.json','README.md','REPORT.md','FONT-LICENSE.txt']:
  if (root/name).exists():z.write(root/name,name)
 z.write(root/'artifacts/HIGH-LOW-v0.1.html','HIGH-LOW-v0.1.html')
