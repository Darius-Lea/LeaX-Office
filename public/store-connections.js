// Authenticated store access and revision-locked publication workspace.
const $=selector=>document.querySelector(selector);
const el=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;return e;};
let api,refresh,openComputer,latest=null;
const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(value/100):'Not set';
const when=value=>value?new Date(value).toLocaleString():'Not checked';
const connectionState=()=>latest?.storefronts||{connections:[],publications:[],supported:['woocommerce']};
const commerce=()=>latest?.commerce||{products:[],listings:[],designs:[]};
const approved=record=>record?.readiness?.validApproval===true;
const manual=connection=>connection.provider==='manual';

function safeLink(label,value){
 const a=el('a',label);let safe='';
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)safe=u.href;}catch{}
 if(!safe)return el('span',label+' â€” link unavailable');
 a.href=safe;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function popup(title,body,actions=[]){window.hqPopup.open({title,contentNode:body,readable:false,actions});}
function button(label,fn){const b=el('button',label);b.type='button';b.onclick=()=>void Promise.resolve().then(fn).catch(error=>popup('Store connection needs attention',el('p',error.message)));return b;}
function field(form,name,label,value='',type='text',required=false){
 const wrap=el('label',label),input=el(type==='textarea'?'textarea':'input');input.name=name;
 if(type!=='textarea')input.type=type;input.value=value??'';input.required=required;wrap.append(input);form.append(wrap);return input;
}
function select(form,name,label,options,value){
 const wrap=el('label',label),input=el('select');input.name=name;input.setAttribute('aria-label',label);
 for(const item of options){const option=el('option',item.name);option.value=item.id;input.append(option);}
 if(value!==undefined)input.value=value;wrap.append(input);form.append(wrap);return input;
}
function check(form,label,value=false){const wrap=el('label',label),input=el('input');wrap.className='store-connection-check';input.type='checkbox';input.checked=value===true;wrap.prepend(input);form.append(wrap);return input;}
function usdField(form,name,label,cents){const input=field(form,name,label,Number.isSafeInteger(cents)?(cents/100).toFixed(2):'','number',true);input.min='0';input.max='1000000';input.step='0.01';return input;}
function percentField(form,name,label,bps){const input=field(form,name,label,Number.isSafeInteger(bps)?(bps/100).toFixed(2):'','number',true);input.min='0';input.max='99.99';input.step='0.01';return input;}
export function storefrontUSDCents(value,label='USD amount'){
 const text=String(value).trim();if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(text))throw Error(label+' must be a nonnegative USD amount with at most two decimals');
 const cents=Math.round(Number(text)*100);if(!Number.isSafeInteger(cents)||cents>100000000)throw Error(label+' is outside the supported range');return cents;
}
export function storefrontPercentBps(value,label='Percentage'){
 const text=String(value).trim();if(!/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/.test(text))throw Error(label+' must be between 0 and 99.99 percent');return Math.round(Number(text)*100);
}
async function action(path,body){const result=await api('storefronts/'+path,body);await refresh();latest=window.hqState||latest;renderStoreConnections(latest);return result;}
function savedConnection(id){const value=connectionState().connections.find(c=>c.id===id);if(!value)throw Error('This saved store is no longer available. Reopen Store connections');return value;}

