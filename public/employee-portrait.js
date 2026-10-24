// Local procedural employee presentation. The SVG has no background surface,
// external image, camera capture or model inference; speech is caller-driven.
const NS='http://www.w3.org/2000/svg';
const SKIN=['#a66d4e','#d6a185','#70452f','#bb8666','#e0b89c','#895d44'];
const SUIT=['#354d66','#536d65','#3a414d','#887a64','#715c70','#546873'];
const HAIR=['#1b1817','#33251c','#615247','#898780'];
let serial=0;
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
function svg(tag,attributes={},text){const element=document.createElementNS(NS,tag);for(const [name,value]of Object.entries(attributes))element.setAttribute(name,String(value));if(text!==undefined)element.textContent=text;return element;}
function hash(value){let result=17;for(const letter of String(value))result=Math.imul(result,31)+letter.charCodeAt(0)|0;return result>>>0;}
function tint(color,amount){const bytes=color.slice(1).match(/../g).map(value=>parseInt(value,16));return '#'+bytes.map(value=>Math.round(value+(amount<0?value:255-value)*amount).toString(16).padStart(2,'0')).join('');}
function identity(employee){const id=String(employee?.id??employee?.name??'employee').slice(0,160),seed=hash(id);return {id,seed,skin:SKIN[seed%SKIN.length],suit:SUIT[seed%SUIT.length],hair:HAIR[seed%HAIR.length],glasses:seed%5===0,officer:id==='Johnson'||/\b(?:security|patrol|officer)\b/i.test(String(employee?.role||'').slice(0,200))};}

