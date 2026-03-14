#!/usr/bin/env python3
# Generator for module-3-4.html — ProsperPath Module 3.4 Trends

HEAD = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="description" content="Module 3.4 - Trends | ProsperPath Market Structure">
<title>Trends | ProsperPath</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<style>
:root{--m-bg:#0d0e10;--m-surf:#141618;--m-surf2:#18191c;--m-bdr:#1e2023;--m-bdrhi:#2e3035;--m-txt:#e0e1e3;--m-muted:#5e626a;--m-muted2:#3a3d44;--m-gold:#a07c2e;--m-gold-dim:rgba(160,124,46,.13);--m-gold-line:rgba(160,124,46,.38);--m-green-txt:#7ed8a8;--m-red-txt:#e08070;--m-tr:150ms ease}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--m-bg);color:var(--m-txt);font-family:'Inter',sans-serif;min-height:100vh}
#ai-chat-fab,.ai-fab-btn,.floating-action-btn,[class*="fab"],[id*="fab"]{display:none!important}
#module-shell{display:flex;flex-direction:column;height:100vh;overflow:hidden}
#topbar{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.25rem;border-bottom:1px solid var(--m-bdr);background:var(--m-surf);flex-shrink:0;gap:1rem}
#topbar-left{display:flex;align-items:center;gap:.75rem}
#back-btn{background:transparent;border:1px solid var(--m-bdr);color:var(--m-muted);font-size:.78rem;padding:.38rem .85rem;border-radius:3px;cursor:pointer;font-family:'Inter',sans-serif;transition:border-color var(--m-tr),color var(--m-tr)}
#back-btn:hover{border-color:var(--m-bdrhi);color:var(--m-txt)}
#topbar-title{font-family:'Outfit',sans-serif;font-size:.95rem;font-weight:600;color:var(--m-txt)}
#progress-label{font-size:.75rem;color:var(--m-muted);letter-spacing:.04em;white-space:nowrap}
#progress-bar-wrap{width:80px;height:2px;background:var(--m-bdr);border-radius:1px;overflow:hidden}
#progress-bar-fill{height:100%;background:var(--m-gold);border-radius:1px;transition:width .4s ease}
#shell-body{display:flex;flex:1;overflow:hidden}
#section-nav{width:200px;flex-shrink:0;border-right:1px solid var(--m-bdr);background:var(--m-surf);overflow-y:auto;padding:1rem 0}
.sn-item{display:flex;align-items:center;gap:.6rem;padding:.6rem 1rem;font-size:.75rem;color:var(--m-muted);cursor:pointer;transition:color var(--m-tr),background var(--m-tr);border-left:2px solid transparent;line-height:1.3}
.sn-item:hover{color:var(--m-txt);background:rgba(255,255,255,.025)}
.sn-item.visited{color:var(--m-txt)}.sn-item.current{color:var(--m-gold);border-left-color:var(--m-gold);background:var(--m-gold-dim)}
.sn-dot{width:6px;height:6px;border-radius:50%;background:var(--m-muted2);flex-shrink:0;transition:background var(--m-tr)}
.sn-item.visited .sn-dot{background:var(--m-muted)}.sn-item.current .sn-dot{background:var(--m-gold)}
#main-stage{flex:1;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:2.5rem 1.5rem}
.screen{width:100%;max-width:640px;animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.scr-eyebrow{font-size:.68rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--m-muted);margin-bottom:1.2rem}
.scr-h1{font-family:'Outfit',sans-serif;font-size:clamp(1.6rem,4vw,2.2rem);font-weight:700;color:var(--m-txt);letter-spacing:-.02em;line-height:1.15;margin-bottom:.75rem}
.scr-body{font-size:.95rem;color:var(--m-muted);line-height:1.7;margin-bottom:1.5rem}
.scr-body p{margin-bottom:.55rem}.scr-body p:last-child{margin-bottom:0}
.scr-meta{font-size:.78rem;color:var(--m-muted);letter-spacing:.04em;margin-bottom:2rem}
.chart-box{position:relative;margin:1.25rem 0;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px}
.chart-box svg{position:absolute;inset:0;width:100%;height:100%}
.principle-card{background:var(--m-surf2);border:1px solid var(--m-bdrhi);border-radius:8px;padding:3.5rem 2rem;text-align:center;margin:1.5rem 0;animation:pfade .7s ease both}
@keyframes pfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.principle-text{font-family:'Outfit',sans-serif;font-size:clamp(1.4rem,3.5vw,2rem);font-weight:700;color:var(--m-txt);letter-spacing:-.02em;line-height:1.25}
.btn-primary{background:transparent;border:1px solid var(--m-gold-line);color:var(--m-gold);font-family:'Inter',sans-serif;font-size:.8rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:.65rem 1.5rem;border-radius:3px;cursor:pointer;transition:background .2s,border-color .2s;margin-right:.6rem}
.btn-primary:hover{background:var(--m-gold-dim);border-color:var(--m-gold)}
.btn-primary:disabled{opacity:.42;cursor:not-allowed}
.btn-ghost{background:transparent;border:1px solid var(--m-bdr);color:var(--m-muted);font-family:'Inter',sans-serif;font-size:.8rem;font-weight:500;letter-spacing:.04em;padding:.62rem 1.2rem;border-radius:3px;cursor:pointer;transition:border-color var(--m-tr),color var(--m-tr)}
.btn-ghost:hover{border-color:var(--m-bdrhi);color:var(--m-txt)}
.btn-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.75rem}
.opt-btn{display:block;width:100%;background:transparent;border:1px solid var(--m-bdr);color:var(--m-txt);font-family:'Inter',sans-serif;font-size:.875rem;text-align:left;padding:.75rem 1rem;border-radius:4px;cursor:pointer;margin-bottom:.5rem;transition:border-color var(--m-tr),background var(--m-tr)}
.opt-btn:hover{border-color:var(--m-bdrhi);background:rgba(255,255,255,.025)}
.opt-btn.selected{border-color:var(--m-gold-line);background:var(--m-gold-dim);color:var(--m-gold)}
.opt-btn:disabled{cursor:default}
.assessment-prog{font-size:.72rem;color:var(--m-muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:1.5rem}
.assessment-q{font-size:1rem;color:var(--m-txt);margin-bottom:1.25rem;line-height:1.55}
.result-box{text-align:center;padding:2rem 1rem}
.result-title{font-family:'Outfit',sans-serif;font-size:1.5rem;font-weight:700;color:var(--m-txt);margin-bottom:.5rem}
.result-gold{color:var(--m-gold)}
.result-body{font-size:.9rem;color:var(--m-muted);line-height:1.6;margin-bottom:1.75rem;max-width:360px;margin-left:auto;margin-right:auto}
#clarify-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:900;display:none;align-items:flex-start;justify-content:flex-end}
#clarify-overlay.open{display:flex}
#clarify-panel{width:340px;max-width:90vw;height:100%;background:#16181b;border-left:1px solid var(--m-bdr);overflow-y:auto;padding:2rem 1.5rem;animation:slideInRight .22s ease}
@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
.cp-term{font-family:'Outfit',sans-serif;font-size:1.1rem;font-weight:600;color:var(--m-txt);margin-bottom:.25rem}
.cp-section{margin-top:1.25rem}
.cp-label{font-size:.65rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--m-muted);margin-bottom:.4rem}
.cp-text{font-size:.85rem;color:var(--m-muted);line-height:1.55}
.cp-text strong{color:var(--m-txt);font-weight:500}
#cp-close{margin-top:2rem;background:transparent;border:1px solid var(--m-bdr);color:var(--m-muted);font-family:'Inter',sans-serif;font-size:.78rem;padding:.5rem 1rem;border-radius:3px;cursor:pointer;transition:border-color var(--m-tr),color var(--m-tr)}
#cp-close:hover{border-color:var(--m-bdrhi);color:var(--m-txt)}
.nav-toggle{display:none;background:transparent;border:1px solid var(--m-bdr);color:var(--m-muted);padding:.36rem .7rem;border-radius:3px;cursor:pointer;font-size:.75rem}
.sim-task{background:var(--m-surf2);border:1px solid var(--m-bdrhi);border-radius:4px;padding:.75rem 1rem;margin-bottom:.85rem;font-size:.9rem;color:var(--m-txt);line-height:1.45}
.sim-task .task-label{font-size:.65rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--m-gold);margin-bottom:.3rem}
.sim-fb{min-height:2rem;font-size:.85rem;padding:.5rem 0}
.sim-fb.ok{color:var(--m-green-txt)}.sim-fb.err{color:var(--m-red-txt)}
.dir-btns{display:flex;gap:.6rem;margin-top:.85rem;flex-wrap:wrap}
.dir-btn{flex:1;min-width:90px;background:transparent;border:1px solid var(--m-bdr);color:var(--m-muted);font-family:'Inter',sans-serif;font-size:.82rem;padding:.65rem .8rem;border-radius:4px;cursor:pointer;transition:border-color var(--m-tr),color var(--m-tr),background var(--m-tr)}
.dir-btn:hover{border-color:var(--m-bdrhi);color:var(--m-txt);background:rgba(255,255,255,.025)}
.clarify-btn{background:none;border:none;color:var(--m-gold);font-size:.78rem;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0;font-family:'Inter',sans-serif}
@media(max-width:700px){
#section-nav{position:fixed;inset:0 auto 0 0;z-index:800;transform:translateX(-100%);transition:transform .3s ease;width:240px}
#section-nav.open{transform:translateX(0)}
#nav-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:799;display:none}
#nav-backdrop.open{display:block}
#clarify-panel{width:100%;height:60vh;border-left:none;border-top:1px solid var(--m-bdr);position:fixed;bottom:0;left:0}
#clarify-overlay{align-items:flex-end;justify-content:center}
#main-stage{padding:1.5rem 1rem}
.nav-toggle{display:inline-flex;align-items:center;gap:.4rem}
}
</style>
</head>'''

BODY = '''
<body>
<div id="module-shell">
  <div id="topbar">
    <div id="topbar-left">
      <button class="nav-toggle" id="nav-toggle-btn" onclick="toggleNav()" aria-label="Open sections">&#9776; Sections</button>
      <button id="back-btn" onclick="goBack()">&#8592; Market Structure</button>
      <span id="topbar-title">Trends</span>
    </div>
    <div style="display:flex;align-items:center;gap:.75rem">
      <span id="progress-label">Progress 0%</span>
      <div id="progress-bar-wrap"><div id="progress-bar-fill" style="width:0%"></div></div>
    </div>
  </div>
  <div id="nav-backdrop" onclick="toggleNav()"></div>
  <div id="shell-body">
    <nav id="section-nav" aria-label="Module sections"><div id="sn-items"></div></nav>
    <main id="main-stage"><div class="screen" id="sc"></div></main>
  </div>