export function initStoreConnections(options){
 ({api,refresh,openComputer}=options);
 const tab=button('Store connections',()=>open());tab.dataset.pane='store-connections';$('#computer-tabs .sidebar-bottom')?.before(tab);
 const pane=el('div');pane.id='store-connections-workspace';pane.dataset.computerPane='store-connections';pane.hidden=true;$('.computer-content')?.append(pane);
 window.hqStoreConnections={open,connect:()=>connectionForm(),inspectConnection:id=>connectionDetails(savedConnection(id)),prepareListing:(listingId,connectionId)=>publicationForm(connectionId?savedConnection(connectionId):null,listingId)};
 // A production-line raycast can dispatch this event without opening a second
 // office or assuming that a saved link is a working store connection.
 window.addEventListener('hq-store-connections',()=>open());
}
function open(){openComputer('store-connections');renderStoreConnections(window.hqState||latest);}
function publicationLabel(status=''){
 if(status==='Published; API confirmed')return 'Published â€” confirmed by your store';
 if(status==='Draft saved; API confirmed')return 'Draft saved â€” confirmed by your store';
 if(status.startsWith('Unknown'))return 'Result needs checking â€” do not submit again';
 if(status==='Blocked before store write')return 'Stopped before creating a store product';
 return status||'No result recorded';
}
export function renderStoreConnections(snapshot){
 latest=snapshot||latest;const pane=$('#store-connections-workspace');if(!pane||pane.hidden||!latest)return;
 const s=connectionState(),c=commerce(),signature=JSON.stringify([s,c.products,c.listings,c.designs]);if(pane.dataset.signature===signature)return;pane.dataset.signature=signature;
 pane.replaceChildren(el('h2','Connect your real stores'),el('p','Choose a store you own, review its access and costs, then send an approved digital product. A saved link alone does not connect publishing, payments or shipping.'));
 const toolbar=el('div');toolbar.className='store-connection-actions';toolbar.append(button('I do not have a store yet',()=>window.hqStores?.open()),button('Add a store',()=>connectionForm()),button('Review product files & listings',()=>window.hqCommerce?.openOffice('sales')));pane.append(toolbar);
 const grid=el('div');grid.className='store-connection-grid';
 for(const connection of s.connections||[]){
  const card=el('article');card.className='store-connection-card';
  card.append(el('p',manual(connection)?'SAVED STORE LINK':'WOOCOMMERCE'),el('h3',connection.name),el('strong',connection.status||(manual(connection)?'Link saved â€” manual export only':'Connection not verified')),safeLink('Open your store',connection.baseUrl));
  if(manual(connection))card.append(el('p','Use reviewed exports in your seller account. This link has no publishing or order access.'));
  else card.append(el('p','Last access check: '+when(connection.verifiedAt)+' Â· '+(connection.currency||'Currency not verified')),el('p',connection.policy?.autoPublish?'Approved-product publishing authority is saved within your limits. This does not promise continuous execution.':'Automatic publishing is off. Store changes require the review steps below.'));
  if(connection.notice)card.append(el('p',connection.notice));
  const actions=el('div');actions.className='store-connection-actions';actions.append(button('View connection',()=>connectionDetails(connection)));
  if(!manual(connection)){actions.append(button('Check store access',()=>verifyConnection(connection)),button('Pricing & publishing limits',()=>policyForm(connection)));const send=button('Prepare a product for this store',()=>publicationForm(connection));send.disabled=!connection.connected;actions.append(send);}
  else actions.append(button('Export reviewed listing content',()=>manualExport(connection)));
  card.append(actions);grid.append(card);
 }
 if(!s.connections?.length)grid.append(el('p','No real store has been connected. Add an existing WooCommerce store for supported publishing, or save another store link for manual exports.'));
 pane.append(grid);
 const history=el('section');history.className='store-connection-history';history.append(el('h3','Actual store results'));
 for(const receipt of (s.publications||[]).slice(0,30)){
  const row=el('article'),connection=s.connections?.find(c=>c.id===receipt.connectionId),listing=c.listings?.find(l=>l.id===receipt.listingId);
  row.append(el('h4',listing?.title||'Saved listing'),el('p',(connection?.name||'Saved store')+' Â· '+publicationLabel(receipt.status)),el('small','Last recorded result: '+when(receipt.updatedAt||receipt.updated||receipt.created)));
  if(receipt.remoteUrl)row.append(safeLink('Open actual store result',receipt.remoteUrl));
  if(receipt.status?.startsWith('Unknown')||receipt.status==='Sending'||receipt.status==='Preparing')row.append(button('Check store result',()=>reconcile(receipt.id)));
  history.append(row);
 }
 if(!s.publications?.length)history.append(el('p','No store write has been recorded. Listing drafts, order value and product files are not sales or money received.'));
 pane.append(history);
 const limits=el('p','Digital publishing is supported only for verified WooCommerce stores using USD and reviewed, linked product files. Other seller sites use manual exports here. Payment processing, fulfillment, print-on-demand, returns and live order imports are separate connections; none are implied by publishing a product.');limits.className='store-connection-note';pane.append(limits);
}

