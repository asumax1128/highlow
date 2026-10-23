from pathlib import Path
import re,zipfile
root=Path(__file__).resolve().parents[1]
parts=[]
for name in ['engine.js','storage.js','ranking-client.js','formula.js','app.js']:
 s=(root/'dist'/name).read_text()
 s=re.sub(r'^import .*?;\n','',s,flags=re.M)
 s=re.sub(r'\bexport ', '', s)
 parts.append(s)
html=(root/'dist/index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+(root/'dist/style.css').read_text()+'</style>').replace('<script src="config.js"></script>','<script>'+(root/'dist/config.js').read_text()+'</script>').replace('<script type="module" src="app.js"></script>','<script type="module">'+'\n'.join(parts)+'</script>')
(root/'artifacts').mkdir(exist_ok=True)
(root/'artifacts/HIGH-LOW-v1.0-rc.html').write_text(html)
with zipfile.ZipFile(root/'artifacts/HIGH-LOW-v1.0-rc.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for folder in ['dist','server','apps-script','tests','scripts','docs']:
  for p in (root/folder).rglob('*'):
   if p.is_file() and '__pycache__' not in str(p):archive.write(p,p.relative_to(root))
 for name in ['package.json','README.md','README-v1.md','REPORT-v1.md','FONT-LICENSE.txt','Dockerfile','.env.example']:
  if (root/name).exists():archive.write(root/name,name)
 archive.write(root/'artifacts/HIGH-LOW-v1.0-rc.html','HIGH-LOW-v1.0-rc.html')
