// Optional public-address receipts and an honest illustration of recorded work.
// No wallet keys, mining process, email transport or background game is present.
const make=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const action=(text,handler)=>{const element=make('button',text);element.type='button';element.onclick=handler;return element;};
const NS='http://www.w3.org/2000/svg';
function svg(tag,attributes={},text){const element=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));if(text!==undefined)element.textContent=text;return element;}
const when=value=>Number.isFinite(value)&&value>0?new Date(value).toLocaleString():'No successful check yet';
const btc=value=>Number.isSafeInteger(value)&&value>=0?(value/100000000).toFixed(8)+' BTC':'Not observed';
function receiptSource(raw){try{const value=new URL(raw);return value.origin==='https://mempool.space'&&/^\/api\/address\/[A-Za-z0-9]+$/.test(value.pathname)&&!value.search&&!value.hash?value.href:null;}catch{return null;}}

export function createTechOffice({container,getState,onRefresh,onConfigure,onDisconnect}){
 let disposed=false,busy=false,frame=null,departure=null,gameTimer=null,gameStarted=0,gameCards=[],gameSelected=[],gameMatches=0,gameMoves=0;
 const root=make('div');root.className='tech-office-workspace';root.dataset.techOffice='ready';
 const intro=make('p','Real saved receipts stay here. The equipment is an illustration; it does not mine Bitcoin or send email.');
 const live=make('p');live.setAttribute('role','status');live.id='tech-room-status';
 const artwork=svg('svg',{viewBox:'0 0 900 340',width:'100%',height:300,role:'img','aria-label':'Illustrated technology room and dispatch dock'});
 const defs=svg('defs');const metal=svg('linearGradient',{id:'hq-tech-metal',x1:0,x2:1});metal.append(svg('stop',{offset:0,'stop-color':'#233b4a'}),svg('stop',{offset:.48,'stop-color':'#6b8490'}),svg('stop',{offset:1,'stop-color':'#1b303d'}));defs.append(metal);artwork.append(defs);
 artwork.append(svg('rect',{x:0,y:0,width:900,height:340,rx:20,fill:'#0b1822'}),svg('path',{d:'M0 262 L900 262 L900 340 L0 340Z',fill:'#142b36'}),svg('path',{d:'M0 262 L900 262 M450 262 L420 340 M650 262 L710 340 M220 262 L130 340',stroke:'#34505c','stroke-width':1}),svg('text',{x:28,y:35,fill:'#b6d6da','font-size':13,'font-family':'sans-serif','letter-spacing':3},'TECH ROOM / DISPATCH'));
 const racks=svg('g');for(let rack=0;rack<2;rack++){const x=30+rack*92;racks.append(svg('rect',{x,y:70,width:78,height:175,rx:6,fill:'url(#hq-tech-metal)',stroke:'#8ba0a5','stroke-opacity':.3}));for(let slot=0;slot<7;slot++){racks.append(svg('rect',{x:x+7,y:80+slot*22,width:64,height:17,rx:2,fill:'#0b1720'}),svg('circle',{cx:x+17,cy:88+slot*22,r:2,fill:'#5e9eaa'}),svg('path',{d:`M${x+28} ${87+slot*22} h30 M${x+28} ${91+slot*22} h30`,stroke:'#3e626e','stroke-width':1}));}}artwork.append(racks);
 // This machine remains visibly stationary: no false generation/mining cycle.
 const printer=svg('g');printer.append(svg('path',{d:'M242 120 L353 104 L399 127 L399 242 L285 258 L242 234Z',fill:'#254451',stroke:'#65818a'}),svg('path',{d:'M242 120 L285 140 L399 127 M285 140 L285 258',fill:'none',stroke:'#81989b'}),svg('rect',{x:296,y:151,width:87,height:68,rx:4,fill:'#071620',stroke:'#40606c'}),svg('path',{d:'M307 160 h65 M340 160 v35 M314 210 h51',stroke:'#6a8790','stroke-width':3}),svg('circle',{cx:340,cy:197,r:11,fill:'#a98542',stroke:'#d0b26c'}),svg('text',{x:340,y:202,'text-anchor':'middle',fill:'#f0dba1','font-size':15},'₿'),svg('text',{x:319,y:282,'text-anchor':'middle',fill:'#acc2c7','font-size':12,'font-family':'sans-serif'},'DISPLAY ONLY · NO MINER'));artwork.append(printer);
 artwork.append(svg('rect',{x:452,y:70,width:415,height:174,rx:5,fill:'#08141b',stroke:'#4a626b'}),svg('path',{d:'M457 106 h405 M457 135 h405 M457 164 h405 M457 193 h405',stroke:'#1c3540','stroke-width':2}),svg('text',{x:474,y:93,fill:'#9cb8c0','font-size':12,'font-family':'sans-serif'},'OUTREACH DISPATCH · OWNER-REPORTED SENDS'));
 const parcelGroup=svg('g');artwork.append(parcelGroup);
 const worker=svg('g',{transform:'translate(510 211)'});worker.append(svg('circle',{cx:0,cy:-31,r:9,fill:'#b78966'}),svg('path',{d:'M-11 -17 Q0 -23 11 -17 L15 14 L-15 14Z',fill:'#42758a'}),svg('path',{d:'M-8 14 L-10 37 M8 14 L12 37 M-10 -13 L-22 3 M11 -13 L25 1',stroke:'#587785','stroke-width':7,'stroke-linecap':'round'}));artwork.append(worker);
 const truck=svg('g',{'data-tech-truck':'parked',transform:'translate(600 205)'});truck.append(svg('rect',{x:0,y:0,width:135,height:59,rx:4,fill:'#c6d3d3'}),svg('path',{d:'M135 17 H171 L194 38 V65 H135Z',fill:'#2c8190'}),svg('path',{d:'M145 22 H166 L179 37 H145Z',fill:'#153440'}),svg('rect',{x:11,y:10,width:110,height:33,rx:4,fill:'#e4ece8'}),svg('text',{x:66,y:32,'text-anchor':'middle',fill:'#284f5a','font-size':12,'font-family':'sans-serif'},'SAVED OUTREACH'),svg('circle',{cx:30,cy:65,r:13,fill:'#07141c',stroke:'#84959b','stroke-width':4}),svg('circle',{cx:166,cy:65,r:13,fill:'#07141c',stroke:'#84959b','stroke-width':4}));artwork.append(truck);
 const dockStatus=svg('text',{x:474,y:315,fill:'#a7c4c9','font-size':12,'font-family':'sans-serif'},'Truck parked · waiting for a newly recorded introduction');artwork.append(dockStatus);
 root.append(intro,artwork,live);

 const monitor=make('section');monitor.append(make('h3','Bitcoin public-address receipts'));
 const mining=make('p','No miner connected · Hashrate unavailable');mining.id='tech-mining-status';
 const address=make('p'),totals=make('p'),checked=make('p'),source=make('a','View the observed source');source.target='_blank';source.rel='noopener noreferrer';
 const monitorNotice=make('p'),controls=make('div'),refresh=action('Check public receipts',()=>void run(onRefresh,'Checking the public address source…')),disconnect=action('Disconnect address',()=>void run(onDisconnect,'Disconnecting public-address lookups…'));disconnect.className='secondary-button';controls.append(refresh,disconnect);
 const config=make('details');config.append(make('summary','Connect or change a public payout address'));
 const form=make('form');form.id='tech-bitcoin-form';const addressLabel=make('label','Public mainnet Bitcoin address'),addressInput=make('input');addressInput.name='address';addressInput.maxLength=90;addressInput.required=true;addressInput.autocomplete='off';addressInput.placeholder='Public receiving address only';addressLabel.append(addressInput);
 const consentLabel=make('label'),consent=make('input');consent.type='checkbox';consent.name='consent';consentLabel.className='media-consent';consentLabel.append(consent,document.createTextNode('Share this public address with mempool.space to look up on-chain totals.'));
 const save=make('button','Save public address');form.append(addressLabel,make('p','Never enter a private key, seed phrase or wallet password. Received coins do not prove mining income or ownership.'),consentLabel,save);config.append(form);
 form.onsubmit=event=>{event.preventDefault();if(!consent.checked){live.textContent='Confirm the public-address lookup before saving.';return;}void run(async()=>{await onConfigure({address:addressInput.value.trim(),consent:true});addressInput.value='';consent.checked=false;config.open=false;},'Saving this public address…');};
 monitor.append(mining,address,totals,checked,source,monitorNotice,controls,config);root.append(monitor);

 const dock=make('details');dock.append(make('summary','What the loading dock means'));const dockCounts=make('p'),dockExplanation=make('p','The packets represent saved unsent drafts. A truck departure appears only when a new “Introduction sent” result is recorded by the owner while this room is open. This app does not send the email or verify delivery. Reopening the room and ordinary refreshes do not create another departure.');dock.append(dockCounts,dockExplanation);root.append(dock);
 const game=make('details');game.append(make('summary','Take a short break · offline memory game'));const gameNotice=make('p','A small matching game runs only in this open room. It does not mine Bitcoin, make money, train your agents or connect to the internet.');const gameStatus=make('p','Match six pairs. Take a break when you need one.'),gameBoard=make('div');gameBoard.id='tech-memory-board';gameBoard.setAttribute('role','group');gameBoard.setAttribute('aria-label','Memory matching cards');game.append(gameNotice,action('Start a fresh game',startGame),gameStatus,gameBoard);root.append(game);
 container.replaceChildren(root);
 const sizeArtwork=()=>{if(!disposed){const width=artwork.getBoundingClientRect().width;if(width>0)artwork.setAttribute('height',String(Math.round(width*340/900)));}};
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(sizeArtwork):null;resize?.observe(container);window.addEventListener('resize',sizeArtwork);sizeArtwork();

 const company=getState()?.company;const companyScope=String(company?.id||company?.name||'local-office');let storageKey='hq-tech-dispatch-v1:'+companyScope;
 let savedIds=[];try{const value=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(value))savedIds=value.filter(id=>typeof id==='string').slice(-400);}catch{}
 const seen=new Set(savedIds),initial=getState()?.outcomes?.events||[];for(const event of initial)if(typeof event.id==='string')seen.add(event.id);remember();
 function remember(){while(seen.size>400)seen.delete(seen.values().next().value);try{sessionStorage.setItem(storageKey,JSON.stringify([...seen]));}catch{/* Disabled storage must not block business records. */}}
 function visible(){return !disposed&&container.isConnected&&!document.hidden&&(!container.closest('dialog')||container.closest('dialog').open)&&container.getClientRects().length>0;}
 function stopDeparture(){if(frame!==null)cancelAnimationFrame(frame);frame=null;departure=null;truck.setAttribute('transform','translate(600 205)');truck.dataset.techTruck='parked';}
 function animateDeparture(event){
  stopDeparture();if(!visible())return;
  live.textContent='Owner recorded an introduction sent to '+String(event.company||'a saved company')+'. Email delivery is not independently verified.';
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){dockStatus.textContent='Introduction recorded · departure acknowledged without animation';return;}
  departure={started:performance.now()};truck.dataset.techTruck='departing';dockStatus.textContent='Owner reported an introduction sent · illustrative departure';
  const tick=now=>{frame=null;if(!departure||!visible()){stopDeparture();return;}const progress=Math.min(1,(now-departure.started)/3200);truck.setAttribute('transform','translate('+(600+360*progress*progress)+' 205)');if(progress<1)frame=requestAnimationFrame(tick);else{stopDeparture();dockStatus.textContent='Introduction recorded · truck parked for the next reported send';}};frame=requestAnimationFrame(tick);
 }
 async function run(fn,message){if(disposed||busy)return;busy=true;live.textContent=message;setBusy();try{await fn();if(!disposed){live.textContent='Saved. The monitor shows the latest available receipt status.';update();}}catch(error){if(!disposed)live.textContent=error?.message||'This action needs attention. Your saved records remain intact.';}finally{busy=false;if(!disposed)setBusy();}}
 function setBusy(){const state=getState()?.bitcoin||{};refresh.disabled=busy||!state.configured||!!state.nextCheckAt&&state.nextCheckAt>Date.now();disconnect.disabled=busy||!state.configured;save.disabled=busy;}
 function update(){
  if(disposed)return;const state=getState()||{},bitcoin=state.bitcoin||{},receipt=bitcoin.observation;
  mining.textContent='No miner connected · Hashrate unavailable';address.textContent=bitcoin.configured?'Public address: '+bitcoin.address:'No public address connected. This optional monitor is off.';
  totals.textContent=receipt?'Confirmed balance: '+btc(receipt.confirmedBalanceSats)+' · Total received: '+btc(receipt.confirmedReceivedSats)+' · Transactions: '+receipt.confirmedTransactions:'No on-chain totals have been observed. Unknown values stay unknown.';
  checked.textContent='Source status: '+(bitcoin.status||'Not configured')+' · Last successful check: '+when(receipt?.checkedAt)+(bitcoin.nextCheckAt&&bitcoin.nextCheckAt>Date.now()?' · Next eligible check: '+when(bitcoin.nextCheckAt):'');
  const link=receiptSource(receipt?.sourceUrl);source.hidden=!link;if(link)source.href=link;else source.removeAttribute('href');
  monitorNotice.textContent=bitcoin.error||bitcoin.notice||'Public address lookups are optional. No mining or spending permission is enabled.';setBusy();
  const drafts=Array.isArray(state.drafts)?state.drafts:Array.isArray(state.drafts?.drafts)?state.drafts.drafts:[];const packets=drafts.filter(item=>!['Sent','Cancelled','Declined'].includes(item.status)).length;
  const events=Array.isArray(state.outcomes?.events)?state.outcomes.events:[],introductions=events.filter(item=>item.type==='intro_sent'&&!item.void);
  dockCounts.textContent=packets+' saved draft'+(packets===1?'':'s')+' in the available draft view · '+(state.outcomes?.metrics?.introSent??introductions.length)+' active owner-reported introductions. Drafts and introductions are not revenue.';
  parcelGroup.replaceChildren();for(let index=0;index<Math.min(packets,6);index++){const x=469+index%3*23,y=244-Math.floor(index/3)*19;parcelGroup.append(svg('rect',{x,y:y-17,width:19,height:17,fill:'#a88e60',stroke:'#d7c399','stroke-width':1}),svg('path',{d:`M${x+9} ${y-17} v17`,stroke:'#d7c399','stroke-width':2}));}
  let newest=null;for(const event of events){if(typeof event.id!=='string'||seen.has(event.id))continue;seen.add(event.id);if(event.type==='intro_sent'&&!event.void&&event.source==='Owner reported'&&event.revision===1&&Number(event.createdAt)>0&&(!newest||event.createdAt>newest.createdAt))newest=event;}remember();if(newest)animateDeparture(newest);
  if(!visible()&&departure)stopDeparture();
 }
 function clearGameTimer(){if(gameTimer!==null)clearTimeout(gameTimer);gameTimer=null;}
 function startGame(){
  if(disposed)return;clearGameTimer();gameStarted=Date.now();gameMatches=0;gameMoves=0;gameSelected=[];const values=[1,2,3,4,5,6,1,2,3,4,5,6];for(let index=values.length-1;index>0;index--){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);const next=bytes[0]%(index+1);[values[index],values[next]]=[values[next],values[index]];}
  gameCards=values.map((value,index)=>{const card=action('?',()=>turnCard(index));card.setAttribute('aria-label','Face-down card '+(index+1));card.dataset.card=String(index);return {value,card,matched:false};});gameBoard.replaceChildren(...gameCards.map(item=>item.card));gameStatus.textContent='0 of 6 pairs · 0 turns';game.open=true;
 }
 function turnCard(index){const item=gameCards[index];if(disposed||!item||item.matched||gameSelected.includes(index)||gameSelected.length===2)return;if(Date.now()-gameStarted>180000){gameStatus.textContent='Three-minute break complete. Return to work or start another game when you choose.';for(const entry of gameCards)entry.card.disabled=true;return;}item.card.textContent=String(item.value);item.card.setAttribute('aria-label','Card '+(index+1)+': '+item.value);gameSelected.push(index);if(gameSelected.length<2)return;gameMoves++;const [a,b]=gameSelected.map(i=>gameCards[i]);if(a.value===b.value){a.matched=b.matched=true;a.card.disabled=b.card.disabled=true;gameMatches++;gameSelected=[];gameStatus.textContent=gameMatches===6?'All six pairs matched in '+gameMoves+' turns. Ready to return to your office?':gameMatches+' of 6 pairs · '+gameMoves+' turns';}else{gameStatus.textContent=gameMatches+' of 6 pairs · '+gameMoves+' turns';gameTimer=setTimeout(()=>{gameTimer=null;for(const i of gameSelected){const entry=gameCards[i];entry.card.textContent='?';entry.card.setAttribute('aria-label','Face-down card '+(i+1));}gameSelected=[];},900);}}
 const onVisibility=()=>{if(document.hidden)stopDeparture();};document.addEventListener('visibilitychange',onVisibility);
 update();
 return {update,dispose(){if(disposed)return;disposed=true;stopDeparture();clearGameTimer();resize?.disconnect();window.removeEventListener('resize',sizeArtwork);document.removeEventListener('visibilitychange',onVisibility);root.remove();}};
}
