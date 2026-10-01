"""Build review-only HTML from the sibling Markdown decision documents; no dependencies."""
from pathlib import Path
import html,re
root=Path(__file__).parent

def inline(s):
    s=html.escape(s)
    s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
    def link(m):
        url=m[2]
        if url.endswith('.md') and '/' not in url: url='index.html' if url=='README.md' else url[:-3]+'.html'
        return '<a href="'+url+'">'+m[1]+'</a>'
    return re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,s)

def render(text):
    out=[];lines=text.splitlines();i=0
    while i<len(lines):
        line=lines[i]
        if not line.strip():i+=1;continue
        if line.startswith('```'):
            code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                if not re.match(r'^\|[\s:|\-]+$',lines[i]):rows.append([inline(c.strip()) for c in lines[i].strip('|').split('|')])
                i+=1
            out.append('<div class="table-scroll"><table>'+''.join('<tr>'+''.join('<'+('th' if j==0 else 'td')+'>'+c+'</'+('th' if j==0 else 'td')+'>' for c in r)+'</tr>' for j,r in enumerate(rows))+'</table></div>');continue
        m=re.match(r'^(#{1,3}) (.*)',line)
        if m:out.append(f'<h{len(m[1])}>'+inline(m[2])+f'</h{len(m[1])}>');i+=1;continue
        if re.match(r'^(- |\d+\. )',line):
            ordered=bool(re.match(r'^\d',line));tag='ol' if ordered else 'ul';items=[]
            while i<len(lines) and re.match(r'^(- |\d+\. )',lines[i]):items.append('<li>'+inline(re.sub(r'^(- |\d+\. )','',lines[i]))+'</li>');i+=1
            out.append('<'+tag+'>'+''.join(items)+'</'+tag+'>');continue
        para=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|- |\d+\. )',lines[i]):para.append(lines[i]);i+=1
        out.append('<p>'+inline(' '.join(para))+'</p>')
    return '\n'.join(out)
nav='<nav><a href="index.html">Overview</a><a href="01-reference-comparison.html">References</a><a href="02-interaction-decisions.html">Controls</a><a href="03-board-and-devices.html">Board & devices</a><a href="04-session-flow.html">Session flow</a><a href="05-prototype-and-evaluation.html">Evaluation</a><a href="../interaction-lab.html">Try the lab ↗</a></nav>'
for f in root.glob('*.md'):
    target='index.html' if f.name=='README.md' else f.stem+'.html'
    title=f.read_text().splitlines()[0].lstrip('# ')
    (root/target).write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+'</title><link rel="stylesheet" href="docs.css"></head><body><header><a href="../review.html">◉ &nbsp; PROTECT THE POD</a><span>UX DECISION PACK · SEPTEMBER 2026</span></header>'+nav+'<main>'+render(f.read_text())+'<footer><a href="'+f.name+'">Markdown source</a> · Design proposals and interactive fixtures; no production changes.</footer></main></body></html>')