function connectionForm(existing=null){
 const form=el('form');form.className='business-document-form';form.dataset.storeConnection='true';
 const provider=select(form,'provider','What kind of store do you own?',[
  {id:'woocommerce',name:'WooCommerce â€” connect supported product publishing'},
  {id:'manual',name:'Another store â€” save its link and use reviewed exports'}
 ],existing?.provider||'woocommerce');
 provider.disabled=!!existing;
 const name=field(form,'name','Store name',existing?.name||'','text',true);name.maxLength=120;
 const url=field(form,'baseUrl','Your public HTTPS store address',existing?.baseUrl||'','url',true);url.maxLength=2000;url.placeholder='https://your-store.example';url.autocomplete='url';
 const access=el('fieldset');access.className='store-connection-access';access.append(el('legend','Private store access'));
 const key=field(access,'consumerKey','WooCommerce consumer key','','password',true),secret=field(access,'consumerSecret','WooCommerce consumer secret','','password',true);
 for(const input of [key,secret]){input.autocomplete='off';input.spellcheck=false;input.maxLength=200;input.setAttribute('data-private-input','true');}
 const note=el('p','Use a store access key you created for this office. Access is saved encrypted on this host and is never displayed again. Do not enter a store login password, bank details or a wallet recovery phrase.');access.append(note);form.append(access);
 const choiceNote=el('p');form.append(choiceNote);
 const updateProvider=()=>{const isManual=provider.value==='manual';access.hidden=isManual;key.required=secret.required=!isManual;if(isManual){key.value=secret.value='';}choiceNote.textContent=isManual?'This saves a link only. You will export reviewed content and upload it yourself in that store.':'Save access, then choose Check store access. Saving credentials does not verify the connection or publish a product.';};provider.onchange=updateProvider;updateProvider();
 const owner=check(form,'I own this store or have permission to connect and manage its products.');owner.required=true;
 const feedback=el('p'),save=el('button','Save store access');form.append(feedback,save);
 const clear=()=>{key.value='';secret.value='';};
 document.querySelector('#focused-dialog')?.addEventListener('close',clear,{once:true});
 form.onsubmit=async event=>{
  event.preventDefault();if(!owner.checked)return;save.disabled=true;
  const payload={id:existing?.id,expectedRevision:existing?.revision,name:name.value,provider:provider.value,baseUrl:url.value,confirmedOwner:true,...(provider.value==='woocommerce'?{consumerKey:key.value,consumerSecret:secret.value}:{})};
  clear();
  try{const saved=await action('save',payload);connectionDetails(saved?.id?saved:savedConnection(existing.id));}
  catch{feedback.textContent='The store could not be saved. Check the address and access keys, then re-enter the keys to try again. Private keys are not retained in this form.';save.disabled=false;}
  finally{delete payload.consumerKey;delete payload.consumerSecret;}
 };
 popup(existing?'Replace saved store access':'Add your store',form);
}
function connectionDetails(connection){
 const body=el('div');body.className='store-connection-details';body.append(el('p',manual(connection)?'Saved store link â€” manual exports only':'WooCommerce store connection'),safeLink('Open '+connection.name,connection.baseUrl),el('strong',connection.status||'Not verified'));
 if(!manual(connection)){body.append(el('p','Last store access check: '+when(connection.verifiedAt)),el('p','Store currency: '+(connection.currency||'Not verified')),el('p','Saved access keys are private. This panel does not show or recover them.'));}
 if(connection.notice)body.append(el('p',connection.notice));
 const actions=[];
 if(!manual(connection)){actions.push({label:'Check store access',onClick:()=>verifyConnection(connection)},{label:'Pricing & publishing limits',onClick:()=>policyForm(connection)},{label:'Replace private access keys',onClick:()=>connectionForm(connection)});if(connection.connected)actions.push({label:'Prepare a product for this store',onClick:()=>publicationForm(connection)});}
 else actions.push({label:'Export reviewed listing content',onClick:()=>manualExport(connection)});
 actions.push({label:manual(connection)?'Remove this saved store link':'Disconnect saved store access',onClick:()=>disconnectForm(connection)});
 popup(connection.name,body,actions);
}
async function verifyConnection(connection){
 const body=el('p','Checking your store access. No product or order is being created.');popup('Checking '+connection.name,body);
 try{const saved=await action('verify',{id:connection.id,expectedRevision:connection.revision});connectionDetails(saved?.id?saved:savedConnection(connection.id));}
 catch(error){popup('Store access could not be verified',el('p',error.message),[{label:'Review saved connection',onClick:()=>connectionDetails(savedConnection(connection.id))}]);}
}
function disconnectForm(connection){
 const body=el('div');body.append(el('p','Disconnect '+connection.name+' from this office?'),el('p','Private access is removed and publishing authority is disabled. Your actual product files, store products and recorded history remain.'));
 popup('Disconnect this store',body,[{label:'Keep connected',onClick:()=>connectionDetails(connection)},{label:'Disconnect saved access',onClick:async()=>{await action('disconnect',{id:connection.id,expectedRevision:connection.revision});window.hqPopup.close();open();}}]);
}

