// Hosted AI route: an OpenAI-compatible inference endpoint configured only
// from server environment variables. This is the owner-ordered fallback for
// deployments (such as the hosted Render site) where no local model is
// installed on the server and no paired desktop worker is connected. It is a
// fallback, never a replacement: a selected local model or a verified paired
// desktop worker always keeps priority, and one inference system routes each
// run to exactly one of them. Without HQ_AI_API_KEY the route reports itself
// unavailable instead of inventing a connection. The key is read from the
// environment at call time; it is never stored in the database and never
// included in any state returned to clients.
export const HOSTED_AI_DEFAULT_BASE='https://api.groq.com/openai/v1';
export const HOSTED_AI_DEFAULT_MODEL='llama-3.3-70b-versatile';
const PREFIX='hosted:';
function clean(value:any,fallback:string){return typeof value==='string'&&value.trim()?value.trim():fallback;}
export function hostedAIConfig(env:any=process.env){
 const key=typeof env.HQ_AI_API_KEY==='string'?env.HQ_AI_API_KEY.trim():'';
 const base=clean(env.HQ_AI_API_BASE,HOSTED_AI_DEFAULT_BASE).replace(/\/+$/,'');
 const model=clean(env.HQ_AI_MODEL,HOSTED_AI_DEFAULT_MODEL);
 return {configured:key.length>0,base,model,key};
}
export function isHostedModel(value:any):boolean{
 return typeof value==='string'&&value.startsWith(PREFIX)&&value.length>PREFIX.length&&value.length<=PREFIX.length+256&&!/[\u0000-\u001f\u007f]/.test(value);
}
export function hostedModelName(value:any):string{
 if(!isHostedModel(value))throw Error('Choose a valid hosted model');
 return value.slice(PREFIX.length);
}
export function hostedModelMarker(env:any=process.env){return PREFIX+hostedAIConfig(env).model;}
export function hostedAIState(env:any=process.env){
 const config=hostedAIConfig(env);let provider=config.base;try{provider=new URL(config.base).host||config.base;}catch{}
 return {configured:config.configured,provider,model:config.model,setup:config.configured?null:'Hosted AI is off: set HQ_AI_API_KEY on the server to enable it (a free Groq API key works with the default endpoint).'};
}
