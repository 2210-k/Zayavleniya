const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

let sbPromise = null;

async function getSupabase() {
  if (sbPromise) return sbPromise;

  sbPromise = new Promise((resolve, reject) => {
    const finish = () => {
      try {
        const config = window.ZAYAVLENIYA_SUPABASE || {};
        if (!config.url || !config.anonKey) {
          reject(new Error('SUPABASE_CONFIG_MISSING'));
          return;
        }
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
          reject(new Error('SUPABASE_CLIENT_MISSING'));
          return;
        }
        resolve(window.supabase.createClient(config.url, config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
          }
        }));
      } catch (error) {
        reject(error);
      }
    };

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      finish();
      return;
    }

    const script = document.createElement('script');
    script.src = SUPABASE_CDN;
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error('SUPABASE_CDN_ERROR'));
    document.head.appendChild(script);
  });

  return sbPromise;
}

async function currentSession() {
  const db = await getSupabase();
  const result = await db.auth.getSession();
  if (result.error) throw result.error;
  return result.data.session || null;
}

async function currentUser() {
  const session = await currentSession();
  return session ? session.user : null;
}

async function currentProfile() {
  const user = await currentUser();
  if (!user) return null;
  const db = await getSupabase();
  const result = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function requireAuth() {
  const session = await currentSession();
  if (!session) {
    location.replace('login.html');
    return null;
  }
  return session.user;
}

async function requireCitizen() {
  const user = await requireAuth();
  if (!user) return null;
  const profile = await currentProfile();
  if (!profile) {
    await signOut();
    return null;
  }
  if (profile.role === 'admin') {
    location.replace('admin.html');
    return null;
  }
  return profile;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  const profile = await currentProfile();
  if (!profile) {
    await signOut();
    return null;
  }
  if (profile.role !== 'admin') {
    location.replace('dashboard.html');
    return null;
  }
  return profile;
}

async function signOut() {
  const db = await getSupabase();
  await db.auth.signOut({ scope: 'local' });
  location.replace('login.html');
}

async function signIn(email, password) {
  const db = await getSupabase();
  return db.auth.signInWithPassword({ email, password });
}

function validGameDay(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error('Игровой день должен быть целым числом от 0 и выше.');
  }
  return number;
}

async function rpc(name, args) {
  const db = await getSupabase();
  const result = await db.rpc(name, args || {});
  if (result.error) throw result.error;
  return result.data;
}

async function submitApplication(type, title, destination, formData, documentText, gameDay) {
  return rpc('submit_application', {
    p_type: type,
    p_title: title,
    p_destination: destination,
    p_form_data: formData || {},
    p_generated_document: documentText || '',
    p_game_day: validGameDay(gameDay)
  });
}

