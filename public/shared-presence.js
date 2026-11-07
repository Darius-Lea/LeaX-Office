// Shared office positions contain only room identity, names and bounded 3D poses.
export function initSharedPresence({api,guest=false,address,getScene,notify=()=>{}}){
 let running=false,busy=false,timer=null,lastPose=null,generation=0,lastFailure=0,lastResult=null;
 const currentAddress=()=>typeof address==='function'?address():address;
 function pose(){
  const state=getScene()?.getExploreState?.();if(!state)return lastPose;
  return {active:state.active===true,cameraMode:state.cameraMode||'orbit',x:Number(state.position?.x)||0,z:Number(state.position?.z)||0,yaw:Number(state.yaw)||0,pitch:Number(state.pitch)||0};
 }
 async function poll(run){
  if(!running||run!==generation)return;if(busy){timer=setTimeout(()=>poll(run),100);return;}busy=true;
  try{
   const path=guest?'guest/presence':'room/'+currentAddress()+'/presence';
   const result=await api(path,{pose:pose()||{active:false,cameraMode:'orbit',x:0,z:0,yaw:0,pitch:0}});
   if(!running||run!==generation)return;
   lastResult=result;getScene()?.setSharedParticipants?.(result.people||[],result.selfId);lastFailure=0;
  }catch(error){
   if(!running||run!==generation)return;
   if([401,403,410].includes(error.status)||/membership|access has ended|Sign in|suspended|revoked/i.test(error.message||'')){
    running=false;getScene()?.setSharedParticipants?.([],null);notify(error.message||'Office access ended');return;
   }
   getScene()?.setSharedParticipants?.([],null);
   if(Date.now()-lastFailure>15000){notify('Office connection interrupted. Reconnecting…');lastFailure=Date.now();}
  }finally{busy=false;if(running&&run===generation){timer=setTimeout(()=>poll(run),900);}}
 }
 function start(){if(running)return;running=true;generation++;window.addEventListener('pagehide',close);void poll(generation);}
 function update(value){lastPose=value?.position?{active:value.active===true,cameraMode:value.cameraMode,x:Number(value.position.x)||0,z:Number(value.position.z)||0,yaw:Number(value.yaw)||0,pitch:Number(value.pitch)||0}:value;}
 function close(){
  if(!running&&!timer)return;running=false;generation++;window.removeEventListener('pagehide',close);clearTimeout(timer);timer=null;lastPose=null;lastResult=null;
  getScene()?.setSharedParticipants?.([],null);
  const path=guest?'guest/presence':'room/'+currentAddress()+'/presence';
  if(guest||currentAddress())void api(path,{leave:true}).catch(()=>{});
 }
 return {start,update,close,getState:()=>({running,selfId:lastResult?.selfId||null,people:lastResult?.people||[]})};
}
