"""Extract permitted supplemental general powers from the user-provided local books.
No manual PDFs are copied into the application. Review the candidate references visually.
"""
from pathlib import Path
from pypdf import PdfReader
import re,json,unicodedata,sys
root=Path(__file__).resolve().parents[2]
clean=lambda s:re.sub(r'\s+',' ',re.sub(r'(?<=[^\W\d_])\s*-\s+(?=[^\W\d_])','',s)).strip()
key=lambda s:re.sub('[^a-z0-9]','',unicodedata.normalize('NFD',s.lower()))
slug=lambda s:re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFD',s.lower()).encode('ascii','ignore').decode()).strip('-')
pdf=PdfReader(Path.home()/'Downloads/T20 - Heróis de Arton.pdf')
records=[];active=None;category='combate'
def flush():
 global active
 if active:
  active['description']=clean(active['description'])
  if active['description']:records.append(active)
 active=None
for index in range(79,97):
 if index in [82,86]:continue
 rows=[]
 def visit(text,cm,tm,font,size):
  if text.strip() and font and tm[5]>45 and not(index==95 and tm[5]<200):rows.append({'text':text.strip(),'font':str(font.get('/BaseFont','')),'x':tm[4],'y':tm[5]})
 pdf.pages[index].extract_text(visitor_text=visit)
 rows=sorted(enumerate(rows),key=lambda p:(int(p[1]['x']>=280),-round(p[1]['y'],1),p[0]))
 for _,r in rows:
  t=r['text'];font=r['font'];k=key(t)
  if t.startswith('Tabela ') or k in ['poderprerequisitos','beneficiocd']:continue
  if 'Tormenta20' in font:
   if k in ['poderesdecombate','poderesdedestino','poderesdemagia','poderesdatormenta','poderesderaca','poderesdegrupo']:
    flush();category={'poderesdecombate':'combate','poderesdedestino':'destino','poderesdemagia':'magia','poderesdatormenta':'tormenta','poderesderaca':'racial','poderesdegrupo':'grupo'}[k];continue
   if k in ['novospoderesgerais','p'] or k.isdigit() or 'tabelasparapersonagens' in k:flush();continue
   if index>=97:continue
   if active and not active['description']:
    active['name']+=' '+t;active['id']='heroes:ability:'+slug(active['name']);continue
   flush();active={'id':'heroes:ability:'+slug(t),'kind':'ability','name':t,'category':'general','subcategory':category,'owner':'','sourceId':'heroes','page':index-1,'pdfPage':index+1,'description':'','implementation':'text-only'}
  elif 'SourceSans' in font:
   if active and category=='racial' and not active['description'] and t not in ['Várias','Varios'] and len(t)<120:
    active.setdefault('requiredRaces',[]).extend([v.strip() for v in t.split(',') if v.strip()])
  elif active and 'Spirals' not in font:active['description']+=' '+t
flush()
# Separate racial eligibility and metamagic labels from the printed heading.
races=[o['name'] for o in json.loads((root/'src/shared/data/t20-character-options.json').read_text(encoding='utf8'))['entries'] if o['kind']=='race']+['Várias','Naidora']
for r in records:
 r['name']=clean(r['name']).replace('Catafr actário','Catafractário').replace('Contr a-Ataque','Contra-Ataque').replace('DA MÃO LESTA','da Mão Lesta').replace('ATERRORIZANTE','Aterrorizante')
 if r['name'].endswith(' Aprimoramento'):r['name']=r['name'].removesuffix(' Aprimoramento').strip()
 if r['subcategory']=='racial':
  parts=[(m.start(),m.group()) for race in races for m in re.finditer(r'(?<= )'+re.escape(race)+r'(?=,| |$)',r['name'],re.I)]
  if parts:
   pos=min(p[0] for p in parts);requirement=r['name'][pos:];r['name']=r['name'][:pos].strip()
   r['requiredRaces']=[name for name in races if name!='Várias' and re.search(r'(?<![\w-])'+re.escape(name)+r'(?![\w-])',requirement,re.I)]
   r['description']+=' Raças permitidas: '+requirement+'.'
 r['id']='heroes:ability:'+slug(r['name'])
# The adjacent data table belongs to this power, not to the next heading.
meditation=next(r for r in records if key(r['name'])=='meditacaoautoafirmativa')
meditation['description']=meditation['description'].replace('Benefício CD','Benefícios e CDs: +1 em ataques (15); +2 em ataques (20); +3 em ataques (25); +2 na Defesa (20); +5 em resistências (20); treinamento em uma perícia (17); usar um poder cujos pré-requisitos cumpra (22).')
# Mechanical marvels use bullet names and are racial abilities, not unrestricted powers.
threats=PdfReader(Path.home()/'Downloads/T20 - Ameaças de Arton.pdf')
for index in [161,162]:
 text=clean(threats.pages[index].extract_text())
 for match in re.finditer(r'•\s+([^•]+)',text):
  block=match[1];name,sep,description=block.partition('.')
  if name not in ['Adaptação Elemental','Arma Acoplada','Arma Elemental','Auxílio de Mira','Caminho da Perfeição','Canalizar Reparos','Canhão Energético','Dínamo de Mana','Pernas Aprimoradas','Reservatório Alquímico']:continue
  description=re.split(r'\(Continua|Nezumi Ninja',description)[0].strip()
  records.append({'id':'threats:ability:'+slug(name)+':mashin','kind':'ability','name':name,'category':'race','subcategory':'maravilha','owner':'Mashin','sourceId':'threats','page':index-1,'pdfPage':index+1,'description':description,'implementation':'text-only'})
assert len({r['id'] for r in records})==len(records)
(root/'src/shared/data/t20-benefit-abilities.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
print(len(records),'supplemental references')
