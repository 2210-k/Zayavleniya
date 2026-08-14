const SUPABASE_CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
let sbPromise;
async function getSupabase(){
  if(sbPromise)return sbPromise;
  sbPromise=new Promise((resolve,reject)=>{
    const finish=()=>{try{const c=window.ZAYAVLENIYA_SUPABASE||{};if(!c.url||!c.anonKey)return reject(new Error('SUPABASE_CONFIG_MISSING'));resolve(window.supabase.createClient(c.url,c.anonKey));}catch(e){reject(e)}};
    if(window.supabase)return finish();
    const s=document.createElement('script');s.src=SUPABASE_CDN;s.onload=finish;s.onerror=()=>reject(new Error('SUPABASE_CDN_ERROR'));document.head.appendChild(s);
  });
  return sbPromise;
}
async function currentUser(){const db=await getSupabase();const {data}=await db.auth.getUser();return data.user||null}
async function currentProfile(){const u=await currentUser();if(!u)return null;const db=await getSupabase();const {data,error}=await db.from('profiles').select('*').eq('id',u.id).single();if(error)throw error;return data}
async function requireAuth(){try{const u=await currentUser();if(!u){location.href='login.html';return null}return u}catch(e){console.error(e);alert('Не удалось подключиться к системе. Проверьте настройки Supabase.');return null}}
async function requireAdmin(){const u=await requireAuth();if(!u)return null;const p=await currentProfile();if(p?.role!=='admin'){location.href='dashboard.html';return null}return p}
async function signOut(){const db=await getSupabase();await db.auth.signOut();location.href='index.html'}
async function signIn(email,password){const db=await getSupabase();return db.auth.signInWithPassword({email,password})}
async function submitApplication(type,title,destination,formData,documentText,gameDay){const db=await getSupabase();const {data,error}=await db.rpc('submit_application',{p_type:type,p_title:title,p_destination:destination,p_form_data:{...formData,_game_day:Number(gameDay)},p_generated_document:documentText});if(error)throw error;return data}
async function listMyApplications(){const db=await getSupabase();const {data,error}=await db.from('applications').select('*').order('created_at',{ascending:false});if(error)throw error;return data||[]}
async function listApplicationsAdmin(){const db=await getSupabase();const {data,error}=await db.from('applications').select('*, profiles:citizen_id(id,full_name)').order('created_at',{ascending:false});if(error)throw error;return data||[]}
async function getApplication(id){const db=await getSupabase();const {data,error}=await db.from('applications').select('*, profiles:citizen_id(*)').eq('id',id).single();if(error)throw error;return data}
async function getHistory(id){const db=await getSupabase();const {data,error}=await db.from('application_history').select('*').eq('application_id',id).order('created_at');if(error)throw error;return data||[]}
async function adminReceive(id){const db=await getSupabase();const {error}=await db.rpc('receive_application',{p_application_id:id});if(error)throw error}
async function adminStartReview(id){const db=await getSupabase();const {error}=await db.rpc('start_application_review',{p_application_id:id});if(error)throw error}
async function adminDecision(id,status,comment,gameDay){const db=await getSupabase();const {error}=await db.rpc('application_decision',{p_application_id:id,p_status:status,p_comment:(comment||'')+'\nИгровой день: '+Number(gameDay)});if(error)throw error}
async function createAppeal(id,reason){const db=await getSupabase();const {data,error}=await db.rpc('create_appeal',{p_application_id:id,p_reason:reason});if(error)throw error;return data}
window.ZB={getSupabase,currentUser,currentProfile,requireAuth,requireAdmin,signOut,signIn,submitApplication,listMyApplications,listApplicationsAdmin,getApplication,getHistory,adminReceive,adminStartReview,adminDecision,createAppeal};