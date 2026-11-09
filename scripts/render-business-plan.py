from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
ROOT=Path(__file__).resolve().parents[1]
font='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
pdfmetrics.registerFont(TTFont('WQY',font,subfontIndex=0))
W,H=595.28,841.89
out=ROOT/'output/pdf/caption-relay-minmax-plan.pdf'
c=canvas.Canvas(str(out),pagesize=(W,H));c.setTitle('字幕交接台 Caption Relay - MINMAX商业计划书');c.setAuthor('Hengrui Guo')
text=(ROOT/'docs/minmax-business-plan.md').read_text()
sections=re.split(r'^## 第\d页｜',text,flags=re.M)[1:]
assert len(sections)==8
body=ParagraphStyle('body',fontName='WQY',fontSize=11,leading=20,textColor=HexColor('#506047'),wordWrap='CJK',spaceAfter=13)
small=ParagraphStyle('small',parent=body,fontSize=9,leading=16,textColor=HexColor('#849174'))
for n,section in enumerate(sections,1):
 title,content=section.split('\n',1)
 c.setFillColor(HexColor('#f6f7f1'));c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(HexColor('#376d48'));c.roundRect(42,H-69,29,29,7,fill=1,stroke=0)
 c.setFillColor(HexColor('#e3f1d0'));c.setFont('WQY',17);c.drawCentredString(56.5,H-61,'字')
 c.setFillColor(HexColor('#6e825d'));c.setFont('Helvetica',8);c.drawString(83,H-55,'CAPTION RELAY / MINMAX 2026')
 c.setFillColor(HexColor('#263e2d'));c.setFont('WQY',25);c.drawString(42,H-116,title.strip())
 c.setStrokeColor(HexColor('#d9e2ce'));c.line(42,H-138,W-42,H-138)
 y=H-167
 for block in re.split(r'\n\s*\n',content.strip()):
  block=block.strip()
  if not block:continue
  if block.startswith('|'):
   rows=[line for line in block.splitlines() if not re.match(r'^\|[\s:|-]+\|$',line)]
   cells=[[cell.strip() for cell in row.strip('|').split('|')] for row in rows]
   assert all(len(row)==3 for row in cells),f'Page {n}: expected three table columns'
   table_body=ParagraphStyle('table-body',parent=body,fontSize=10,leading=16)
   table_head=ParagraphStyle('table-head',parent=table_body,textColor=HexColor('#263e2d'))
   data=[[Paragraph(escape(cell.replace('**','').replace('`','')),table_head if i==0 else table_body) for cell in row] for i,row in enumerate(cells)]
   p=Table(data,colWidths=[54,228,W-84-282],hAlign='LEFT')
   p.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),HexColor('#e3ecd8')),
    ('LINEBELOW',(0,0),(-1,0),0.7,HexColor('#a7b89a')),
    ('LINEBELOW',(0,1),(-1,-1),0.4,HexColor('#d9e2ce')),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
    ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
    ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
   ]))
  else:
   block=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lambda m:m.group(1)+' ('+m.group(2)+')',block)
   block=block.replace('**','').replace('`','')
   p=Paragraph(escape(block).replace('\n','<br/>'),small if len(block)>450 else body)
  _,height=p.wrap(W-84,600)
  if y-height<63:raise RuntimeError(f'Page {n} overflows: {y-height}')
  p.drawOn(c,42,y-height);y-=height+13
 c.setFillColor(HexColor('#8c9b7c'));c.setFont('WQY',8);c.drawString(42,31,'Hengrui Guo · 个人开发 / AI辅助编码 · 2026-11-09')
 c.setFont('Helvetica',8);c.drawRightString(W-42,31,f'{n:02d} / 08')
 c.showPage()
c.save();print(out);print('bytes',out.stat().st_size)
