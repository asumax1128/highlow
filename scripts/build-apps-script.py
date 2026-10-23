from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
parts=[(root/'apps-script/exact-integers.js').read_text()]
for p in ['dist/engine.js','server/ranking-core.js','apps-script/adapter.js']:
 s=(root/p).read_text()
 s=re.sub(r'^import .*?;\n','',s,flags=re.M)
 s=re.sub(r'\bexport ', '', s)
 if p=='dist/engine.js':
  s,count=re.subn(r'^function compare\(a,b\)\{[^\n]+\}$',"function compare(a,b){return hlCompareValues(a,b)}",s,flags=re.M)
  if count!=1:raise RuntimeError('Review Apps Script exact comparison adaptation')
 if p=='server/ranking-core.js':
  s,count=re.subn(r'^function compareRecords\(a,b\)\{[^\n]+\}$',"function compareRecords(a,b){return hlCompareRecords(a,b)}",s,flags=re.M)
  if count!=1:raise RuntimeError('Review Apps Script rank comparison adaptation')
 parts.append('// Source: '+p+'\n'+s)
output='\n'.join(parts)
if re.search(r'\b\d+n\b',output):raise RuntimeError('Unsupported BigInt literal in Apps Script output')
(root/'apps-script/Code.gs').write_text(output)
