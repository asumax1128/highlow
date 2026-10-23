from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
parts=[]
for p in ['dist/engine.js','server/ranking-core.js','apps-script/adapter.js']:
 s=(root/p).read_text()
 s=re.sub(r'^import .*?;\n','',s,flags=re.M)
 s=re.sub(r'\bexport ', '', s)
 parts.append('// Source: '+p+'\n'+s)
(root/'apps-script/Code.gs').write_text('\n'.join(parts))