async function listMyApplications() {
  const user = await currentUser();
  if (!user) throw new Error('Требуется вход.');
  const db = await getSupabase();
  const result = await db.from('applications').select('*').eq('citizen_id', user.id).order('created_at', { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

async function listApplicationsAdmin() {
  const db = await getSupabase();
  const result = await db.from('applications').select('*, profiles:citizen_id(*)').order('created_at', { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

async function getApplication(id) {
  const user = await currentUser();
  if (!user) throw new Error('Требуется вход.');
  const db = await getSupabase();
  const result = await db.from('applications').select('*, profiles:citizen_id(*)').eq('id', id).eq('citizen_id', user.id).single();
  if (result.error) throw result.error;
  return result.data;
}

async function getApplicationAdmin(id) {
  const profile = await currentProfile();
  if (!profile || profile.role !== 'admin') throw new Error('Доступ администратора требуется.');
  const db = await getSupabase();
  const result = await db.from('applications').select('*, profiles:citizen_id(*)').eq('id', id).single();
  if (result.error) throw result.error;
  return result.data;
}

async function getHistory(id) {
  const db = await getSupabase();
  const result = await db.from('application_history').select('*').eq('application_id', id).order('created_at', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function adminReceive(id, gameDay) {
  return rpc('receive_application', { p_application_id: id, p_game_day: validGameDay(gameDay) });
}

async function adminStartReview(id, gameDay) {
  return rpc('start_application_review', { p_application_id: id, p_game_day: validGameDay(gameDay) });
}

async function decideApplication(id, status, gameDay, comment) {
  return rpc('application_decision', {
    p_application_id: id,
    p_status: status,
    p_comment: comment || '',
    p_game_day: validGameDay(gameDay)
  });
}

async function createAppeal(id, reason) {
  const text = String(reason || '').trim();
  if (text.length < 10) throw new Error('Причина оспаривания должна содержать минимум 10 символов.');
  return rpc('create_appeal', { p_application_id: id, p_reason: text });
}

async function listApplicationAppeals(id) {
  return (await rpc('list_application_appeals', { p_application_id: id })) || [];
}

async function resolveAppealAdmin(id, status, comment, gameDay) {
  return rpc('resolve_appeal_admin', {
    p_appeal_id: id,
    p_status: status,
    p_comment: comment || '',
    p_game_day: validGameDay(gameDay)
  });
}

async function withdrawApplication(id, gameDay, reason) {
  return rpc('citizen_withdraw_application', {
    p_application_id: id,
    p_game_day: validGameDay(gameDay),
    p_reason: reason || ''
  });
}

async function listMessages(id) {
  return (await rpc('list_application_messages', { p_application_id: id })) || [];
}

async function sendMessage(id, message) {
  const text = String(message || '').trim();
  if (!text) throw new Error('Сообщение не может быть пустым.');
  if (text.length > 4000) throw new Error('Сообщение слишком длинное.');
  return rpc('send_application_message', { p_application_id: id, p_message: text });
}

async function markApplicationMessagesRead(id) {
  if (!id) return null;
  return rpc('mark_application_messages_read', { p_application_id: id });
}

async function getUnreadMessageCount() {
  const user = await currentUser();
  if (!user) return 0;
  const db = await getSupabase();
  const result = await db.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', user.id).eq('is_read', false);
  if (result.error) throw result.error;
  return result.count || 0;
}

async function deleteOwnMessage(id) {
  return rpc('delete_own_message', { p_message_id: id });
}

async function deleteMessage(id) {
  return rpc('delete_message_admin', { p_message_id: id });
}

async function clearHistory(id) {
  return rpc('clear_application_history_admin', { p_application_id: id });
}

async function clearMessages(id) {
  return rpc('clear_application_messages_admin', { p_application_id: id });
}

async function deleteApplication(id) {
  return rpc('delete_application_admin', { p_application_id: id });
}

async function listAttachments(id) {
  const db = await getSupabase();
  const result = await db.from('application_attachments').select('*').eq('application_id', id).order('created_at', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function uploadAttachment(applicationId, file) {
  if (!file) throw new Error('Файл не выбран.');
  const user = await currentUser();
  if (!user) throw new Error('Требуется вход.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-а-яА-ЯёЁ]/g, '_');
  const path = user.id + '/' + applicationId + '/' + Date.now() + '_' + safeName;
  const db = await getSupabase();
  const upload = await db.storage.from('application-attachments').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upload.error) throw upload.error;
  const inserted = await db.from('application_attachments').insert({
    application_id: applicationId,
    uploaded_by: user.id,
    file_name: file.name,
    file_path: path,
    file_type: file.type || null,
    file_size: file.size
  }).select().single();
  if (inserted.error) {
    await db.storage.from('application-attachments').remove([path]);
    throw inserted.error;
  }
  return inserted.data;
}

async function deleteAttachment(id, path) {
  const db = await getSupabase();
  const result = await db.from('application_attachments').delete().eq('id', id);
  if (result.error) throw result.error;
  if (path) await db.storage.from('application-attachments').remove([path]);
}

async function attachmentUrl(path) {
  const db = await getSupabase();
  const result = await db.storage.from('application-attachments').createSignedUrl(path, 600);
  if (result.error) throw new Error('Не удалось открыть файл: ' + result.error.message);
  return result.data.signedUrl;
}

async function listCitizensAdmin() {
  return (await rpc('admin_list_citizens')) || [];
}

window.ZB = {
  getSupabase,
  currentSession,
  currentUser,
  currentProfile,
  requireAuth,
  requireCitizen,
  requireAdmin,
  signOut,
  signIn,
  validGameDay,
  submitApplication,
  listMyApplications,
  listApplicationsAdmin,
  getApplication,
  getApplicationAdmin,
  getHistory,
  adminReceive,
  adminStartReview,
  decideApplication,
  createAppeal,
  listApplicationAppeals,
  resolveAppealAdmin,
  withdrawApplication,
  listMessages,
  sendMessage,
  markApplicationMessagesRead,
  getUnreadMessageCount,
  deleteOwnMessage,
  deleteMessage,
  clearHistory,
  clearMessages,
  deleteApplication,
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  attachmentUrl,
  listCitizensAdmin
};