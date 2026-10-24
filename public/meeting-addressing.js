// A name at the start gives the floor to an invited colleague. Mentions later
// in a sentence do not redirect the CEO's words.
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function resolveMeetingAddress(value,employees,selectedId=null){
 const text=String(value||'').trim(),people=Array.isArray(employees)?employees:[];
 if(/^(?:everyone|team|everybody|all)(?=[\s,:.!?—–-]|$)/iu.test(text))return {kind:'statement',text};
 const matches=people.flatMap(employee=>{const name=String(employee.name||'').trim();if(!name)return [];const prefix=new RegExp('^(?:(?:hey|hello|hi|okay|ok|please)\\s+)?'+escaped(name)+'(?=[\\s,:.!?—–-]|$)','iu').exec(text);return prefix?[{employee,length:prefix[0].length}]:[];});
 if(matches.length){
  const longest=Math.max(...matches.map(item=>item.length)),exact=matches.filter(item=>item.length===longest),chosen=exact.length===1?exact[0]:exact.find(item=>item.employee.id===selectedId);
  if(!chosen)return {kind:'ambiguous',message:'Two colleagues use that name. Choose one person before sending.'};
  const remainder=text.slice(chosen.length).replace(/^[\s,:.!?—–-]+/u,'');
  if(/^(?:and|&)\s+/iu.test(remainder)&&people.some(item=>item.id!==chosen.employee.id&&new RegExp('^(?:and|&)\\s+'+escaped(String(item.name||''))+'(?=[\\s,:.!?—–-]|$)','iu').test(remainder)))return {kind:'ambiguous',message:'Call on one colleague at a time. Choose who should answer first.'};
  return {kind:'employee',employee:chosen.employee,text,question:remainder,via:'name'};
 }
 const selected=people.find(item=>item.id===selectedId);return selected?{kind:'employee',employee:selected,text,question:text,via:'selection'}:{kind:'statement',text};
}
