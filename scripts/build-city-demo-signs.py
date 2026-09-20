"""Original vector test fixtures, not real business artwork or offers."""
from pathlib import Path
from html import escape
root=Path(__file__).resolve().parents[1]/'public/city/demo-signs'
root.mkdir(parents=True,exist_ok=True)
brands=[('fieldwork','Fieldwork','#506b58','FW'),('offscript','Offscript','#b37352','OS'),('forma','Forma','#a39982','F'),('northline','Northline','#687d87','N'),('common-ground','Common Ground','#987052','CG'),('papercut','Papercut','#8d7274','P'),('tidal','Tidal','#668c88','T'),('monday','Monday Studio','#c6a262','M')]
for i,(slug,name,color,initials) in enumerate(brands):
    wide=i%3==2
    w,h=(480,120) if wide else (200,200)
    logo=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>{escape(name)} fictional test logo</title><rect x="8" y="8" width="{h-16}" height="{h-16}" rx="{8 if i%2 else 36}" fill="{color}"/><text x="{h/2}" y="{h*.65}" text-anchor="middle" fill="#fffdf4" font-family="Arial,sans-serif" font-size="{h*.36}" font-weight="bold">{initials}</text>{f'<text x="140" y="76" fill="{color}" font-family="Arial,sans-serif" font-size="42">{escape(name)}</text>' if wide else ''}</svg>'''
    (root/f'{slug}-logo.svg').write_text(logo+'\n')
    portrait=i==2
    w,h=(640,960) if portrait else (1024,512)
    hero=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>{escape(name)} fictional promotional image</title><rect width="{w}" height="{h}" fill="{color}"/><circle cx="{w*.8}" cy="{h*.5}" r="{w*.27}" fill="#eee7d5"/><circle cx="{w*.8}" cy="{h*.5}" r="{w*.17}" fill="{color}"/><path d="M {w*.6} {h*.78} L {w*.88} {h*.17} L {w*.99} {h*.78} Z" fill="#dfb574"/><text x="36" y="{h*.40}" fill="#fffaf0" font-family="Arial,sans-serif" font-size="{44 if portrait else 52}" font-weight="bold">{['MAKE ROOM','PLAY SOMETHING','SHAPES FOR','FIND YOUR','TAKE A','MAKE YOUR','A BETTER','START WITH'][i]}</text><text x="36" y="{h*.54}" fill="#fffaf0" font-family="Arial,sans-serif" font-size="{44 if portrait else 52}" font-weight="bold">{['FOR GOOD WORK','UNEXPECTED','EVERY DAY','OWN PACE','MOMENT','NEXT CHAPTER','EVERYDAY','AN IDEA'][i]}</text><rect x="28" y="{h-55}" width="225" height="30" fill="#25372d"/><text x="40" y="{h-34}" fill="#fffaf0" font-family="Arial,sans-serif" font-size="16">FICTIONAL CITY TEST IMAGE</text></svg>'''
    (root/f'{slug}-hero.svg').write_text(hero+'\n')
print('Wrote original demo logos and promotional fixtures')
