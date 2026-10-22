import re,json,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
text=(root/'seed/source.txt').read_text()
items=[]; author=''; mode='book'; section='Bengali Literature'
personal=['Ikigai','Atomic Habits','Thinking, Fast and Slow','The Art of Thinking Clearly','Outliers','The 7 Habits of Highly Effective People','The Power of Now','Man’s Search for Meaning']
poems=['অগ্নিবীণা','সাম্যবাদী','নকশী কাঁথার মাঠ','রূপসী বাংলা']
for line in text.splitlines():
 line=line.strip()
 if line.startswith('🎬'): mode='movie';section='Cinema';author='';continue
 if line.startswith('📺'): mode='series';section='Television';author='';continue
 if line.startswith('🔶'): mode='poem';section='Poetry';author='';continue
 if line.startswith('🔷'):
  a=line.removeprefix('🔷').strip()
  if a=='মুক্তিযুদ্ধ ও সামসময়িক': section='Liberation War & Bangladesh';author=''
  else:
   author=a
   if a=='George Orwell':section='World Literature'
  continue
 if not line.startswith(('▫️','🔹')):continue
 raw=re.sub(r'^(?:▫️|🔹)\s*','',line).strip(); title=raw;creator=author;year=None;language='বাংলা' if re.search('[\u0980-\u09ff]',raw) else 'English'; typ=mode;cat='Books & Literature' if mode in ['book','poem'] else 'Movies' if mode=='movie' else 'TV Series';sub=section;review=''
 if mode in ['book','poem']:
  parts=re.split(r'\s+[–-]\s*',raw,maxsplit=1)
  if len(parts)==2:title,creator=parts
  if title in personal:sub='Personal Development'
  if title in poems:typ='poem';sub='Poetry'
  if title=='A Pale Blue Dot':review='Source lists this under poems; classification requires editorial verification.'
 else:
  creator='';m=re.search(r'\((\d{4})',raw)
  if m:year=int(m.group(1))
  title=re.sub(r'\s*\([^)]*\)','',raw).strip()
  for key,lang in [('Korean','한국어'),('Hindi','हिन्दी'),('French','Français'),('Italian','Italiano'),('Malayalam','മലയാളം')]:
   if key in raw:language=lang
  if mode=='series':
   language='' # not supplied by source
   if title in ['Planet Earth','Our Planet','Explained']:typ='documentary';cat='Documentaries';sub='Documentary Series'
 if title=='Ikigai':creators=['Francesc Miralles','Hector Garcia']
 else:creators=[creator] if creator else []
 if 'Trilogy' in title or 'Blade Runner &' in title:typ='collection';sub='Film Collections'
 tags=['Source collection']
 desc='বিশ্ববিদ্যালয় শিক্ষার্থী ও বিসিএস প্রত্যাশীদের জন্য মূল তালিকা থেকে নির্বাচিত একটি পাঠ।' if mode in ['book','poem'] else 'A screen recommendation from the original collection for curious minds.'
 items.append(dict(id=f'item-{len(items)+1:03}',title=title,creators=creators,type=typ,categories=[cat],subcategories=[sub],genres=[],tags=tags,language=language,year=year,description=desc,details='',status='published',reviewNote=review,sourceLabel=raw,thumbnail='',imageAlt='',metadata={}))
collections={
 'The Dark Knight Trilogy':[('Batman Begins',2005),('The Dark Knight',2008),('The Dark Knight Rises',2012)],
 'The Godfather Trilogy':[('The Godfather',1972),('The Godfather Part II',1974),('The Godfather Part III',1990)],
 'Before Trilogy':[('Before Sunrise',1995),('Before Sunset',2004),('Before Midnight',2013)],
 'The Lord of the Rings Trilogy':[('The Lord of the Rings: The Fellowship of the Ring',2001),('The Lord of the Rings: The Two Towers',2002),('The Lord of the Rings: The Return of the King',2003)],
 'Blade Runner & Blade Runner 2049':[('Blade Runner',1982),('Blade Runner 2049',2017)]}
for parent in list(items):
 if parent['title'] not in collections:continue
 parent['metadata']['membershipSource']='Editorial expansion of the named source grouping into its released films. Member titles and years are supplemental; the original group recommendation is preserved.'
 parent['children']=[]
 for title,year in collections[parent['title']]:
  child=dict(parent);child.update(id=f'item-{len(items)+1:03}',title=title,year=year,type='movie',subcategories=['Cinema'],parentId=parent['id'],sourceLabel=parent['sourceLabel'],metadata={'expandedFromSource':parent['title']});child.pop('children',None)
  parent['children'].append(child['id']);items.append(child)
editorial=json.loads((root/'seed/editorial.json').read_text())
for item in items:
 if item['title'] in editorial:
  extra=editorial[item['title']]
  item.update({k:v for k,v in extra.items() if k!='tags'})
  item['tags']+=extra.get('tags',[])
(root/'seed/items.json').write_text(json.dumps(items,ensure_ascii=False,indent=2))
(root/'seed/essay.json').write_text(json.dumps({'introduction':text.split('📚')[0].strip(),'closing':text.split('➡️ এখানে দেওয়া বই মুভি সিরিজ')[1].split('লেখা ©')[0].strip(),'credit':'আবদুল্লাহ আল নোমান অন্তর','qualification':'৪৫তম বিসিএস (শুল্ক ও আবগারি) সুপারিশপ্রাপ্ত','source':text},ensure_ascii=False,indent=2))
print(f'{len(items)} records, including {len(items)-14} source recommendations and 14 collection members')
