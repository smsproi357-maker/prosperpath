import re

# Read template module
with open("module-3-4.html", "r", encoding="utf-8") as f:
    text = f.read()

# Replace metadata
text = text.replace("Module 3.4 - Trends", "Module 3.5 - Pullbacks")
text = text.replace("Trends | ProsperPath", "Pullbacks | ProsperPath")
text = text.replace('id="topbar-title">Trends<', 'id="topbar-title">Pullbacks<')

# Extract top part (up to initGoogleAuth)
top_part = text[:text.find('var ST=')]

# Bottom part: keep closing tags
bottom_part = """(function(){ST.hist=[];ST.sid=0;ST.si=0;visit(0);renderNav();render();})();
</script>
</body>
</html>"""

# New internal JS logic
js_logic = """var ST={sid:0,si:0,visited:new Set(),lastSI:{},hist:[],
  assess:{ans:[null,null,null],submitted:false,score:null,passed:null,q:0},
  review:false,verified:false,
  sim:{task:0,done:false}};
var SECS=[
  {id:0,label:'Entry'},
  {id:1,label:'Section I \u2014 Impulse and Pullback'},
  {id:2,label:'Section II \u2014 Why Pullbacks Form'},
  {id:3,label:'Section III \u2014 Pullbacks Inside Trends'},
  {id:4,label:'Section IV \u2014 Pullback Completion'},
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
}
var CD={
  impulse:{
    term:'Impulse Move',
    explanation:'The phase of a trend that expands the structure in the direction of the trend. In an upward trend, the impulse moves price from a Higher Low to a new Higher High.',
    example:'If price rises from a low of $100 up to $150, breaking previous highs, that strong directional expansion is the impulse.',
    misc:'<strong>"Impulses are the only important parts."</strong> Impulses create the size of the trend, but pullbacks create the structure that sustains it.'
  },
  pullback:{
    term:'Pullback',
    explanation:'A temporary structural retracement against the primary trend direction. It forms the higher lows in an uptrend, or lower highs in a downtrend.',
    example:'After an impulse to $150, price drifts down to $130. This temporary downward phase before the next leg up is the pullback.',
    misc:'<strong>"A pullback means the trend is reversing."</strong> A pullback is a normal, required phase of a trend. It only becomes a reversal if it breaks the structural sequence.'
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
function eA(s){return String(s).replace(/"/g,'&quot;');}

var VW=600,VH=220;
function ln(pts,st,w,da){
  var d='M'+pts.map(function(p){return p.x+','+p.y;}).join(' L');
  return '<path d="'+d+'" stroke="'+st+'" stroke-width="'+w+'" fill="none" stroke-dasharray="'+da+'" stroke-linejoin="round" stroke-linecap="round"/>';
}
function dot(x,y,r,f,s,sw){return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+f+'" stroke="'+s+'" stroke-width="'+sw+'"/>';}
function lbl(x,y,t,sz,f,dy){return '<text x="'+x+'" y="'+(y+(dy||0))+'" text-anchor="middle" font-size="'+sz+'" font-family="Inter,sans-serif" fill="'+f+'" font-weight="600" letter-spacing="0.06em">'+t+'</text>';}
function grid(w,h,step,c){var s='',y=step;while(y<h){s+='<line x1="0" y1="'+y+'" x2="'+w+'" y2="'+y+'" stroke="'+c+'" stroke-width="1"/>';y+=step;}return s;}
var GL=grid(VW,VH,40,'rgba(255,255,255,0.025)');

var IMP_C = 'rgba(195,162,70,0.65)';
var IMP_W = 2.2;
var PB_C = 'rgba(160,130,80,0.38)';
var PB_W = 1.4;

var N_IMP = 'rgba(200,185,130,0.92)';
var N_PB = 'rgba(200,185,130,0.65)';
var N_STR = 'rgba(200,185,130,0.28)';

var FULL_T = [{x:60,y:170},{x:140,y:100},{x:220,y:140},{x:320,y:60},{x:400,y:105},{x:520,y:30}];
var LBLS = ['HL','HH','HL','HH','HL','HH'];

function bEntry(){
  var h='<div style="text-align:center;padding:2rem 0">';
  h+='<p class="scr-eyebrow">ProsperPath &mdash; Market Structure</p>';
  h+='<h1 class="scr-h1">Pullbacks</h1>';
  h+='<p class="scr-body" style="max-width:320px;margin:0 auto 1rem">Trends do not move in straight lines.<br>They move through impulses and pullbacks.</p>';
  h+='<p class="scr-meta">Beginner &bull; Market Structure</p>';
  h+='<button class="btn-primary" id="begin-btn">Begin Module</button>';
  h+='</div>';
  return h;
}

function bS1(){
  var pts=FULL_T.slice(1,4); // HH, HL, HH
  var d1=ln([pts[0],pts[1]],PB_C,PB_W,'6,5');
  var d2=ln([pts[1],pts[2]],IMP_C,IMP_W,'0');
  
  var ng=pts.map(function(p,i){
    var isH=(i===0||i===2);
    var fillc = isH?N_IMP:N_PB;
    var lt = isH?lbl(p.x,p.y-14,LBLS[i+1],9,'rgba(224,225,227,0.72)'):lbl(p.x,p.y+20,LBLS[i+1],9,'rgba(224,225,227,0.72)');
    return '<g style="opacity:0;transition:opacity 0.4s ease '+(i*400)+'ms" class="s1o">'+dot(p.x,p.y,6,fillc,N_STR,1.5)+lt+'</g>';
  }).join('');
  
  var l1='<g style="opacity:0;transition:opacity 0.4s ease 1300ms" class="s1o">'+d1+'</g>';
  var l2='<g style="opacity:0;transition:opacity 0.4s ease 1700ms" class="s1o">'+d2+'</g>';
  
  var svg='<svg viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none">'+GL+l1+l2+ng+'</svg>';
  var h='<p class="scr-eyebrow">Section I &mdash; Impulse and Pullback</p>';
  h+='<div class="chart-box">'+svg+'</div>';
  h+='<div class="scr-body" style="margin-top:.9rem;text-align:center"><p>Trends move through two phases.</p><p><strong>Impulse moves</strong> expand the trend.<br><strong>Pullbacks</strong> temporarily move against it.</p></div>';
  h+='<div class="btn-row"><button class="btn-primary" id="s1n">Continue to Section II</button></div>';
  return h;
}

function initS1(){ setTimeout(function(){ document.querySelectorAll('.s1o').forEach(e=>e.style.opacity='1'); },40); }

function bS2(){
  // strong move up -> price slows -> retracement
  var pts=[{x:80,y:180},{x:240,y:60},{x:310,y:60},{x:440,y:120}];
  var l1=ln([pts[0],pts[1]],IMP_C,IMP_W,'0');
  var l2=ln([pts[1],pts[2]],PB_C,PB_W,'2,4');
  var l3=ln([pts[2],pts[3]],PB_C,PB_W,'6,5');
  
  var ng=pts.map(function(p,i){
      var lb = i===0?'HL':i===1?'SH':i===2?'Sluggish':i===3?'HL':'';
      var dy = i===0||i===3?20:-14;
      return dot(p.x,p.y,5,N_PB,N_STR,1)+lbl(p.x,p.y,lb,8,'rgba(224,225,227,0.5)',dy);
  }).join('');
  var svg='<svg viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none">'+GL+l1+l2+l3+ng+'</svg>';
  
  var h='<p class="scr-eyebrow">Section II &mdash; Why Pullbacks Form</p>';
  h+='<div class="chart-box">'+svg+'</div>';
  h+='<div class="scr-body" style="margin-top:.9rem;text-align:center"><p>After strong moves, price often retraces.</p><p>These retracements help the trend continue forming structure.</p></div>';
  h+='<div class="btn-row"><button class="btn-primary" id="s2n">Continue to Section III</button></div>';
  return h;
}

function bS3(){
  var segs = '';
  for(var i=0;i<FULL_T.length-1;i++){
    var isImp = i%2===0;
    segs+=ln([FULL_T[i],FULL_T[i+1]], isImp?IMP_C:PB_C, isImp?IMP_W:PB_W, isImp?'0':'6,5');
  }
  var ng=FULL_T.map(function(p,i){
    var isH=(i%2===1);
    var dy = isH?-14:20;
    return dot(p.x,p.y,6,isH?N_IMP:N_PB,N_STR,1.5)+lbl(p.x,p.y,LBLS[i],9,'rgba(224,225,227,0.72)',dy);
  }).join('');
  var svg='<svg viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none">'+GL+segs+ng+'</svg>';

  var h='<p class="scr-eyebrow">Section III &mdash; Pullbacks Inside Trends</p>';
  h+='<div class="chart-box">'+svg+'</div>';
  h+='<div class="scr-body" style="margin-top:.9rem;text-align:center"><p>Pullbacks create the higher lows and lower highs that form trends.</p></div>';
  h+='<div class="btn-row"><button class="btn-primary" id="s3n">Continue to Section IV</button></div>';
  return h;
}

function bS4(){
  var pts = FULL_T.slice(1,4); // HH, HL, HH
  var d1 = ln([pts[0],pts[1]],PB_C,PB_W,'6,5');
  var n0 = dot(pts[0].x,pts[0].y,6,N_IMP,N_STR,1.5)+lbl(pts[0].x,pts[0].y,'HH',9,'rgba(224,225,227,0.72)',-14);
  var svg='<svg id="s4svg" viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">'+GL+d1+n0+'</svg>';
  
  var h='<p class="scr-eyebrow">Section IV &mdash; Pullback Completion</p>';
  h+='<div id="s4w" style="position:relative;margin:0 0 .85rem;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px">'+svg+'</div>';
  h+='<div id="s4q" class="scr-body" style="margin-top:.9rem;text-align:center;min-height:3rem"><p style="color:var(--m-gold)">What does the pullback form?</p></div>';
  h+='<div class="btn-row"><button class="btn-primary" id="s4rev" onclick="s4Reveal()">Reveal</button><button class="btn-primary" id="s4n" style="display:none">Continue to Section V</button></div>';
  return h;
}
function s4Reveal(){
  document.getElementById('s4rev').style.display='none';
  document.getElementById('s4q').innerHTML='<p>Higher Low</p><p style="margin-top:.5rem">Pullbacks often complete into continuation.</p>';
  document.getElementById('s4n').style.display='inline-block';
  
  var ns='http://www.w3.org/2000/svg';
  var w=document.getElementById('s4svg');
  if(!w)return;
  var pts = FULL_T.slice(1,4);
  var p1=document.createElementNS(ns,'g');
  p1.innerHTML=dot(pts[1].x,pts[1].y,6,N_PB,N_STR,1.5)+lbl(pts[1].x,pts[1].y,'HL',9,'rgba(224,225,227,0.72)',20);
  p1.style.opacity='0';p1.style.transition='opacity .3s';
  w.appendChild(p1);
  
  var l2=document.createElementNS(ns,'path');
  l2.setAttribute('d','M'+pts[1].x+','+pts[1].y+' L'+pts[2].x+','+pts[2].y);
  l2.setAttribute('stroke',IMP_C);l2.setAttribute('stroke-width',IMP_W);l2.setAttribute('fill','none');
  l2.style.opacity='0';l2.style.transition='opacity .3s';
  w.appendChild(l2);
  
  var p2=document.createElementNS(ns,'g');
  p2.innerHTML=dot(pts[2].x,pts[2].y,6,N_IMP,N_STR,1.5)+lbl(pts[2].x,pts[2].y,'HH',9,'rgba(224,225,227,0.72)',-14);
  p2.style.opacity='0';p2.style.transition='opacity .3s';
  w.appendChild(p2);
  
  setTimeout(()=>p1.style.opacity='1',100);
  setTimeout(()=>l2.style.opacity='1',600);
  setTimeout(()=>p2.style.opacity='1',900);
}

function bS5(){
  var task=ST.sim.task;
  if(ST.sim.done){
    var h='<p class="scr-eyebrow">Section V &mdash; Recognition Simulation</p>';
    h+='<div style="text-align:center;padding:1.5rem 0"><div style="font-size:1.4rem;color:var(--m-green-txt);margin-bottom:.75rem">&#10003;</div>';
    h+='<p style="font-family:\'Outfit\',sans-serif;font-size:1.1rem;font-weight:600;color:var(--m-txt);margin-bottom:.4rem">Pullback identified.</p>';
    h+='<p class="scr-body" style="max-width:360px;margin:0 auto">You can identify pullback phases and predict how they result in trend continuation.</p></div>';
    h+='<div class="btn-row" style="justify-content:center"><button class="btn-primary" id="s5n">Continue to Section VI</button></div>';
    return h;
  }
  
  var h='<p class="scr-eyebrow">Section V &mdash; Recognition Simulation</p>';
  var pts = FULL_T.slice(0,4); // HL, HH, HL, HH
  
  if(task===0){
    var segs = ln([pts[0],pts[1]],IMP_C,IMP_W,'0') + ln([pts[1],pts[2]],PB_C,PB_W,'6,5') + ln([pts[2],pts[3]],IMP_C,IMP_W,'0');
    var ng=pts.map((p,i)=>dot(p.x,p.y,6,i%2===1?N_IMP:N_PB,N_STR,1.5)+lbl(p.x,p.y,LBLS[i],9,'#cfd0d2',i===1||i===3?-14:20)).join('');
    var svg='<svg id="s5svg" viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">'+GL+segs+ng+'</svg>';
    
    h+='<div class="sim-task"><div class="task-label">Task 1 of 3</div>Tap the pullback area.</div>';
    h+='<div id="s5w" style="position:relative;margin:0 0 .85rem;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px;cursor:crosshair">'+svg+'</div>';
    h+='<div class="sim-fb" id="sfb"></div>';
  } else if(task===1){
    // Highlighted segment: pts[1] to pts[2] (HH to HL = Pullback)
    var segs = ln([pts[0],pts[1]],'rgba(195,162,70,0.2)',IMP_W,'0') + ln([pts[1],pts[2]],'rgba(255,255,255,0.9)',2.5,'0') + ln([pts[2],pts[3]],'rgba(195,162,70,0.2)',IMP_W,'0');
    var ng=pts.map((p,i)=>dot(p.x,p.y,6,i%2===1?N_IMP:N_PB,N_STR,1.5)+lbl(p.x,p.y,LBLS[i],9,'#cfd0d2',i===1||i===3?-14:20)).join('');
    var svg='<svg id="s5svg" viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">'+GL+segs+ng+'</svg>';
    
    h+='<div class="sim-task"><div class="task-label">Task 2 of 3</div>Is the highlighted segment an impulse or a pullback?</div>';
    h+='<div id="s5w" style="position:relative;margin:0 0 .85rem;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px">'+svg+'</div>';
    h+='<div class="dir-btns"><button class="dir-btn" onclick="doPick(\'impulse\')">Impulse</button><button class="dir-btn" onclick="doPick(\'pullback\')">Pullback</button></div>';
    h+='<div class="sim-fb" id="sfb"></div>';
  } else if (task===2){
    var segs = ln([pts[0],pts[1]],IMP_C,IMP_W,'0') + ln([pts[1],pts[2]],PB_C,PB_W,'6,5');
    var ng=pts.slice(0,3).map((p,i)=>dot(p.x,p.y,6,i%2===1?N_IMP:N_PB,N_STR,1.5)+lbl(p.x,p.y,LBLS[i],9,'#cfd0d2',i===1?-14:20)).join('');
    var svg='<svg id="s5svg" viewBox="0 0 '+VW+' '+VH+'" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">'+GL+segs+ng+'</svg>';
    
    h+='<div class="sim-task"><div class="task-label">Task 3 of 3</div>What structure is most likely to form next?</div>';
    h+='<div id="s5w" style="position:relative;margin:0 0 .85rem;background:var(--m-surf2);border:1px solid var(--m-bdr);border-radius:4px;overflow:hidden;height:220px">'+svg+'</div>';
    h+='<div class="dir-btns"><button class="dir-btn" onclick="doPred(\'hh\')">Higher High</button><button class="dir-btn" onclick="doPred(\'hl\')">Higher Low</button><button class="dir-btn" onclick="doPred(\'ll\')">Lower Low</button></div>';
    h+='<div class="sim-fb" id="sfb"></div>';
  }
  return h;
}

function doPick(ans){
  var fb=document.getElementById('sfb');
  if(ans==='pullback'){
    if(fb){fb.className='sim-fb ok';fb.textContent='Correct. Moving against the primary trend to form a higher low is a pullback.';}
    setTimeout(function(){ST.sim.task=2;render();},1100);
  }else{
    if(fb){fb.className='sim-fb err';fb.textContent='Not quite. An impulse expands the trend. This is retracing.';}
    setTimeout(()=>fb.textContent='',1500);
  }
}

function doPred(ans){
  var fb=document.getElementById('sfb');
  if(ans==='hl'){
    if(fb){fb.className='sim-fb ok';fb.textContent='Correct. Pullbacks often form higher lows before continuation.';}
    document.querySelectorAll('.dir-btn').forEach(b=>b.disabled=true);
    
    var w=document.getElementById('s5svg');
    if(w){
      var ns='http://www.w3.org/2000/svg';
      // Anim to next HH
      var l=document.createElementNS(ns,'path');
      l.setAttribute('d','M'+FULL_T[2].x+','+FULL_T[2].y+' L'+FULL_T[3].x+','+FULL_T[3].y);
      l.setAttribute('stroke',IMP_C);l.setAttribute('stroke-width',IMP_W);l.setAttribute('fill','none');
      l.style.opacity='0';l.style.transition='opacity .3s';
      w.appendChild(l);
      
      var n=document.createElementNS(ns,'g');
      n.innerHTML=dot(FULL_T[3].x,FULL_T[3].y,6,N_IMP,N_STR,1.5)+lbl(FULL_T[3].x,FULL_T[3].y,'HH',9,'#cfd0d2',-14);
      n.style.opacity='0';n.style.transition='opacity .3s';
      w.appendChild(n);
      
      setTimeout(()=>l.style.opacity='1',300);
      setTimeout(()=>n.style.opacity='1',500);
    }
    setTimeout(function(){ST.sim.done=true;render();},1800);
  }else{
    if(fb){fb.className='sim-fb err';fb.textContent='Not quite. During a pullback in an uptrend, a higher low is the expected completion point.';}
    setTimeout(()=>fb.textContent='',1800);
  }
}

function initSim(){
  if(ST.sim.task!==0)return;
  var w=document.getElementById('s5w');if(!w)return;
  var pts = FULL_T.slice(0,4);
  var tgt = {x: (pts[1].x+pts[2].x)/2, y: (pts[1].y+pts[2].y)/2};
  
  function cl(e){
    var r=w.getBoundingClientRect();
    var vx=(e.clientX-r.left)/r.width*VW, vy=(e.clientY-r.top)/r.height*VH;
    var fb=document.getElementById('sfb');
    // Distance to center of the line segment
    if(Math.hypot(vx-tgt.x, vy-tgt.y)<50 || (vx>pts[1].x-10 && vx<pts[2].x+10)){
      if(fb){fb.className='sim-fb ok';fb.textContent='Correct \u2014 you selected the pullback segment.';}
      w.removeEventListener('click',cl);
      setTimeout(function(){ST.sim.task=1;render();},1100);
    }else{
      if(fb){fb.className='sim-fb err';fb.textContent='Not quite \u2014 tap the phase moving against the trend.';}
    }
  }
  w.addEventListener('click',cl);
}

function bS6(){
  return '<p class="scr-eyebrow">Section VI &mdash; Principle</p><div class="principle-card"><p class="principle-text">Trends move through impulses and pullbacks.</p></div><div class="btn-row"><button class="btn-primary" id="s6n">Continue to Competency Check</button></div>';
}

var AQ=[
  {q:'What forms higher lows in an uptrend?',opts:['Pullbacks','Indicators','News events'],cor:'Pullbacks'},
  {q:'What phase moves with the trend direction?',opts:['Impulse','Pullback','Reversal'],cor:'Impulse'},
  {q:'Pullbacks typically occur after:',opts:['Impulse moves','Random movement','Trend reversals'],cor:'Impulse moves'}
];
var AR=[
  {exp:'Pullbacks temporarily retrace against the trend, forming the higher lows before continuation.',top:'pullback'},
  {exp:'An impulse move expands the structure in the direction of the primary trend.',top:'impulse'},
  {exp:'After a strong impulse move, price typically retraces in a pullback to establish structural footing.',top:'pullback'}
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
    h+='<div class="result-body">Trends move through impulses and pullbacks.<br><span style="color:var(--m-gold);font-size:.85rem">Score: '+sc+'%</span></div>';
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
    try{var sv=JSON.parse(localStorage.getItem('pp_ms_modules')||'{}');sv['3.5']={verified:true,mastery:p,mastery_percent:p,status:'Verified',progress:100};localStorage.setItem('pp_ms_modules',JSON.stringify(sv));}catch(e){}
  }
  updProg();
}
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
  requestAnimationFrame(function(){if(s===1)initS1();if(s===5)initSim();});
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
"""

final = top_part + js_logic + bottom_part

with open("module-3-5.html", "w", encoding="utf-8") as f:
    f.write(final)

print("module-3-5.html generated effectively!")