</div>
<div id="clarify-overlay" onclick="if(event.target===this)closeClarify()" role="dialog" aria-modal="true">
  <div id="clarify-panel">
    <div class="cp-term" id="cp-term"></div>
    <div class="cp-section"><div class="cp-label">Explanation</div><div class="cp-text" id="cp-exp"></div></div>
    <div class="cp-section"><div class="cp-label">Example</div><div class="cp-text" id="cp-ex"></div></div>
    <div class="cp-section"><div class="cp-label">Common Misconception</div><div class="cp-text" id="cp-misc"></div></div>
    <button id="cp-close" onclick="closeClarify()">Close</button>
  </div>
</div>
<script src="script.js?v=m34"></script>
<script src="ai-widget.js"></script>
<script src="google-auth.js"></script>
<script>
window.addEventListener('load',function(){if(typeof initGoogleAuth==='function')initGoogleAuth();});'''

SCRIPT_STATE = r"""
var ST={sid:0,si:0,visited:new Set(),lastSI:{},hist:[],
  assess:{ans:[null,null,null],submitted:false,score:null,passed:null,q:0},
  review:false,verified:false,
  sim:{task:0,done:false}};
var SECS=[
  {id:0,label:'Entry'},
  {id:1,label:'Section I \u2014 Structure Persists'},
  {id:2,label:'Section II \u2014 Structural Drift'},
  {id:3,label:'Section III \u2014 Upward Trend'},
  {id:4,label:'Section IV \u2014 Downward Trend'},
  {id:5,label:'Section V \u2014 Recognition Simulation'},
  {id:6,label:'Section VI \u2014 Principle'},
  {id:7,label:'Section VII \u2014 Competency Check'}
];
function pct(){
  var v=[...ST.visited].filter(function(x){return x>=1&&x<=7;});
  var p=Math.round((Math.min(v.length,7)/7)*85);
  if(ST.assess.score!==null&&ST.assess.score>0&&!ST.assess.passed)p=Math.max(p,90);
  if(ST.assess.passed)p=100;
  return p;
}
function updProg(){var p=pct();document.getElementById('progress-label').textContent='Progress '+p+'%';document.getElementById('progress-bar-fill').style.width=p+'%';}
function visit(id){if(!ST.visited.has(id)){ST.visited.add(id);updProg();}renderNav();}
function goTo(id,si,push){
  var max=ST.visited.size>0?Math.max(...[...ST.visited]):0;
  if(!(ST.visited.has(id)||id<=max+1||id===0))return;
  if(push!==false)ST.hist.push({sid:ST.sid,si:ST.si});
  ST.lastSI[ST.sid]=ST.si;ST.sid=id;ST.si=(si!=null)?si:0;ST.review=false;
  visit(id);renderNav();render();
  var n=document.getElementById('section-nav');if(n.classList.contains('open'))toggleNav();
}
function goBack(){
  if(ST.review){ST.review=false;render();return;}
  if(ST.hist.length>0){var p=ST.hist.pop();ST.lastSI[ST.sid]=ST.si;ST.sid=p.sid;ST.si=p.si;ST.review=false;visit(p.sid);renderNav();render();return;}
  window.location.href='market-structure.html';
}
function toggleNav(){document.getElementById('section-nav').classList.toggle('open');document.getElementById('nav-backdrop').classList.toggle('open');}
function renderNav(){
  var c=document.getElementById('sn-items');c.innerHTML='';
  SECS.forEach(function(s){
    if(s.id===0)return;
    var cur=ST.sid===s.id,vis=ST.visited.has(s.id);
    var max=ST.visited.size>0?Math.max(...[...ST.visited]):0;
    var ok=vis||s.id<=max+1;
    var d=document.createElement('div');
    d.className='sn-item'+(cur?' current':'')+(vis?' visited':'');
    d.setAttribute('tabindex',ok?'0':'-1');d.setAttribute('role','button');
    d.innerHTML='<span class="sn-dot"></span><span>'+s.label+'</span>';
    if(ok){
      d.onclick=function(){var l=ST.lastSI[s.id];goTo(s.id,l!=null?l:0);};
      d.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){var l=ST.lastSI[s.id];goTo(s.id,l!=null?l:0);}};
    }else{d.style.opacity='.35';d.style.cursor='not-allowed';}
    c.appendChild(d);
  });
}"""

SCRIPT_CLARIFY = r"""
var CD={
  trend:{
    term:'Trend',
    explanation:'A trend is structure that consistently drifts in one direction over time. It is defined not by a single swing, but by a persistent sequence of swings moving the same way.',
    example:'Price makes a Higher High, pulls back to a Higher Low, then makes another Higher High. That repeating directional drift is an upward trend.',
    misc:'<strong>"A trend is just a rule like HH/HL."</strong> A trend is a persistent visual behavior of structure drifting over time, not a simple label.'
  },
  uptrend:{
    term:'Upward Trend',
    explanation:'An upward trend forms when both highs and lows rise consistently. Each new swing high is higher than the last, and each swing low is higher than the previous low.',
    example:'Price: SL at 100, SH at 130, HL at 115, HH at 150. Both the highs and lows are rising \u2014 that is an upward trend.',
    misc:'<strong>"One Higher High confirms a trend."</strong> A single swing does not confirm a trend. Persistence of rising highs and lows is required.'
  },
  downtrend:{
    term:'Downward Trend',
    explanation:'A downward trend forms when both highs and lows fall consistently. Each new swing high is lower than the last, and each swing low is lower than the previous low.',
    example:'Price: SH at 200, SL at 170, LH at 185, LL at 155. Both highs and lows are falling \u2014 that is a downward trend.',
    misc:'<strong>"Falling price always means a downtrend."</strong> Falling price without clear structural swing confirmation may be a pullback within a larger uptrend.'
  }
};
function openClarify(k){
  var d=CD[k];if(!d)return;
  document.getElementById('cp-term').textContent=d.term;
  document.getElementById('cp-exp').textContent=d.explanation;
  document.getElementById('cp-ex').textContent=d.example;
  document.getElementById('cp-misc').innerHTML=d.misc;
  document.getElementById('clarify-overlay').classList.add('open');
  document.getElementById('cp-close').focus();
}
function closeClarify(){document.getElementById('clarify-overlay').classList.remove('open');}
function eH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function eA(s){return String(s).replace(/"/g,'&quot;');}"""

SCRIPT_SVG = r"""
/* ---- SVG helpers ---- */
var VW=600,VH=220;
function ln(pts,st,w,da){
  var d='M'+pts.map(function(p){return p.x+','+p.y;}).join(' L');
  return '<path d="'+d+'" stroke="'+st+'" stroke-width="'+w+'" fill="none" stroke-dasharray="'+da+'" stroke-linejoin="round" stroke-linecap="round"/>';
}
function dot(x,y,r,f,s,sw){return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';}
function lbl(x,y,t,sz,f,dy){return '<text x="'+x+'" y="'+(y+(dy||0))+'" text-anchor="middle" font-size="'+sz+'" font-family="Inter,sans-serif" fill="'+f+'" font-weight="600" letter-spacing="0.06em">'+t+'</text>';}
function grid(w,h,step,c){var s='',y=step;while(y<h){s+='<line x1="0" y1="'+y+'" x2="'+w+'" y2="'+y+'" stroke="'+c+'" stroke-width="1"/>';y+=step;}return s;}
var GL=grid(VW,VH,40,'rgba(255,255,255,0.025)');
var GS='rgba(195,162,70,0.55)';
var CORR='rgba(160,124,46,0.40)';

/* Upward trend points: HH1 HL1 HH2 HL2 HH3 */
var UP=[{x:60,y:170},{x:170,y:110},{x:280,y:65},{x:390,y:120},{x:520,y:30}];
/* Downward trend points: LL1 LH1 LL2 LH2 */
var DN=[{x:60,y:50},{x:170,y:110},{x:280,y:155},{x:390,y:100},{x:520,y:185}];

/* Upper corridor line (through highs): UP[0],UP[2],UP[4] */
function upCorridorUp(){return ln([UP[0],UP[2],UP[4]],CORR,1,'0');}
/* Lower corridor line (through lows): UP[1],UP[3] extrapolated */
function upCorridorLo(){return ln([{x:60,y:210},{x:390,y:160},{x:540,y:148}],CORR,1,'0');}
/* Down corridor through highs: DN[1],DN[3] */
function dnCorridorUp(){return ln([{x:60,y:30},{x:280,y:120},{x:540,y:155}],CORR,1,'0');}
/* Down corridor through lows: DN[0],DN[2],DN[4] */
function dnCorridorLo(){return ln([DN[0],DN[2],DN[4]],CORR,1,'0');}"""

SCRIPT_S1_S4 = r"""
/* ---- Section builders ---- */
function bEntry(){
  var h='<div style="text-align:center;padding:2rem 0">';
  h+='<p class="scr-eyebrow">ProsperPath &mdash; Market Structure</p>';
  h+='<h1 class="scr-h1">Trends</h1>';
  h+='<p class="scr-body" style="max-width:320px;margin:0 auto 1rem">Structure drifting in one direction.<br>Persistent direction creates a trend.</p>';
  h+='<p class="scr-meta">Beginner &bull; 15 minutes &bull; Market Structure</p>';
  h+='<button class="btn-primary" id="begin-btn">Begin Module</button>';
  h+='</div>';
  return h;
}

function bS1(){
  /* 5 UP points: HH1 HL1 HH2 HL2 HH3 — animate sequentially */
  var labels=['HH','HL','HH','HL','HH'];
  var nodeGroups=UP.map(function(p,i){
    var isH=(i===0||i===2||i===4);
    var delay=(i*380)+'ms';
    var dEl=dot(p.x,p.y,6,'rgba(220,210,190,0.9)','rgba(220,210,190,0.28)',1.5);
    var lEl=isH?lbl(p.x,p.y-14,labels[i],9,'rgba(224,225,227,0.72)'):lbl(p.x,p.y+20,labels[i],9,'rgba(224,225,227,0.72)');
    return '<g id="s1n'+i+'" style="opacity:0;transition:opacity 0.35s ease '+delay+'">'+dEl+lEl+'</g>';
  }).join('');
  var lineDelay=(UP.length*380+300)+'ms';
  var svg='<svg viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none">'+GL+nodeGroups+'<g id="s1l" style="opacity:0;transition:opacity 0.45s ease '+lineDelay+'">'+ln(UP,GS,1.5,'8,6')+'</g></svg>';
  var h='<p class="scr-eyebrow">Section I &mdash; Structure Persists</p>';
  h+='<div class="chart-box">'+svg+'</div>';
  h+='<div class="scr-body" style="margin-top:.9rem;text-align:center"><p>Sometimes structure continues forming in the same direction.</p><p style="margin-top:.55rem">Persistent structure creates a trend.</p></div>';
  h+='<div class="btn-row"><button class="btn-primary" id="s1n">Continue to Section II</button></div>';
  return h;
}
function initS1(){
  setTimeout(function(){
    UP.forEach(function(_,i){var m=document.getElementById('s1n'+i);if(m)m.style.opacity='1';});
    var l=document.getElementById('s1l');if(l)l.style.opacity='1';
  },40);
}

function bS2(){
  /* Chart: 4 swing nodes with corridor lines fading in */
  var pts=UP.slice(0,4);
  var nodeSvg=pts.map(function(p,i){
    var isH=(i===0||i===2);
    var labels2=['HH','HL','HH','HL'];
    var dEl=dot(p.x,p.y,6,'rgba(220,210,190,0.85)','rgba(220,210,190,0.25)',1.5);
    var lEl=isH?lbl(p.x,p.y-14,labels2[i],9,'rgba(224,225,227,0.70)'):lbl(p.x,p.y+20,labels2[i],9,'rgba(224,225,227,0.70)');
    return dEl+lEl;
  }).join('');
  var corridorSvg='<g id="s2corr" style="opacity:0;transition:opacity 0.7s ease 0.7s">'+upCorridorUp()+upCorridorLo()+'</g>';
  var svg='<svg viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none">'+GL+ln(pts,GS,1.5,'8,6')+nodeSvg+corridorSvg+'</svg>';
  var h='<p class="scr-eyebrow">Section II &mdash; Structural Drift</p>';
  h+='<div class="chart-box" id="s2box">'+svg+'</div>';
  h+='<div class="scr-body" style="margin-top:.9rem;text-align:center"><p>When structure consistently drifts in one direction, a trend forms.</p></div>';
  h+='<p style="font-size:.8rem;color:var(--m-muted);margin:.85rem 0 1rem;text-align:center">Clarify: <button class="clarify-btn" data-topic="trend">Trend</button></p>';
  h+='<div class="btn-row"><button class="btn-primary" id="s2n">Continue to Section III</button></div>';
  return h;
}
function initS2(){setTimeout(function(){var c=document.getElementById('s2corr');if(c)c.style.opacity='1';},40);}

function bS3(){
  var labels3=['HH','HL','HH','HL'];
  var nodeSvg=UP.slice(0,4).map(function(p,i){
    var isH=(i===0||i===2);
    var dEl=dot(p.x,p.y,6,'rgba(220,210,190,0.9)','rgba(220,210,190,0.28)',1.5);
    var lEl=isH?lbl(p.x,p.y-14,labels3[i],9,'rgba(224,225,227,0.72)'):lbl(p.x,p.y+20,labels3[i],9,'rgba(224,225,227,0.72)');
    return dEl+lEl;
  }).join('');
  var corrSvg='<g style="opacity:1">'+upCorridorUp()+upCorridorLo()+'</g>';
  var svg='<svg viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none">'+GL+ln(UP.slice(0,4),GS,1.8,'8,5')+nodeSvg+corrSvg+'</svg>';
  var h='<p class="scr-eyebrow">Section III &mdash; Upward Trend</p>';
  h+='<div class="chart-box">'+svg+'</div>';
  h+='<div class="scr-body" style="margin-top:.9rem;text-align:center"><p>Upward trends form when both highs and lows rise over time.</p></div>';
  h+='<p style="font-size:.8rem;color:var(--m-muted);margin:.85rem 0 1rem;text-align:center">Clarify: <button class="clarify-btn" data-topic="uptrend">Upward Trend</button></p>';
  h+='<div class="btn-row"><button class="btn-primary" id="s3n">Continue to Section IV</button></div>';
  return h;
}

function bS4(){
  var labels4=['LL','LH','LL','LH','LL'];
  var nodeSvg=DN.map(function(p,i){
    var isH=(i===1||i===3);
    var dEl=dot(p.x,p.y,6,'rgba(220,210,190,0.9)','rgba(220,210,190,0.28)',1.5);
    var lEl=isH?lbl(p.x,p.y-14,labels4[i],9,'rgba(224,225,227,0.72)'):lbl(p.x,p.y+20,labels4[i],9,'rgba(224,225,227,0.72)');
    return dEl+lEl;
  }).join('');
  var corrSvg='<g style="opacity:1">'+dnCorridorUp()+dnCorridorLo()+'</g>';
  var svg='<svg viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none">'+GL+ln(DN,GS,1.8,'8,5')+nodeSvg+corrSvg+'</svg>';
  var h='<p class="scr-eyebrow">Section IV &mdash; Downward Trend</p>';
  h+='<div class="chart-box">'+svg+'</div>';
  h+='<div class="scr-body" style="margin-top:.9rem;text-align:center"><p>Downward trends form when both highs and lows fall over time.</p></div>';
  h+='<p style="font-size:.8rem;color:var(--m-muted);margin:.85rem 0 1rem;text-align:center">Clarify: <button class="clarify-btn" data-topic="downtrend">Downward Trend</button></p>';
  h+='<div class="btn-row"><button class="btn-primary" id="s4n">Continue to Section V</button></div>';
  return h;
}"""

SCRIPT_S5 = r"""
/* ---- Section V: Simulation ---- */
/* We show an upward trend (UP points) and run 3 tasks */
/* Task 0: direction buttons */
/* Task 1: tap most recent HL (UP[3]) */
/* Task 2: predict next step (Higher High) */

function simSvg(showHL){
  var labels5=['HH','HL','HH','HL'];
  var nodeSvg=UP.slice(0,4).map(function(p,i){
    var isH=(i===0||i===2);
    var dEl=dot(p.x,p.y,7,'rgba(200,185,130,0.9)','rgba(200,185,130,0.28)',2);
    var lEl=isH?lbl(p.x,p.y-14,labels5[i],9,'rgba(224,225,227,0.70)'):lbl(p.x,p.y+20,labels5[i],9,'rgba(224,225,227,0.70)');
    return dEl+lEl;
  }).join('');
  var corrSvg='<g style="opacity:1">'+upCorridorUp()+upCorridorLo()+'</g>';
  var hr='<circle id="hring" cx="-99" cy="-99" r="13" fill="none" stroke="rgba(200,185,130,0.45)" stroke-width="1.5" style="opacity:0;transition:opacity .2s"/>';
  var hlMark=showHL?dot(UP[3].x,UP[3].y,9,'rgba(120,210,160,0.82)','rgba(255,255,255,0.18)',1.5)+'<circle cx="'+UP[3].x+'" cy="'+UP[3].y+'" r="15" fill="none" stroke="rgba(120,210,160,0.32)" stroke-width="1"/>':'';
  return '<svg id="s5svg" viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">'+GL+ln(UP.slice(0,4),GS,1.8,'8,5')+corrSvg+nodeSvg+hlMark+hr+'</svg>';
}

function bS5(){
  var task=ST.sim.task;
  if(ST.sim.done){
    var h='<p class="scr-eyebrow">Section V &mdash; Recognition Simulation</p>';
    h+='<div style="text-align:center;padding:1.5rem 0"><div style="font-size:1.4rem;color:var(--m-green-txt);margin-bottom:.75rem">&#10003;</div>';
    h+='<p style="font-family:\'Outfit\',sans-serif;font-size:1.1rem;font-weight:600;color:var(--m-txt);margin-bottom:.4rem">Trend identified.</p>';
    h+='<p class="scr-body" style="max-width:360px;margin:0 auto">You can identify the trend direction, locate key structural swings, and predict the next structural step.</p></div>';
    h+='<div class="btn-row" style="justify-content:center"><button class="btn-primary" id="s5n">Continue to Section VI</button></div>';
    return h;
  }
  var h='<p class="scr-eyebrow">Section V &mdash; Recognition Simulation</p>';
  if(task===0){
    h+='<div class="sim-task"><div class="task-label">Task 1 of 3</div>Identify the trend direction.</div>';
    h+='<div id="s5w" style="position:relative;margin:0 0 .85rem;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px">'+simSvg(false)+'</div>';
    h+='<div class="dir-btns"><button class="dir-btn" onclick="doDir(\'up\')">Upward</button><button class="dir-btn" onclick="doDir(\'down\')">Downward</button><button class="dir-btn" onclick="doDir(\'side\')">Sideways</button></div>';
    h+='<div class="sim-fb" id="sfb"></div>';
  }else if(task===1){
    h+='<div class="sim-task"><div class="task-label">Task 2 of 3</div>Tap the most recent Higher Low.</div>';
    h+='<div id="s5w" style="position:relative;margin:0 0 .85rem;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px;cursor:crosshair">'+simSvg(false)+'</div>';
    h+='<div class="sim-fb" id="sfb"></div>';
  }else if(task===2){
    h+='<div class="sim-task"><div class="task-label">Task 3 of 3</div>What is the most likely next structural step?</div>';
    h+='<div id="s5w" style="position:relative;margin:0 0 .85rem;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px">'+simSvg(true)+'</div>';
    h+='<div class="dir-btns"><button class="dir-btn" onclick="doPred(\'hh\')">Higher High</button><button class="dir-btn" onclick="doPred(\'hl\')">Higher Low</button><button class="dir-btn" onclick="doPred(\'ll\')">Lower Low</button></div>';
    h+='<div class="sim-fb" id="sfb"></div>';
  }
  return h;
}

function doDir(d){
  var fb=document.getElementById('sfb');
  if(d==='up'){
    if(fb){fb.className='sim-fb ok';fb.textContent='Correct \u2014 rising highs and lows confirm an upward trend.';}
    setTimeout(function(){ST.sim.task=1;render();},900);
  }else{
    if(fb){fb.className='sim-fb err';fb.textContent='Not quite \u2014 observe the sequence of highs and lows.';}
    setTimeout(function(){if(fb){fb.className='sim-fb';fb.textContent='';}},1400);
  }
}

function doPred(d){
  var fb=document.getElementById('sfb');
  if(d==='hh'){
    if(fb){fb.className='sim-fb ok';fb.textContent='Correct. After a Higher Low, the next likely step in an upward trend is a Higher High.';}
    document.querySelectorAll('.dir-btn').forEach(function(b){b.disabled=true;});
    setTimeout(function(){animateHH();},300);
    setTimeout(function(){ST.sim.done=true;render();},1800);
  }else{
    if(fb){fb.className='sim-fb err';fb.textContent='Not quite. After establishing a Higher Low, structure continues upward toward a new Higher High.';}
    setTimeout(function(){if(fb){fb.className='sim-fb';fb.textContent='';}},2000);
  }
}

function animateHH(){
  var wrap=document.getElementById('s5w');if(!wrap)return;
  /* New HH extends from last HL (UP[3]) */
  var fromX=UP[3].x,fromY=UP[3].y;
  var hhX=560,hhY=18;
  var projX=600,projY=8;
  var ns='http://www.w3.org/2000/svg';
  var svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 600 220');
  svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5';
  function mkPath(x1,y1,x2,y2,st,sw,da){
    var p=document.createElementNS(ns,'path');
    p.setAttribute('d','M'+x1+','+y1+' L'+x2+','+y2);
    p.setAttribute('stroke',st);p.setAttribute('stroke-width',sw);p.setAttribute('fill','none');
    p.setAttribute('stroke-dasharray',da);p.setAttribute('stroke-linecap','round');
    p.style.opacity='0';p.style.transition='opacity 220ms ease';
    return p;
  }
  var ext=mkPath(fromX,fromY,hhX,hhY,'rgba(195,162,70,0.55)',2,'8,5');
  svg.appendChild(ext);
  var hhNode=document.createElementNS(ns,'circle');
  hhNode.setAttribute('cx',hhX);hhNode.setAttribute('cy',hhY);hhNode.setAttribute('r','7');
  hhNode.setAttribute('fill','rgba(200,185,130,0.92)');hhNode.setAttribute('stroke','rgba(200,185,130,0.28)');
  hhNode.setAttribute('stroke-width','2');hhNode.style.opacity='0';hhNode.style.transition='opacity 220ms ease';
  svg.appendChild(hhNode);
  var hhLbl=document.createElementNS(ns,'text');
  hhLbl.setAttribute('x',hhX);hhLbl.setAttribute('y',hhY-13);
  hhLbl.setAttribute('text-anchor','middle');hhLbl.setAttribute('font-size','9');
  hhLbl.setAttribute('font-family','Inter,sans-serif');hhLbl.setAttribute('fill','rgba(224,225,227,0.65)');
  hhLbl.setAttribute('font-weight','600');hhLbl.setAttribute('letter-spacing','0.06em');
  hhLbl.textContent='HH';hhLbl.style.opacity='0';hhLbl.style.transition='opacity 220ms ease';
  svg.appendChild(hhLbl);
  var proj=mkPath(hhX,hhY,projX,projY,'rgba(175,148,60,0.20)',1.2,'4,5');
  svg.appendChild(proj);
  wrap.appendChild(svg);
  setTimeout(function(){ext.style.opacity='1';},40);
  setTimeout(function(){hhNode.style.opacity='1';hhLbl.style.opacity='1';},280);
  setTimeout(function(){proj.style.opacity='1';},520);
}

function initSim(){
  if(ST.sim.task!==1)return;
  var w=document.getElementById('s5w');if(!w)return;
  var ring=document.getElementById('hring');
  var tgt={x:UP[3].x,y:UP[3].y};var HIT=32,PRV=70;
  function gv(e){var r=w.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*VW,y:(e.clientY-r.top)/r.height*VH};}
  function mv(e){
    var v=gv(e);if(!ring)return;
    var d2=Math.hypot(v.x-tgt.x,v.y-tgt.y);
    ring.setAttribute('cx',tgt.x);ring.setAttribute('cy',tgt.y);
    ring.style.opacity=d2<=PRV?'1':'0';
  }
  function cl(e){
    var v=gv(e);var fb=document.getElementById('sfb');
    w.removeEventListener('click',cl);w.removeEventListener('mousemove',mv);
    if(ring)ring.style.opacity='0';
    if(Math.hypot(v.x-tgt.x,v.y-tgt.y)<=HIT){
      if(fb){fb.className='sim-fb ok';fb.textContent='Correct \u2014 most recent Higher Low identified.';}
      mrkSim(w,tgt.x,tgt.y,'rgba(120,210,160,0.88)',false);
      setTimeout(function(){ST.sim.task=2;render();},900);
    }else{
      if(fb){fb.className='sim-fb err';fb.textContent='Not quite \u2014 look for the most recent Higher Low.';}
      mrkSim(w,v.x,v.y,'rgba(210,90,72,0.65)',true);
      setTimeout(function(){
        var m=w.querySelector('.smk');if(m)m.style.opacity='0';
        setTimeout(function(){var m2=w.querySelector('.smk');if(m2)m2.remove();if(fb){fb.className='sim-fb';fb.textContent='';}w.addEventListener('mousemove',mv);w.addEventListener('click',cl);},220);
      },380);
    }
  }
  w.addEventListener('mousemove',mv);w.addEventListener('click',cl);
}

function mrkSim(wrap,vx,vy,col,isErr){
  var ex=wrap.querySelector('.smk');if(ex)ex.remove();
  var s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('viewBox','0 0 '+VW+' '+VH);
  s.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:10;transition:opacity .25s ease';
  s.className='smk';
  var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx',vx);c.setAttribute('cy',vy);
  c.setAttribute('r',isErr?'5':'8');c.setAttribute('fill',col);
  c.setAttribute('stroke',isErr?'rgba(255,150,130,0.35)':'rgba(255,255,255,0.22)');
  c.setAttribute('stroke-width','1.5');s.appendChild(c);
  if(!isErr){var ring2=document.createElementNS('http://www.w3.org/2000/svg','circle');ring2.setAttribute('cx',vx);ring2.setAttribute('cy',vy);ring2.setAttribute('r','14');ring2.setAttribute('fill','none');ring2.setAttribute('stroke','rgba(120,210,160,0.38)');ring2.setAttribute('stroke-width','1');s.appendChild(ring2);}
  s.style.opacity='0';wrap.appendChild(s);
  requestAnimationFrame(function(){requestAnimationFrame(function(){s.style.opacity='1';});});
}"""

SCRIPT_S6_S7 = r"""
function bS6(){
  return '<p class="scr-eyebrow">Section VI &mdash; Principle</p><div class="principle-card"><p class="principle-text">Trends are persistent directional structure.</p></div><div class="btn-row"><button class="btn-primary" id="s6n">Continue to Competency Check</button></div>';
}

var AQ=[
  {q:'What creates a trend?',opts:['Indicators','Persistent directional structure','Economic news'],cor:'Persistent directional structure'},
  {q:'An upward trend contains:',opts:['Rising highs and rising lows','Flat highs and lows','Random swings'],cor:'Rising highs and rising lows'},
  {q:'A downward trend contains:',opts:['Falling highs and falling lows','Only lower highs','Only lower lows'],cor:'Falling highs and falling lows'}
];
var AR=[
  {exp:'A trend is created by persistent directional structure \u2014 not indicators, news, or rules.',top:'trend'},
  {exp:'An upward trend requires both rising highs and rising lows to confirm directional drift.',top:'uptrend'},
  {exp:'A downward trend requires both falling highs and falling lows to confirm directional drift.',top:'downtrend'}
];

function bS7(){
  if(ST.assess.submitted)return bResult();
  var qi=ST.assess.q,q=AQ[qi],ua=ST.assess.ans[qi];
  var has=ua!=null,last=qi===AQ.length-1;
  var h='<p class="scr-eyebrow">Section VII &mdash; Competency Check</p>';
  h+='<div class="assessment-prog">Question '+(qi+1)+' of '+AQ.length+'</div>';
  h+='<div class="assessment-q">'+eH(q.q)+'</div>';
  h+='<div id="aops">'+q.opts.map(function(o){return '<button class="opt-btn'+(ua===o?' selected':'')+'" data-ans="'+eA(o)+'">'+eH(o)+'</button>';}).join('')+'</div>';
  h+='<div class="btn-row">'+(last?'<button class="btn-primary" id="asub"'+(has?'':' disabled')+'>Submit Assessment</button>':'<button class="btn-primary" id="anxt"'+(has?'':' disabled')+'>Next</button>')+'</div>';
  if(!has)h+='<p style="font-size:.75rem;color:var(--m-muted);margin-top:.75rem">Select an answer to continue.</p>';
  return h;
}

function bResult(){
  var sc=ST.assess.score,ok=ST.assess.passed;
  var rb='<button class="btn-ghost" id="rrev" style="margin-top:.5rem">Review Answers</button>';
  if(ok){
    var h='<div class="result-box"><div style="font-size:2rem;color:var(--m-gold);margin-bottom:1rem">&#10003;</div>';
    h+='<div class="result-title">Competency <span class="result-gold">Verified</span></div>';
    h+='<div class="result-body">Trends are persistent directional structure &mdash; understood.<br><span style="color:var(--m-gold);font-size:.85rem">Score: '+sc+'%</span></div>';
    h+='<div style="display:flex;flex-direction:column;align-items:center;gap:.5rem"><button class="btn-primary" id="rret">Return to Market Structure</button>'+rb+'</div></div>';
    return h;
  }
  var h='<div class="result-box"><div style="font-size:2rem;color:var(--m-muted);margin-bottom:1rem">&#8635;</div>';
  h+='<div class="result-title">Review Recommended</div>';
  h+='<div class="result-body">Revisit the sections, then try again.<br><span style="color:var(--m-red-txt);font-size:.85rem">Score: '+sc+'%</span></div>';
  h+='<div class="btn-row" style="justify-content:center"><button class="btn-ghost" id="rret2">Retry Assessment</button></div>';
  h+='<div style="margin-top:.75rem;text-align:center">'+rb+'</div></div>';
  return h;
}

function bReview(){
  var rows=AQ.map(function(q,i){
    var ua=ST.assess.ans[i],ok=ua===q.cor,rv=AR[i];
    var ic=ok?'&#10003;':'&#10007;',icol=ok?'var(--m-green-txt)':'var(--m-red-txt)';
    var h='<div style="background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:6px;padding:1rem 1.1rem;margin-bottom:.85rem">';
    h+='<p style="font-size:.8rem;font-weight:600;color:var(--m-gold);margin-bottom:.6rem">Q'+(i+1)+'</p>';
    h+='<p style="font-size:.9rem;color:var(--m-txt);margin-bottom:.75rem;line-height:1.5">'+eH(q.q)+'</p>';
    h+='<p style="font-size:.82rem;margin-bottom:.3rem"><span style="color:'+icol+';font-weight:700;margin-right:.35rem">'+ic+'</span><span style="color:var(--m-muted)">Your answer:</span> <span style="color:var(--m-txt)">'+eH(ua||'(none)')+'</span></p>';
    h+='<p style="font-size:.82rem;color:var(--m-muted);margin-bottom:.75rem">Correct: <span style="color:var(--m-txt);font-weight:500">'+eH(q.cor)+'</span></p>';
    h+='<p style="font-size:.82rem;color:var(--m-muted);line-height:1.55;margin-bottom:.65rem">'+rv.exp+'</p>';
    h+='<button class="clarify-btn" data-topic="'+rv.top+'">Clarify</button></div>';
    return h;
  }).join('');
  return '<p class="scr-eyebrow">Section VII &mdash; Review Answers</p><h2 style="font-family:\'Outfit\',sans-serif;font-size:1.25rem;font-weight:600;color:var(--m-txt);margin-bottom:.9rem">Assessment Breakdown</h2>'+rows+'<div class="btn-row"><button class="btn-ghost" id="rrback">Back to Results</button></div>';
}

function score(){
  var c=0;AQ.forEach(function(q,i){if(ST.assess.ans[i]===q.cor)c++;});
  var p=Math.round((c/AQ.length)*100);
  ST.assess.score=p;ST.assess.passed=p>=67;ST.assess.submitted=true;
  if(ST.assess.passed){
    ST.verified=true;
    try{var sv=JSON.parse(localStorage.getItem('pp_ms_modules')||'{}');sv['3.4']={verified:true,mastery:p,mastery_percent:p,status:'Verified',progress:100};localStorage.setItem('pp_ms_modules',JSON.stringify(sv));}catch(e){}
  }
  updProg();
}"""

SCRIPT_RENDER = r"""
function render(){
  var c=document.getElementById('sc');c.innerHTML='';
  var s=ST.sid,h='';
  if(s===0)h=bEntry();
  else if(s===1)h=bS1();
  else if(s===2)h=bS2();
  else if(s===3)h=bS3();
  else if(s===4)h=bS4();
  else if(s===5)h=bS5();
  else if(s===6)h=bS6();
  else if(s===7)h=ST.review?bReview():bS7();
  c.innerHTML=h;
  c.scrollTop=0;document.getElementById('main-stage').scrollTop=0;
  requestAnimationFrame(function(){if(s===1)initS1();if(s===2)initS2();if(s===5)initSim();});
  handlers();
}

function handlers(){
  function on(id,fn){var e=document.getElementById(id);if(e)e.addEventListener('click',fn);}
  on('begin-btn',function(){goTo(1,0);});
  on('s1n',function(){goTo(2,0);});on('s2n',function(){goTo(3,0);});on('s3n',function(){goTo(4,0);});
  on('s4n',function(){goTo(5,0);});on('s5n',function(){goTo(6,0);});on('s6n',function(){goTo(7,0);});
  document.querySelectorAll('[data-ans]').forEach(function(b){
    b.addEventListener('click',function(){
      if(ST.assess.submitted)return;
      var qi=ST.assess.q;ST.assess.ans[qi]=ST.assess.ans[qi]===b.dataset.ans?null:b.dataset.ans;render();
    });
  });
  on('anxt',function(){if(ST.assess.ans[ST.assess.q]==null)return;ST.assess.q++;render();});
  on('asub',function(){if(ST.assess.ans[ST.assess.q]==null)return;score();render();});
  on('rret',function(){window.location.href='market-structure.html';});
  on('rret2',function(){ST.assess.ans=[null,null,null];ST.assess.submitted=false;ST.assess.score=null;ST.assess.passed=null;ST.assess.q=0;ST.review=false;render();});
  on('rrev',function(){if(ST.assess.submitted){ST.review=true;render();}});
  on('rrback',function(){ST.review=false;render();});
  document.querySelectorAll('.clarify-btn').forEach(function(b){b.addEventListener('click',function(){openClarify(b.dataset.topic);});});
}

(function(){ST.hist=[];ST.sid=0;ST.si=0;visit(0);renderNav();render();})();"""

TAIL = '''
</script>
</body>
</html>'''

content = (HEAD + BODY + SCRIPT_STATE + SCRIPT_CLARIFY + SCRIPT_SVG +
           SCRIPT_S1_S4 + SCRIPT_S5 + SCRIPT_S6_S7 + SCRIPT_RENDER + TAIL)

with open('module-3-4.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done! Lines:', content.count('\n'))
