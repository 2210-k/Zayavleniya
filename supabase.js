const SUPABASE_URL='https://mgglgpnlrziomkywbutx.supabase.co';
const SUPABASE_KEY='sb_publishable_WMHeb2Cz2zgmM1mO4pqTaA_aFK9VfRv';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
async function currentUser(){const {data,error}=await sb.auth.getUser();if(error&&error.name!=='AuthSessionMissingError')throw error;return data?.user||null;}
async function requireAuth(){const u=await currentUser();if(!u){location.replace('login.html');return null;}return u;}
async function profile(u){const {data,error}=await sb.from('profiles').select('*').eq('id',u.id).single();if(error)throw error;return data;}
async function requireCitizen(){const u=await requireAuth();if(!u)return null;const p=await profile(u);if(p.role==='admin'){location.replace('admin.html');return null;}return {user:u,profile:p};}
async function requireAdmin(){const u=await requireAuth();if(!u)return null;const p=await profile(u);if(p.role!=='admin'){location.replace('dashboard.html');return null;}return {user:u,profile:p};}
async function signOut(){await sb.auth.signOut();location.replace('login.html');}
async function listMessages(applicationId){const {data,error}=await sb.from('messages').select('*,sender:profiles!messages_sender_id_fkey(full_name,role),recipient:profiles!messages_recipient_id_fkey(full_name,role)').eq('application_id',applicationId).order('created_at',{ascending:true});if(error)throw error;return data||[];}
async function sendMessage(applicationId,recipientId,text){const {data,error}=await sb.rpc('send_application_message',{p_application_id:applicationId,p_recipient_id:recipientId,p_message:text});if(error)throw error;return data;}
async function listApplications(){const {data,error}=await sb.from('applications').select('*,citizen:profiles!applications_citizen_id_fkey(*)').order('created_at',{ascending:false});if(error)throw error;return data||[];}
async function getApplication(id){const {data,error}=await sb.from('applications').select('*,citizen:profiles!applications_citizen_id_fkey(*)').eq('id',id).single();if(error)throw error;return data;}
async function history(id){const {data,error}=await sb.from('application_history').select('*').eq('application_id',id).order('created_at',{ascending:true});if(error)throw error;return data||[];}
async function markRead(id){const u=await currentUser();if(!u)return;const {error}=await sb.from('messages').update({is_read:true}).eq('id',id).eq('recipient_id',u.id);if(error)throw error;}
window.ZB={sb,currentUser,requireAuth,requireCitizen,requireAdmin,profile,signOut,listMessages,sendMessage,listApplications,getApplication,history,markRead};