export function createEmployeePortrait({container,employee,onClose}={}){
 if(!container?.append)throw TypeError('A portrait container is required');
 let disposed=false,speaking=false,appearanceKey='',mouth=null,mouthAnimation=null,currentEmployee=null;
 const root=node('figure');root.className='employee-portrait';root.dataset.speaking='false';
 const image=svg('svg',{viewBox:'0 0 300 380',width:300,height:380,role:'img','aria-label':'Employee portrait',focusable:'false','data-employee-portrait-image':'true'});
 const caption=node('figcaption');caption.className='employee-portrait-caption';const name=node('strong'),role=node('span'),status=node('small');name.className='employee-portrait-name';role.className='employee-portrait-role';status.className='employee-portrait-status';status.setAttribute('role','status');caption.append(name,role,status);root.append(image,caption);
 if(typeof onClose==='function'){const close=node('button','×');close.type='button';close.className='employee-portrait-close';close.setAttribute('aria-label','Hide employee portrait');close.onclick=()=>{setVisible(false);onClose();};root.append(close);}
 container.append(root);
 const reduced=typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
 function paint(employee){
  const look=identity(employee),key=JSON.stringify(look);if(key===appearanceKey)return;appearanceKey=key;
  if(mouthAnimation)try{mouthAnimation.endElement();}catch{}
  image.replaceChildren();const prefix='hq-employee-face-'+(++serial),defs=svg('defs');
  const gradient=(id,from,to,x2='1',y2='1')=>{const element=svg('linearGradient',{id:prefix+'-'+id,x1:0,y1:0,x2,y2});element.append(svg('stop',{offset:0,'stop-color':from}),svg('stop',{offset:1,'stop-color':to}));defs.append(element);return 'url(#'+prefix+'-'+id+')';};
  const skin=gradient('skin',tint(look.skin,.18),tint(look.skin,-.12)),jacket=look.officer?'#1c3348':look.suit,suit=gradient('suit',tint(jacket,.1),tint(jacket,-.22)),hair=gradient('hair',tint(look.hair,.08),tint(look.hair,-.15));image.append(defs);
  image.dataset.employeeId=look.id;image.dataset.skin=look.skin;image.dataset.hair=look.hair;image.dataset.uniform=look.officer?'officer':'office';
  // Shoulders, shirt and lapels terminate at the lower edge without a backdrop.
  image.append(svg('path',{d:'M22 380 L29 311 Q33 286 69 277 L112 260 L188 260 L231 277 Q266 286 272 311 L279 380 Z',fill:suit}),svg('path',{d:'M112 260 L150 279 L188 260 L178 380 L122 380 Z',fill:'#f0f0e6'}));
  image.append(svg('path',{d:'M126 221 Q150 234 174 221 L178 266 Q166 283 150 284 Q134 283 122 266 Z',fill:skin}),svg('path',{d:'M125 235 Q151 252 176 235 L176 249 Q151 264 124 247 Z',fill:tint(look.skin,-.1),opacity:.55}));
  image.append(svg('path',{d:'M112 259 L149 284 L130 311 L106 279 Z',fill:'#fcfcf4',stroke:'#d2d9d3','stroke-width':1}),svg('path',{d:'M188 259 L151 284 L170 311 L194 279 Z',fill:'#e9eee6',stroke:'#cbd6d0','stroke-width':1}));
  if(!look.officer){image.append(svg('path',{d:'M145 285 L155 285 L162 306 L155 357 L149 365 L140 354 L141 306 Z',fill:'#18303b'}),svg('path',{d:'M109 262 L85 279 L102 301 L92 313 L128 380 L130 313 Z',fill:tint(jacket,-.08)}),svg('path',{d:'M191 262 L215 279 L198 301 L208 313 L172 380 L170 313 Z',fill:tint(jacket,.045)}),svg('path',{d:'M211 330 L242 330 L241 338 L213 338 Z',fill:tint(jacket,-.23)}));}
  else{image.append(svg('path',{d:'M90 272 L106 270 L102 298 L82 298 Z',fill:'#b1bdc6'}),svg('path',{d:'M194 270 L210 272 L218 298 L198 298 Z',fill:'#b1bdc6'}),svg('path',{d:'M149 287 L153 287 L157 380 L145 380 Z',fill:'#d6e1dd'}),svg('path',{d:'M216 311 L229 317 L226 337 L216 344 L206 337 L203 317 Z',fill:'#d4b466',stroke:'#eed598','stroke-width':1.5}),svg('path',{d:'M216 317 L219 324 L226 324 L221 329 L223 336 L216 332 L210 336 L212 329 L207 324 L214 324 Z',fill:'#fbdf8d'}));}
  // Ears sit behind the face; subtle tones keep the image readable on any page.
  for(const side of [-1,1])image.append(svg('ellipse',{cx:150+side*72,cy:150,rx:13,ry:23,fill:skin}),svg('path',{d:side<0?'M78 137 Q68 143 79 158':'M222 137 Q232 143 221 158',fill:'none',stroke:tint(look.skin,-.22),'stroke-width':3,'stroke-linecap':'round'}));
  image.append(svg('path',{d:'M79 119 C75 66 105 39 150 38 C195 39 225 66 221 119 L217 175 Q211 221 178 237 Q150 251 122 237 Q89 221 83 175 Z',fill:skin}),svg('path',{d:'M198 75 Q225 95 217 167 Q215 213 180 233 Q197 214 201 182 Q207 142 198 75 Z',fill:tint(look.skin,-.16),opacity:.37}),svg('path',{d:'M95 123 Q103 98 127 91',fill:'none',stroke:tint(look.skin,.2),'stroke-width':5,'stroke-linecap':'round',opacity:.5}));
  // Eye shapes, lids, pupils, brows and a nasal bridge are actual vector shapes.
  for(const side of [-1,1]){const x=150+side*28;image.append(svg('path',{d:'M'+(x-16)+' 141 Q'+x+' 126 '+(x+16)+' 140 Q'+x+' 149 '+(x-16)+' 141 Z',fill:'#f0ede3'}),svg('circle',{cx:x,cy:139,r:6,fill:'#293f3d'}),svg('circle',{cx:x,cy:139,r:3.3,fill:'#101d23'}),svg('circle',{cx:x-1.6,cy:137.2,r:1.2,fill:'#fff'}),svg('path',{d:'M'+(x-17)+' 140 Q'+x+' 128 '+(x+17)+' 140',fill:'none',stroke:tint(look.skin,-.4),'stroke-width':2.5,'stroke-linecap':'round'}),svg('path',{d:'M'+(x-17)+' 120 Q'+x+' 113 '+(x+17)+' 121',fill:'none',stroke:look.hair,'stroke-width':5,'stroke-linecap':'round'}),svg('path',{d:'M'+(x-13)+' 153 Q'+x+' 157 '+(x+13)+' 153',fill:'none',stroke:tint(look.skin,-.13),'stroke-width':1.4,opacity:.7}));}
  image.append(svg('path',{d:'M149 143 L143 173 Q150 180 158 173',fill:'none',stroke:tint(look.skin,-.27),'stroke-width':2.2,'stroke-linecap':'round'}),svg('path',{d:'M139 179 Q150 185 163 178',fill:'none',stroke:tint(look.skin,-.2),'stroke-width':1.3,'stroke-linecap':'round'}));
  mouth=svg('ellipse',{cx:150,cy:202,rx:14,ry:2,fill:'#623c34','data-portrait-mouth':'true'});mouthAnimation=svg('animate',{attributeName:'ry',values:'2;5;3;7;2',dur:'.55s',repeatCount:'indefinite',begin:'indefinite',fill:'remove'});mouth.append(mouthAnimation);image.append(mouth,svg('path',{d:'M131 200 Q150 208 169 200',fill:'none',stroke:tint(look.skin,-.3),'stroke-width':1.6,'stroke-linecap':'round'}),svg('path',{d:'M138 217 Q150 221 162 217',fill:'none',stroke:tint(look.skin,.12),'stroke-width':2,'stroke-linecap':'round'}));
  // The color and optional glasses match the meeting room's stable ID seed.
  image.append(svg('path',{d:'M79 126 Q70 87 88 62 Q110 27 153 29 Q198 27 216 64 Q229 88 220 125 L209 104 Q210 79 191 68 Q159 89 105 78 Q91 96 92 118 Z',fill:hair}),svg('path',{d:'M98 66 Q141 47 190 54',fill:'none',stroke:tint(look.hair,.18),'stroke-width':3,'stroke-linecap':'round',opacity:.6}));
  if(look.glasses){const glasses=svg('g',{fill:'none',stroke:'#a7b2ad','stroke-width':3.5,'stroke-linecap':'round'});glasses.append(svg('rect',{x:101,y:128,width:43,height:25,rx:8}),svg('rect',{x:156,y:128,width:43,height:25,rx:8}),svg('path',{d:'M144 137 Q150 133 156 137 M101 136 L83 131 M199 136 L217 131'}));image.append(glasses);}
  if(look.officer){image.append(svg('path',{d:'M77 88 L91 49 Q149 24 209 49 L223 88 Q150 106 77 88 Z',fill:'#1b3044'}),svg('path',{d:'M79 88 Q150 71 221 88 Q221 104 150 109 Q79 104 79 88 Z',fill:'#0d202e'}),svg('path',{d:'M150 49 L162 57 L158 75 L150 81 L142 75 L138 57 Z',fill:'#d7b868',stroke:'#ecd18e','stroke-width':1.5}));}
  applySpeaking();
 }
 function applySpeaking(){
  root.dataset.speaking=String(speaking);if(!mouth)return;
  try{mouthAnimation?.endElement();}catch{}
  mouth.setAttribute('ry',speaking?'3':'2');
  if(speaking&&!reduced?.matches&&!document.hidden&&root.isConnected&&!root.hidden)try{mouthAnimation?.beginElement();}catch{}
 }
 function setSpeaking(value){if(disposed)return;const next=value===true;if(next===speaking)return;speaking=next;applySpeaking();}
 function setVisible(value){if(disposed)return;root.hidden=value!==true||!currentEmployee;applySpeaking();}
 function update(employee,state={}){
  if(disposed)return;const next=employee&&typeof employee==='object'?employee:null,changed=identity(next).id!==identity(currentEmployee).id;currentEmployee=next;
  if(!next){root.hidden=true;setSpeaking(false);return;}
  if(changed){root.hidden=false;speaking=false;}
  const displayName=typeof next.name==='string'&&next.name.trim()?next.name.trim().slice(0,160):'Employee',displayRole=typeof next.role==='string'?next.role.trim().slice(0,180):'';
  name.textContent=displayName;role.textContent=displayRole;role.hidden=!displayRole;status.textContent=typeof state.status==='string'?state.status.slice(0,180):'';status.hidden=!status.textContent;image.setAttribute('aria-label',displayName+' · employee avatar');root.dataset.employeeId=identity(next).id;paint(next);
  if(typeof state.speaking==='boolean')setSpeaking(state.speaking);
 }
 const visibilityChanged=()=>applySpeaking();document.addEventListener('visibilitychange',visibilityChanged);reduced?.addEventListener?.('change',visibilityChanged);
 update(employee);
 return {update,setSpeaking,setVisible,dispose(){if(disposed)return;setSpeaking(false);disposed=true;document.removeEventListener('visibilitychange',visibilityChanged);reduced?.removeEventListener?.('change',visibilityChanged);root.remove();}};
}