function policyForm(connection){
 if(manual(connection))throw Error('A saved store link supports manual exports only');
 const p=connection.policy||{},reviewed=!!p.costEvidence;
 const form=el('form');form.className='business-document-form';form.dataset.storePolicy='true';
 form.append(el('p','Set limits from the real costs and fees you checked. The office rejects a listing outside these limits or without current file/product approval. All amounts below are USD.'));
 const minimum=usdField(form,'minPrice','Lowest allowed sale price USD',reviewed?p.minPriceCents:null),maximum=usdField(form,'maxPrice','Highest allowed sale price USD',reviewed?p.maxPriceCents:null),profit=usdField(form,'minProfit','Minimum planned profit per sale USD',reviewed?p.minProfitCents:null),feeFixed=usdField(form,'feeFixed','Fixed store/payment fee per sale USD',reviewed?p.feeFixedCents:null),feePercent=percentField(form,'feePercent','Store/payment percentage fee',reviewed?p.feeBps:null),margin=percentField(form,'minMargin','Minimum planned margin percentage',reviewed?p.minMarginBps:null);
 const evidence=field(form,'costEvidence','Where and when I checked costs, fees and delivery terms',p.costEvidence||'','textarea',true);evidence.maxLength=3000;
 const authority=check(form,'Allow the office to publish already-approved digital products within these saved limits.',p.autoPublish===true);
 form.append(el('p','Leave this off to review each store write yourself. Publishing authority does not approve new artwork, waive pricing checks, buy services or promise continuous work.'));
 const confirmed=check(form,'These are the current costs and limits I checked, and I approve the authority selected above.');confirmed.required=true;
 const feedback=el('p'),save=el('button','Save my limits');form.append(feedback,save);
 form.onsubmit=async event=>{event.preventDefault();if(!confirmed.checked)return;save.disabled=true;try{
  const policy={autoPublish:authority.checked,minPriceCents:storefrontUSDCents(minimum.value,'Lowest price'),maxPriceCents:storefrontUSDCents(maximum.value,'Highest price'),minProfitCents:storefrontUSDCents(profit.value,'Minimum profit'),feeFixedCents:storefrontUSDCents(feeFixed.value,'Fixed fee'),feeBps:storefrontPercentBps(feePercent.value,'Percentage fee'),minMarginBps:storefrontPercentBps(margin.value,'Minimum margin'),costsCheckedAt:Date.now(),costEvidence:evidence.value};
  if(policy.maxPriceCents<policy.minPriceCents)throw Error('Highest price must be at least the lowest price');
  const saved=await action('policy',{id:connection.id,expectedRevision:connection.revision,confirmed:true,policy});connectionDetails(saved?.id?saved:savedConnection(connection.id));
 }catch(error){feedback.textContent=error.message;save.disabled=false;}};
 popup(connection.name+' â€” pricing & publishing limits',form);
}
function manualExport(connection){
 const body=el('div'),listings=commerce().listings.filter(l=>approved(l));body.append(el('p','Export exact reviewed listing content, then upload it in '+connection.name+'. This office will not submit it or mark it published for you.'));
 for(const listing of listings){const row=el('article');row.append(el('h3',listing.title),el('p',money(listing.priceCents)),button('Download reviewed listing content',()=>exportListing(listing.id)),button('Open saved listing',()=>window.hqCommerce.openRecord(listing.id)));body.append(row);}
 if(!listings.length)body.append(el('p','No reviewed listing is ready for export.'),button('Prepare or review a listing',()=>window.hqCommerce?.openOffice('sales')));
 popup(connection.name+' â€” reviewed exports',body);
}
async function exportListing(id){
 const file=await api('commerce/export/'+encodeURIComponent(id)),url=URL.createObjectURL(new Blob([file.body],{type:file.mime})),a=el('a');a.href=url;a.download=file.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function publicationForm(connection=null,listingId=null){
 const connections=connectionState().connections.filter(c=>!manual(c)&&c.connected),c=commerce();
 if(!connections.length){popup('Connect a supported store first',el('p','Verify access to an existing WooCommerce store before preparing a digital product for it.'),[{label:'Open store connections',onClick:()=>open()}]);return;}
 const listings=c.listings.filter(l=>l.platform==='own-store');
 if(!listings.length){popup('Prepare a listing first',el('p','Save an original digital product, its artwork and a listing for Your own store. Review the exact records before sending them.'),[{label:'Open product & listing work',onClick:()=>window.hqCommerce?.openOffice('sales')}]);return;}
 const form=el('form');form.className='business-document-form';form.dataset.storePublication='true';
 const store=select(form,'connection','Send to this store',connections.map(c=>({id:c.id,name:c.name})),connection?.id||connections[0].id),listing=select(form,'listing','Saved listing',listings.map(l=>({id:l.id,name:l.title+' Â· '+money(l.priceCents)})),listingId||listings[0].id),design=select(form,'design','Exact reviewed artwork',[],undefined);
 const review=el('div');review.className='store-publication-readiness';form.append(review);
 const update=()=>{
  const l=listings.find(row=>row.id===listing.value),p=c.products.find(row=>row.id===l?.parentId),designs=c.designs.filter(row=>row.parentId===l?.parentId);
  design.replaceChildren(...designs.map(row=>{const option=el('option',row.title+' Â· '+(approved(row)?'Reviewed':'Needs review'));option.value=row.id;return option;}));
  review.replaceChildren(el('p','Saved sale price: '+money(l?.priceCents)+' Â· Product cost recorded by owner: '+money(p?.unitCostCents)));
  for(const [label,record]of [['Product',p],['Listing',l]]){review.append(el('p',label+': '+(record?.displayStatus||record?.status||'Missing from this snapshot')));for(const issue of record?.readiness?.issues||[])review.append(el('p',issue));}
  if(p?.fulfillmentMode!=='digital')review.append(el('p','This connection currently supports reviewed digital downloads only.'));
  if(!designs.length)review.append(el('p','No artwork is linked to this product. Prepare and review its actual file first.'));
 };listing.onchange=update;update();
 const delivery=field(form,'downloadUrl','Public download file URL on this store','','url',true);delivery.maxLength=2000;
 form.append(el('p','Upload the reviewed artwork to your storeâ€™s file storage, then paste its public HTTPS file link. The office checks the saved file hash before a store write. Private inspection/preview links do not deliver files to buyers.'));
 const fileConfirmed=check(form,'This URL delivers the exact reviewed file, and I have checked how buyers receive it.');fileConfirmed.required=true;
 const mode=select(form,'publish','What should happen after the final review?',[{id:'draft',name:'Create a draft product in my store'},{id:'publish',name:'Publish the product in my store'}],'draft');
 const feedback=el('p'),prepare=el('button','Check file delivery & pricing');form.append(feedback,prepare);
 form.onsubmit=async event=>{event.preventDefault();if(!fileConfirmed.checked)return;prepare.disabled=true;try{
  const selected=savedConnection(store.value),l=listings.find(row=>row.id===listing.value),d=c.designs.find(row=>row.id===design.value),p=c.products.find(row=>row.id===l?.parentId);
  if(!approved(p)||!approved(l)||!approved(d))throw Error('Review the exact product, listing and linked artwork before sending it to the store');
  if(p.fulfillmentMode!=='digital')throw Error('Choose a reviewed digital-download product');
  if(!d||d.parentId!==p.id)throw Error('Choose artwork linked to this same product');
  const input={connectionId:selected.id,connectionRevision:selected.revision,listingId:l.id,listingRevision:l.revision,designId:d.id,designRevision:d.revision,downloadUrl:delivery.value,fileDeliveryConfirmed:true,publish:mode.value==='publish'};
  const prepared=await api('storefronts/prepare',input);publicationReview(selected,input,prepared);
 }catch(error){feedback.textContent=error.message;prepare.disabled=false;}};
 popup('Review a product for your store',form);
}
function publicationReview(connection,input,prepared){
 const body=el('div');body.className='store-publication-review';
 body.append(el('h3',prepared.title),el('p','Store: '+connection.name),el('p',input.publish?'Action: publish this digital product':'Action: create a draft product'),el('p','Sale price: '+money(prepared.priceCents)+' Â· Minimum planned price: '+money(prepared.minimumPlannedPriceCents)),safeLink('Verified buyer download file',prepared.downloadUrl));
 if(prepared.notice)body.append(el('p',prepared.notice));
 const digest=el('details');digest.append(el('summary','Exact file verification'),el('code',prepared.fileSha256||'No file verification returned'));body.append(digest);
 const confirmed=check(body,input.publish?'I approve publishing this exact product to this store at this price.':'I approve creating this exact draft product in this store.');
 const feedback=el('p'),send=button(input.publish?'Publish this reviewed product':'Create this store draft',async()=>{
  if(!confirmed.checked){feedback.textContent='Confirm the exact store action first.';return;}
  send.disabled=true;confirmed.disabled=true;
  try{const receipt=await action('publish',{...input,snapshotHash:prepared.snapshotHash,confirmedPublication:input.publish===true});publicationResult(receipt);}
  catch(error){feedback.textContent=error.message+' Check Actual store results before trying another write.';send.disabled=true;body.append(button('Open actual store results',()=>{window.hqPopup.close();open();}));}
 });body.append(feedback,send);popup(input.publish?'Final review before publishing':'Final review before creating a store draft',body);
}
function publicationResult(receipt){
 const body=el('div');body.append(el('strong',publicationLabel(receipt.status)));
 if(receipt.remoteUrl)body.append(safeLink('Open actual store product',receipt.remoteUrl));
 if(receipt.status?.startsWith('Unknown'))body.append(el('p','The response does not establish whether the store write succeeded. Check the store result; sending another write could duplicate a product.'),button('Check store result',()=>reconcile(receipt.id)));
 body.append(el('p','A published listing is not a sale or money received.'),button('Open store results',()=>{window.hqPopup.close();open();}));popup('Store result',body);
}
async function reconcile(id){const receipt=await action('reconcile',{id});publicationResult(receipt);}
