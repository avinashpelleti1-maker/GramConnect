const $ = s => document.querySelector(s);
const state = { token: localStorage.getItem('gc_token'), user: null, page: 'home', rolePick: 'citizen', authMode: 'login', panchayatId: localStorage.getItem('gc_panchayat') || 'vakadu-balireddypalem', panchayats: [] };
const localPanchayatFallback = [
  ['VAKADU','BALIREDDYPALEM'],['VAKADU','DUGARAJAPATNAM'],['VAKADU','JAMINKOTHAPALEM'],['VAKADU','JUVVINATTU'],['VAKADU','KALLURU'],['VAKADU','KASIPURAM'],['VAKADU','KONDAPURAM'],['VAKADU','KONDURU'],['VAKADU','MOLAGANUR'],['VAKADU','MULAPADAVA'],['VAKADU','MUTTEMBAKA'],['VAKADU','NELLIPUDI'],['VAKADU','NIDIGURTHI'],['VAKADU','RAVIGUNTAPALEM'],['VAKADU','VAKADU'],
  ['SULLURPET','ABAKA'],['SULLURPET','DAMA NELLORE'],['SULLURPET','DAMARAYA'],['SULLURPET','GOPALA REDDY PALEM'],['SULLURPET','KOTAPOLLURU'],['SULLURPET','KUDIRI'],['SULLURPET','MANGALAMPADU'],
  ['BALAYAPALLI','ALIMILI'],['BALAYAPALLI','BALAYAPALLI'],['BALAYAPALLI','BHyravaram'],['BALAYAPALLI','CHILAMANURU'],['BALAYAPALLI','KADAGUNTA'],['BALAYAPALLI','KAYYURU'],['BALAYAPALLI','MANNURU'],
  ['VENKATAGIRI','AMMAPALEM'],['VENKATAGIRI','CHELIKAMPADU'],['VENKATAGIRI','KALAPADU'],['VENKATAGIRI','LALAPET'],['VENKATAGIRI','PETLURU'],['VENKATAGIRI','SIDDAVARAM'],['VENKATAGIRI','VALLIVEDU'],
  ['DAKKILI','ALTHURUPADU'],['DAKKILI','AMUDURU'],['DAKKILI','DAKKILI'],['DAKKILI','DEVULAPALLE'],['DAKKILI','NAGAVOLU'],['DAKKILI','PALUGODU'],['DAKKILI','SREEPURAM'],
].map(([mandal,name])=>({id:`${mandal}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),mandal,name}));
const storedScopes = () => { try { return JSON.parse(localStorage.getItem('gc_item_panchayats') || '{}'); } catch (_) { return {}; } };
const saveScope = (item, scope = state.panchayatId) => { if (!item) return; const map = storedScopes(); if (item.id) map[item.id] = scope; if (item.public_id) map[item.public_id] = scope; localStorage.setItem('gc_item_panchayats', JSON.stringify(map)); };
const storedAfterPhotos = () => { try { return JSON.parse(localStorage.getItem('gc_after_photos') || '{}'); } catch (_) { return {}; } };
const saveAfterPhotos = (complaintId, urls) => { const map = storedAfterPhotos(); map[complaintId] = urls; localStorage.setItem('gc_after_photos', JSON.stringify(map)); };
function scopedItems(items, kind = 'complaint') { const map = storedScopes(), afterPhotos = storedAfterPhotos(); return (items || []).map(item => { if (!item.panchayat_id) item.panchayat_id = map[item.id] || map[item.public_id] || (kind === 'worker' && item.full_name === 'Lakshmi Devi' ? 'vakadu-dugarajapatnam' : 'vakadu-balireddypalem'); if (kind === 'complaint' && (!Array.isArray(item.after_photo_urls) || !item.after_photo_urls.length) && afterPhotos[item.id]) item.after_photo_urls = afterPhotos[item.id]; return item; }).filter(item => item.panchayat_id === state.panchayatId); }
const icon = { 'Street Lights':'💡','Water Supply':'🚰','Electricity':'⚡','Roads':'🛣️','Drainage':'🌊','Garbage':'🗑️','Sanitation':'🧹','Animal Issue':'🐕','Other':'📍' };
const human = s => String(s || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const date = value => new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value));
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 3600); }
async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type':'application/json', ...(state.token ? { Authorization:`Bearer ${state.token}` } : {}), ...(state.panchayatId ? { 'X-Panchayat-ID': state.panchayatId } : {}), ...(options.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { if (res.status === 401 && state.token) logout(); const error = new Error(body.error || body.message || 'Request failed'); Object.assign(error, body); throw error; }
  if (url === '/api/complaints' && body.complaints) body.complaints = scopedItems(body.complaints);
  if (url === '/api/workers' && body.workers) body.workers = scopedItems(body.workers, 'worker');
  if (url === '/api/sos' && body.alerts) body.alerts = scopedItems(body.alerts, 'sos');
  if (body.complaint) { body.complaint.panchayat_id ||= state.panchayatId; saveScope(body.complaint); }
  if (body.alert) { body.alert.panchayat_id ||= state.panchayatId; saveScope(body.alert); }
  return body;
}
async function uploadImages(files) {
  const data = new FormData();
  [...files].slice(0, 3).forEach(file => data.append('files', file));
  const response = await fetch('/api/uploads', { method: 'POST', headers: { ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(state.panchayatId ? { 'X-Panchayat-ID': state.panchayatId } : {}) }, body: data });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Photo upload failed');
  return (body.files || []).map(file => file.url);
}

function setRolePick(role) {
  state.rolePick = role;
  document.querySelectorAll('#role-pills button').forEach(button => button.classList.toggle('selected', button.dataset.role === role));
}
function setAuthMode(mode) {
  state.authMode = mode;
  const registering = mode === 'register';
  $('#show-login').classList.toggle('selected', !registering);
  $('#show-register').classList.toggle('selected', registering);
  $('#auth-title').textContent = registering ? 'Create your GramConnect account' : 'Welcome to GramConnect';
  $('#auth-subtitle').textContent = registering ? 'Create your account with an email address and password.' : 'Sign in securely with your email address and password.';
  $('#name-wrap').classList.toggle('hidden', !registering);
  $('#full-name').required = registering;
  $('#auth-submit').textContent = registering ? 'Create account' : 'Sign in';
  $('#password').autocomplete = registering ? 'new-password' : 'current-password';
}
async function submitCredentials() {
  const email = $('#email').value.trim().toLowerCase();
  const password = $('#password').value;
  const fullName = $('#full-name').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Please enter a valid email address.');
  if (password.length < 8) return toast('Password must contain at least 8 characters.');
  if (state.authMode === 'register' && fullName.length < 2) return toast('Please enter your name to create an account.');
  try {
    const result = await api('/api/auth/email', { method:'POST', body:JSON.stringify({ email, password, fullName, role:state.rolePick, panchayatId:state.panchayatId, intent:state.authMode }) });
    state.token = result.token; state.user = result.user; localStorage.setItem('gc_token',state.token); startApp();
  } catch (error) { toast(error.message || 'Could not sign in.'); }
}
document.querySelectorAll('#role-pills button').forEach(button => button.addEventListener('click', () => setRolePick(button.dataset.role)));
$('#show-login').addEventListener('click', () => setAuthMode('login'));
$('#show-register').addEventListener('click', () => setAuthMode('register'));
$('#auth-submit').addEventListener('click', submitCredentials);
$('#password').addEventListener('keydown', event => { if (event.key === 'Enter') submitCredentials(); });

function navItems() {
  const common = [{id:'home',label:'🏠 Home'},{id:'complaints',label:state.user.role==='admin'?'📋 Complaints':'📋 My Complaints'},{id:'notifications',label:'🔔 Notifications'},{id:'profile',label:'👤 My profile'}];
  if (state.user.role === 'citizen') return [common[0],{id:'report',label:'📢 Report problem'},{id:'workers',label:'👷 Find workers'},...common.slice(1)];
  if (state.user.role === 'worker') return [common[0],{id:'complaints',label:'🧰 My jobs'},{id:'workers',label:'👷 Worker directory'},common[2],common[3]];
  return [common[0],{id:'complaints',label:'📋 Complaint management'},{id:'workers',label:'👷 Worker management'},{id:'announcements',label:'📣 Announcements'},{id:'analytics',label:'📊 Analytics'},common[2],common[3]];
}
function currentPanchayat() { return state.panchayats.find(item => item.id === state.panchayatId); }
function applyPanchayatLabel() { const item = currentPanchayat(); const label = item ? `${item.name} Panchayat · ${item.mandal}` : state.user.village; $('#role-label').textContent = `${state.user.role.toUpperCase()} PORTAL · ${label}`; $('#side-panchayat').textContent = item ? `${item.name} Panchayat` : state.user.village; }
function renderPanchayatSelector() {
  const selector = $('#panchayat-selector'); const groups = {};
  state.panchayats.forEach(item => { (groups[item.mandal] ||= []).push(item); });
  selector.innerHTML = Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([mandal,items]) => `<optgroup label="${esc(mandal)}">${items.map(item => `<option value="${esc(item.id)}">${esc(item.name)} Panchayat</option>`).join('')}</optgroup>`).join('');
  selector.value = state.panchayatId;
  selector.onchange = () => { state.panchayatId = selector.value; localStorage.setItem('gc_panchayat', state.panchayatId); applyPanchayatLabel(); toast(`Now viewing ${currentPanchayat()?.name || 'selected'} Panchayat only.`); go(state.page); };
  applyPanchayatLabel();
}
async function loadPanchayats() {
  try { const data = await api('/api/panchayats'); if (!Array.isArray(data.panchayats) || !data.panchayats.length) throw new Error('Panchayat directory unavailable'); state.panchayats = data.panchayats; if (!state.panchayats.some(item => item.id === state.panchayatId)) state.panchayatId = state.panchayats[0]?.id || state.panchayatId; renderPanchayatSelector(); }
  catch (error) { state.panchayats = localPanchayatFallback; renderPanchayatSelector(); }
}
async function syncLegacyProfile() {
  const key = `gc_profile_${state.user.id}`;
  const syncedKey = `gc_profile_synced_${state.user.id}`;
  if (localStorage.getItem(syncedKey)) return;
  let legacy = {};
  try { legacy = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { return; }
  if (!Object.keys(legacy).length) return;
  try {
    const result = await api('/api/profile', { method:'PATCH', body:JSON.stringify({
      fullName: legacy.name || state.user.full_name,
      phone: legacy.phone || state.user.phone || '',
      designation: legacy.title || state.user.designation || '',
      village: legacy.village || state.user.village || 'Pedda Cheruvu',
      address: legacy.address || '',
      avatarUrl: legacy.photo || '',
      available: typeof legacy.available === 'boolean' ? legacy.available : undefined,
      panchayatId: state.panchayatId,
    })});
    state.user = { ...state.user, ...(result.user || {}) };
    localStorage.setItem(syncedKey, '1');
  } catch (_) { /* Keep the local profile intact and retry next time. */ }
}
function startApp() { $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#user-name').textContent = state.user.full_name.split(' ')[0]; $('#user-initial').textContent = state.user.full_name[0].toUpperCase(); renderNav(); loadPanchayats().finally(async () => { await syncLegacyProfile(); $('#user-name').textContent = state.user.full_name.split(' ')[0]; $('#user-initial').textContent = state.user.full_name[0]?.toUpperCase() || '?'; go('home'); }); }
function renderNav() { $('#nav').innerHTML = navItems().map(x => `<button class="${x.id === state.page?'active':''}" data-page="${x.id}"><span>${x.label}</span></button>`).join(''); $('#nav').querySelectorAll('button').forEach(b => b.addEventListener('click',() => go(b.dataset.page))); }
function go(page) { state.page = page; renderNav(); $('#page-title').textContent = ({home:'Home',report:'Report a problem',complaints:state.user.role==='worker'?'My workboard':state.user.role==='admin'?'Complaint management':'My complaints',workers:state.user.role==='admin'?'Worker management':'Find local workers',announcements:'Announcements',analytics:'Analytics',notifications:'Notifications',profile:'My profile'})[page]; $('#page').innerHTML='<div class="panel empty">Loading…</div>'; renderPage().catch(e => { $('#page').innerHTML = `<div class="panel empty">${esc(e.message)}</div>`; }); }
async function renderPage() { const page = state.page; if (page === 'home') return renderHome(); if (page === 'report') return renderReport(); if (page === 'complaints') return renderComplaints(); if (page === 'workers') return renderWorkers(); if (page === 'announcements') return renderAnnouncements(); if (page === 'analytics') return renderAnalytics(); if (page === 'profile') return renderProfile(); return renderNotifications(); }
function complaintEvidence(c) { const before = c.before_photo_urls || c.photo_urls || []; const after = c.after_photo_urls || []; const photos = [...before.slice(0,1).map(url=>`<button type="button" class="work-photo" data-full-image="${esc(url)}"><img src="${esc(url)}" alt="Citizen before photo">Before photo</button>`),...after.slice(0,2).map(url=>`<button type="button" class="work-photo done" data-full-image="${esc(url)}"><img src="${esc(url)}" alt="Worker after work photo">After work photo</button>`)].join(''); return photos?`<div class="work-photos">${photos}</div>`:''; }
function complaintRow(c, withActions = false) { return `<div class="complaint"><div class="cicon">${icon[c.category] || '📍'}</div><div class="detail"><strong>${esc(c.description)}</strong><small>${esc(c.public_id)} · ${esc(c.location_label || c.category)} · ${date(c.created_at)}</small>${complaintEvidence(c)}</div><span class="badge ${c.status}">${human(c.status)}</span>${withActions ? `<button class="ghost support" data-id="${c.id}">Confirm</button>`:''}</div>`; }

const announcementStoreKey = 'gc_announcements_v1';
function localAnnouncements() { try { return JSON.parse(localStorage.getItem(announcementStoreKey) || '[]'); } catch (_) { return []; } }
function saveLocalAnnouncements(items) { localStorage.setItem(announcementStoreKey, JSON.stringify(items.slice(0, 100))); }
function announcementScope(items) { return (items || []).filter(item => item.panchayat_id === state.panchayatId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
function announcementCard(item) { const image = item.image_url ? `<button type="button" class="announcement-image" style="display:block;width:100%;margin:0 0 14px;padding:0;overflow:hidden;border:0;border-radius:14px;background:#eaf1ec;cursor:zoom-in" data-full-image="${esc(item.image_url)}"><img style="display:block;width:100%;max-height:390px;object-fit:cover" src="${esc(item.image_url)}" alt="Announcement image for ${esc(item.title)}"></button>` : ''; return `<article class="notification announcement-card">${image}<div><b>${esc(item.title)}</b><p>${esc(item.message)}</p><small>Posted by ${esc(item.author_name || 'Panchayat Admin')} · ${date(item.created_at)}</small></div></article>`; }
async function getAnnouncements() {
  try {
    const result = await api('/api/announcements');
    if (!Array.isArray(result.announcements)) throw new Error('Announcements service unavailable');
    const remote = result.announcements.map(item => ({ ...item, panchayat_id: item.panchayat_id || state.panchayatId }));
    const otherPanchayats = localAnnouncements().filter(item => item.panchayat_id !== state.panchayatId);
    saveLocalAnnouncements([...remote, ...otherPanchayats]);
    return announcementScope(remote);
  } catch (_) {
    return announcementScope(localAnnouncements());
  }
}
function addLocalAnnouncement(payload) {
  const announcement = { id:`announcement-${Date.now()}`, panchayat_id:state.panchayatId, title:payload.title, message:payload.message, image_url:payload.imageUrl || '', author_name:state.user.full_name, created_at:new Date().toISOString() };
  saveLocalAnnouncements([announcement, ...localAnnouncements()]);
  return announcement;
}
async function renderAnnouncements() {
  if (state.user.role !== 'admin') return go('home');
  const announcements = await getAnnouncements();
  $('#page').innerHTML = `<section class="panel form-card" style="max-width:820px"><h2>Publish Panchayat announcement</h2><p class="sub">This update will appear on the Home page for every citizen, worker and admin in ${esc(currentPanchayat()?.name || 'this')} Panchayat.</p><form id="announcement-form"><div class="fields"><label class="full">Announcement title<input id="announcement-title" required minlength="3" maxlength="140" placeholder="e.g. Water supply maintenance"></label><label class="full">Description<textarea id="announcement-message" required minlength="5" maxlength="1000" placeholder="Write the official Panchayat update"></textarea></label><label class="full">Announcement image <small>(optional)</small><input id="announcement-image" type="file" accept="image/jpeg,image/png,image/webp"></label></div><div id="announcement-image-preview" class="attachments"></div><div class="form-footer"><button class="primary" type="submit">Publish announcement</button></div></form></section><section class="panel" style="max-width:820px;margin-top:18px"><h2>Published announcements</h2>${announcements.length ? announcements.map(announcementCard).join('') : '<div class="empty">No announcements have been published for this Panchayat yet.</div>'}</section>`;
  $('#announcement-image').addEventListener('change', event => { const file = event.target.files[0]; $('#announcement-image-preview').textContent = file ? `🖼️ ${file.name}` : ''; });
  $('#announcement-form').addEventListener('submit', async event => {
    event.preventDefault();
    const image = $('#announcement-image').files[0];
    let imageUrl = '';
    try { if (image) imageUrl = (await uploadImages([image]))[0] || ''; } catch (error) { return toast(error.message); }
    const payload = { title:$('#announcement-title').value.trim(), message:$('#announcement-message').value.trim(), imageUrl };
    try {
      const result = await api('/api/announcements', { method:'POST', body:JSON.stringify(payload) });
      if (!result.announcement) throw new Error('Announcements service unavailable');
      const otherPanchayats = localAnnouncements().filter(item => item.panchayat_id !== state.panchayatId);
      saveLocalAnnouncements([{ ...result.announcement, panchayat_id:result.announcement.panchayat_id || state.panchayatId }, ...otherPanchayats]);
    } catch (_) { addLocalAnnouncement(payload); }
    toast('Announcement published to the Home page.');
    go('announcements');
  });
}
async function renderHome() {
  const announcements = await getAnnouncements();
  const scopeName = currentPanchayat()?.name || state.user.village || 'Selected';
  $('#page').innerHTML = `<section class="hero announcement-hero"><span class="eyebrow">OFFICIAL PANCHAYAT UPDATES</span><h2>📣 ${esc(scopeName)} announcements</h2><p>Important updates from your Panchayat office. This Home page shows announcements only.</p></section><section class="panel" style="max-width:920px"><h2>Latest announcements</h2>${announcements.length ? announcements.map(announcementCard).join('') : '<div class="empty">No announcements have been published for this Panchayat yet.</div>'}</section>`;
  return;
  if (state.user.role === 'admin') return renderAdminHome();
  const { complaints } = await api('/api/complaints');
  if (state.user.role === 'worker') {
    const assigned = complaints.filter(c => !['resolved','closed'].includes(c.status));
    $('#page').innerHTML = `<section class="hero"><h2>Your work keeps Pedda Cheruvu moving.</h2><p>Review your assigned jobs, update progress from the field, and build trust with every completed repair.</p><button class="primary" data-page="complaints">Open today’s jobs</button></section><div class="section-title"><h2>Today’s work</h2><span>${assigned.length} ACTIVE JOBS</span></div><section class="panel">${assigned.length ? assigned.map(c => complaintRow(c)).join('') : '<div class="empty">No assigned jobs right now. You are all caught up.</div>'}</section>`;
  } else {
    $('#page').innerHTML = `<section class="hero"><h2>A better village begins with one report.</h2><p>Report concerns, get live updates, and help your community resolve them faster.</p><button class="primary" data-page="report">+ Report a problem</button></section><div class="section-title"><h2>Quick actions</h2><span>ONE TAP AWAY</span></div><div class="quick"><button data-page="profile"><i>👤</i><b>My profile</b><small>Update your details</small></button><button data-page="report"><i>📢</i><b>Report problem</b><small>Before photo and details</small></button><button data-page="workers"><i>👷</i><b>Find workers</b><small>Trusted local help</small></button><button data-page="complaints"><i>📋</i><b>My complaints</b><small>Track every update</small></button></div><div class="section-title"><h2>Your activity</h2><span>${complaints.length} TOTAL REPORTS</span></div><div class="stats"><div class="stat"><strong>${complaints.filter(c => !['closed','resolved'].includes(c.status)).length}</strong><span>Active complaints</span></div><div class="stat"><strong>${complaints.filter(c => c.status==='resolved').length}</strong><span>Awaiting verification</span></div><div class="stat"><strong>${complaints.reduce((n,c)=>n+c.confirmations,0)}</strong><span>Community confirmations</span></div><div class="stat"><strong>24 h</strong><span>Typical first response</span></div></div><div class="two-col"><section class="panel"><h2>Recent complaints</h2>${complaints.length ? complaints.slice(0,4).map(c=>complaintRow(c)).join('') : '<div class="empty">Nothing reported yet. Your village is looking good!</div>'}</section><section class="panel"><h2>📣 Announcements</h2><div class="notification"><b>Village clean-up drive</b><p>Join us this Sunday at 7:00 AM near the Panchayat office.</p></div><div class="notification"><b>Water supply maintenance</b><p>Supply will pause tomorrow, 10 AM–1 PM.</p></div></section></div>`;
  }
  $('#page').querySelectorAll('[data-page]').forEach(b => b.addEventListener('click',() => go(b.dataset.page)));
}

async function renderAdminHome() {
  const [{stats},{complaints}] = await Promise.all([api('/api/admin/dashboard'),api('/api/complaints')]);
  const byCat = stats.by_category || [];
  const active = complaints.filter(c=>!['closed','resolved'].includes(c.status)).length;
  const resolved = complaints.filter(c=>c.status==='resolved').length;
  $('#page').innerHTML = `<div class="section-title" style="margin-top:0"><h2>Live control room</h2><span>UPDATED NOW</span></div><div class="admin-grid"><div class="stat"><strong>${active}</strong><span>Active complaints</span></div><div class="stat"><strong>${stats.workers_online}</strong><span>Workers online</span></div><div class="stat"><strong>${resolved}</strong><span>Resolved today</span></div><div class="stat"><strong>${complaints.length}</strong><span>Total complaints</span></div></div><div class="two-col"><section class="panel"><h2>Complaints by department</h2><div class="chart">${byCat.map((x,i)=>`<div class="bar" style="height:${Math.max(20,x.count*16)}px"><small>${esc(x.category.slice(0,7))}</small></div>`).join('') || '<div class="empty">No data yet</div>'}</div></section><section class="panel"><h2>Needs attention</h2>${complaints.filter(c=>!['closed','resolved'].includes(c.status)).slice(0,3).map(c=>complaintRow(c)).join('') || '<div class="empty">No urgent items</div>'}</section></div>`;
}

function renderReport() {
  $('#page').innerHTML = `<section class="panel form-card"><h2>Report a problem</h2><p class="sub">Attach a clear before photo, then provide the complaint details for quick Panchayat action.</p><div class="steps"><div class="step on">1. BEFORE PHOTO</div><div class="step on">2. DETAILS</div><div class="step">3. SUBMIT</div></div><b style="font-size:12px">Before photo of the problem</b><div class="capture"><button type="button" id="camera"><span>📷</span>Take before photo</button><button type="button" id="gallery"><span>🖼️</span>Choose before photo</button></div><input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><div id="attachments" class="attachments"></div><form id="complaint-form"><div class="fields"><label>Problem category<select id="category" required><option value="" selected disabled>Select category</option>${Object.keys(icon).map(x=>`<option>${x}</option>`).join('')}</select></label><label>AI priority<b style="display:block;margin-top:10px;color:#26704b">Decided from repeat complaints</b></label><label>Complaint giver name<input id="reporter-name" required maxlength="120" value="${esc(state.user.full_name)}"></label><label>Contact number<input id="reporter-phone" required inputmode="tel" maxlength="15" value="${esc(state.user.phone || '')}" placeholder="Enter mobile number"></label><label class="full">Describe the problem<textarea id="description" required minlength="8" placeholder="Describe what happened"></textarea></label><label class="full">Location / landmark (manual entry)<input id="location" required placeholder="e.g. Rythu Bazaar Road, near bus stop"></label></div><div class="auto-grid"><div>📍 GPS location<b id="gps-text">Getting location…</b></div><div>🤖 AI priority<b>Based on repeat reports</b></div><div>🔎 Duplicate check<b>Location + category + 100m GPS</b></div></div><div class="form-footer"><button type="button" class="ghost" id="locate">Refresh GPS</button><button class="primary" type="submit">Submit complaint →</button></div></form><div id="camera-modal" class="camera-modal hidden" role="dialog" aria-label="Take before photo"><div class="camera-card"><b>Take before photo</b><video id="camera-preview" autoplay playsinline></video><div><button type="button" class="ghost" id="close-camera">Cancel</button><button type="button" class="ghost" id="flip-camera">🔄 Switch camera</button><button type="button" class="primary" id="capture-camera">📷 Capture photo</button></div></div></div></section>`;
  let coords = { latitude:17.410, longitude:78.468 }, selectedFiles = [];
  const locate = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(pos => { coords={latitude:pos.coords.latitude,longitude:pos.coords.longitude}; $('#gps-text').textContent='Current location attached'; }, () => { $('#gps-text').textContent='Approximate location used'; }) : ($('#gps-text').textContent='Location unavailable');
  const showFiles = () => { $('#attachments').innerHTML = selectedFiles.map((file, index) => `<span class="attachment">🖼️ ${esc(file.name)} <button type="button" data-remove="${index}">×</button></span>`).join(''); $('#attachments').querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { selectedFiles.splice(Number(button.dataset.remove), 1); showFiles(); })); };
  const chooseFiles = () => { const picker = $('#photo-files'); picker.removeAttribute('capture'); picker.click(); };
  let cameraStream, cameraFacing = 'environment';
  const closeCamera = () => { cameraStream?.getTracks().forEach(track => track.stop()); cameraStream = null; $('#camera-preview').srcObject = null; $('#camera-modal').classList.add('hidden'); };
  const startCamera = async () => { cameraStream?.getTracks().forEach(track => track.stop()); const quality = { width: { ideal: 3840 }, height: { ideal: 2160 }, facingMode: { exact: cameraFacing } }; try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: quality, audio: false }); } catch (error) { if (cameraFacing !== 'environment') throw error; cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }); } $('#camera-preview').srcObject = cameraStream; };
  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { $('#photo-files').setAttribute('capture', 'environment'); $('#photo-files').click(); return; }
    try { await startCamera(); $('#camera-modal').classList.remove('hidden'); }
    catch (_) { toast('Camera permission was not granted. You can choose a photo from the gallery.'); }
  };
  locate(); $('#locate').addEventListener('click',locate); $('#camera').addEventListener('click',openCamera); $('#gallery').addEventListener('click',chooseFiles); $('#close-camera').addEventListener('click',closeCamera); $('#flip-camera').addEventListener('click', async () => { cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment'; try { await startCamera(); } catch (_) { toast('The other camera is not available on this device.'); } });
  $('#capture-camera').addEventListener('click', () => { const video = $('#camera-preview'); const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); canvas.toBlob(blob => { if (!blob) return toast('Photo could not be captured.'); selectedFiles = [new File([blob], `before-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })]; showFiles(); closeCamera(); toast('Full-resolution before photo attached. Submit the complaint to upload it.'); }, 'image/jpeg', .98); });
  let voiceFile, voiceRecorder, voiceStream, speechRecognition;
  const voiceButton = $('#voice-proof') || document.createElement('button');
  const setVoiceStatus = text => { $('#voice-status').innerHTML = text ? `<span class="attachment">🎙️ ${esc(text)}</span>` : ''; };
  const stopVoice = () => { if (voiceRecorder?.state === 'recording') voiceRecorder.stop(); speechRecognition?.stop(); voiceStream?.getTracks().forEach(track => track.stop()); voiceButton.innerHTML = '<span>🎙️</span>Record voice complaint'; };
  voiceButton.addEventListener('click', async () => {
    if (voiceRecorder?.state === 'recording') return stopVoice();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Voice recording is not supported by this browser.');
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); const chunks = [];
      voiceRecorder = new MediaRecorder(voiceStream, MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm', audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 });
      voiceRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      voiceRecorder.onstop = () => { const blob = new Blob(chunks, { type: voiceRecorder.mimeType || 'audio/webm' }); voiceFile = new File([blob], `voice-complaint-${Date.now()}.webm`, { type: blob.type }); setVoiceStatus(`Voice proof recorded (${Math.ceil(blob.size / 1024)} KB)`); };
      voiceRecorder.start(); voiceButton.innerHTML = '<span>⏹️</span>Stop voice recording'; setVoiceStatus('Recording… tap Stop when finished');
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (Recognition) { speechRecognition = new Recognition(); speechRecognition.lang = navigator.language || 'en-IN'; speechRecognition.continuous = true; speechRecognition.interimResults = true; speechRecognition.onresult = event => { let transcript = ''; for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript; if (transcript) $('#description').value = transcript; }; speechRecognition.start(); }
    } catch (_) { toast('Microphone permission was not granted.'); }
  });
  $('#photo-files').addEventListener('change', event => { selectedFiles = [...event.target.files].slice(0, 3); if (event.target.files.length > 3) toast('Up to three images can be attached.'); showFiles(); });
  $('#complaint-form').addEventListener('submit',async e => { e.preventDefault(); if (!selectedFiles.length && !voiceFile) return toast('Attach a before photo or record a voice complaint.'); if (!$('#description').value.trim() && voiceFile) $('#description').value = 'Voice complaint — listen to the attached original recording.'; const submit = e.submitter; submit.disabled = true; submit.textContent = 'Uploading evidence…'; try { const photoUrls = selectedFiles.length ? await uploadImages(selectedFiles) : []; const voiceUrls = voiceFile ? await uploadImages([voiceFile]) : []; const body={description:$('#description').value,category:$('#category').value,reporterName:$('#reporter-name').value,reporterPhone:$('#reporter-phone').value,locationLabel:$('#location').value,photoUrls,voiceUrls,...coords}; const result=await api('/api/complaints',{method:'POST',body:JSON.stringify(body)}); toast(`✅ Complaint ${result.complaint.public_id} submitted. AI priority: ${human(result.complaint.priority)}.`); go('complaints'); } catch(error) { submit.disabled = false; submit.textContent = 'Submit complaint →'; if (error.duplicate && confirm(`${error.message}\n\nSupport existing complaint ${error.duplicate.public_id}?`)) { try { await api(`/api/complaints/${error.duplicate.id}/support`,{method:'POST',body:JSON.stringify({stance:'confirm'})}); toast('You supported the existing complaint. Priority was updated.'); } catch (supportError) { toast(supportError.message); } } else toast(error.message); } });
}

async function renderComplaints() {
  const [{complaints}, workersData] = await Promise.all([api('/api/complaints'), state.user.role==='admin' ? api('/api/workers') : Promise.resolve({workers:[]})]);
  if (!complaints.length) { $('#page').innerHTML = `<section class="panel empty">${state.user.role==='worker'?'No work assigned right now.':'No complaints yet.'}</section>`; return; }
  if (state.user.role === 'admin') {
    $('#page').innerHTML = `<section class="panel"><h2>Assign, review and close complaints</h2><p class="sub">Before/after evidence and citizen voice proof stay with each complaint.</p>${complaints.map(c=>`<div class="admin-item" data-id="${c.id}"><b>${icon[c.category]||'📍'} ${esc(c.description)} <span class="badge ${c.status}">${human(c.status)}</span></b><small>${esc(c.public_id)} · ${esc(c.location_label||c.category)} · ${c.confirmations} confirmations</small>${complaintEvidence(c)}<div><select class="worker-select"><option value="">Assign worker…</option>${workersData.workers.map(w=>`<option value="${w.id}" ${w.id===c.assigned_worker_id?'selected':''}>${esc(w.full_name)} — ${esc((w.skills||[])[0]||'Worker')}</option>`).join('')}</select><select class="status-select">${['under_review','assigned','on_the_way','in_progress','resolved','verification','closed'].map(s=>`<option value="${s}" ${s===c.status?'selected':''}>${human(s)}</option>`).join('')}</select><button class="primary save-complaint">Save</button></div></div>`).join('')}</section>`;
    document.querySelectorAll('.save-complaint').forEach(b=>b.addEventListener('click',async()=>{const row=b.closest('.admin-item'); try { b.disabled=true; b.textContent='Saving…'; const result=await api(`/api/complaints/${row.dataset.id}`,{method:'PATCH',body:JSON.stringify({assignedWorkerId:row.querySelector('.worker-select').value || undefined,status:row.querySelector('.status-select').value,note:'Updated by Panchayat admin'})});toast(result.workerAssigned?`${result.workerName} assigned and notified.`:'Complaint updated.');go('complaints');}catch(e){b.disabled=false;b.textContent='Save';toast(e.message)}}));
  } else if (state.user.role === 'worker') {
    $('#page').innerHTML = `<section class="panel"><h2>My assigned jobs</h2><p class="sub">When work is resolved, attach the after photo as proof of completion.</p>${complaints.map(c=>`<div class="admin-item" data-id="${c.id}"><b>${icon[c.category]||'📍'} ${esc(c.description)} <span class="badge ${c.status}">${human(c.status)}</span></b><small>${esc(c.public_id)} · ${esc(c.location_label||'Location shared')} · Citizen: ${esc(c.citizen_name)} · ${esc(c.reporter_phone||'')}</small><div><select class="status-select">${['on_the_way','in_progress','resolved'].map(s=>`<option value="${s}" ${s===c.status?'selected':''}>${human(s)}</option>`).join('')}</select><input class="after-photo" type="file" accept="image/jpeg,image/png,image/webp" multiple title="After photo"><button class="primary update-job">Update job</button></div></div>`).join('')}</section>`;
    document.querySelectorAll('.update-job').forEach(b=>b.addEventListener('click',async()=>{const row=b.closest('.admin-item'),status=row.querySelector('.status-select').value,files=[...row.querySelector('.after-photo').files];if(status==='resolved'&&!files.length)return toast('Attach at least one after photo before completing work.');try{b.disabled=true;b.textContent=files.length?'Uploading…':'Updating…';const photoUrls=files.length?await uploadImages(files):[];if(status==='resolved'&&photoUrls.length)saveAfterPhotos(row.dataset.id,photoUrls);await api(`/api/complaints/${row.dataset.id}`,{method:'PATCH',body:JSON.stringify({status,photoUrls,note:'Progress updated by assigned worker'})});toast(status==='resolved'?'Work completed with after photo.':'Progress shared with the citizen.');go('complaints');}catch(e){b.disabled=false;b.textContent='Update job';toast(e.message)}}));
  } else {
    $('#page').innerHTML = `<section class="panel"><h2>My complaints</h2><p class="sub">Follow every stage, from initial report to citizen verification.</p>${complaints.map(c=>complaintRow(c)).join('')}</section>`;
  }
}

async function renderSOS() {
  if (state.user.role === 'admin') { const {alerts}=await api('/api/sos'); $('#page').innerHTML = `<section class="panel"><h2>SOS control centre</h2><p class="sub">Each alert contains the citizen’s profile name, mobile number, live GPS, and the category response route.</p>${alerts.length?alerts.map(a=>`<div class="admin-item" data-id="${a.id}"><b>🚨 ${human(a.alert_type)} — ${esc(a.full_name)} <span class="badge ${a.status==='open'?'critical':'resolved'}">${human(a.status)}</span></b><small>Citizen: ${esc(a.phone)} · ${date(a.created_at)} · GPS ${a.latitude||'not available'}, ${a.longitude||'not available'}</small><small>Dispatched to: ${esc((a.routed_to||['Panchayat emergency coordinator']).join(' · '))}</small><div><select class="sos-status"><option value="open" ${a.status==='open'?'selected':''}>Open</option><option value="acknowledged" ${a.status==='acknowledged'?'selected':''}>Acknowledged</option><option value="resolved" ${a.status==='resolved'?'selected':''}>Resolved</option></select><button class="primary update-sos">Save status</button></div></div>`).join(''):'<div class="empty">There are no SOS alerts. Good news.</div>'}</section>`; document.querySelectorAll('.update-sos').forEach(b=>b.addEventListener('click',async()=>{const row=b.closest('.admin-item');try{await api(`/api/sos/${row.dataset.id}`,{method:'PATCH',body:JSON.stringify({status:row.querySelector('.sos-status').value})});toast('SOS status updated.');go('sos');}catch(e){toast(e.message)}})); return; }
  $('#page').innerHTML = `<section class="panel sos-card"><div style="font-size:33px">🚨</div><h2>Emergency SOS</h2><p>Tap to alert the Panchayat control room. Your GPS location will be attached automatically.</p><button class="sos-button" id="send-sos">SEND<br>SOS</button><div class="sos-types" id="sos-types">${[['medical','🏥 Medical'],['fire','🔥 Fire'],['police','👮 Police'],['electricity','⚡ Electricity'],['flood','🌊 Flood'],['animal_attack','🐕 Animal attack'],['women_safety','🛡️ Women safety']].map(([v,l])=>`<button data-type="${v}">${l}</button>`).join('')}</div></section>`;
  let type='medical'; $('#sos-types').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{type=b.dataset.type;$('#sos-types').querySelectorAll('button').forEach(x=>x.style.background='#fff');b.style.background='#ffe4df';toast(`${human(type)} selected`)}));
  $('#send-sos').addEventListener('click',()=>{const post=coords=>api('/api/sos',{method:'POST',body:JSON.stringify({type,latitude:coords?.latitude,longitude:coords?.longitude})}).then(r=>toast(`🚨 ${r.message}`)).catch(e=>toast(e.message));navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>post(p.coords),()=>post()):post();});
}

async function renderWorkersLegacyAvailability() {
  const {workers} = await api('/api/workers');
  $('#page').innerHTML = `<section class="panel" style="max-width:920px"><h2>${state.user.role==='admin'?'Verified worker directory':'Find local workers'}</h2><p class="sub">${state.user.role==='admin'?'Availability and identity status for your Panchayat workforce.':'Trusted workers available in and around your village.'}</p>${workers.length?workers.map(w=>`<div class="worker"><div class="face">${(w.skills||[]).includes('Electricity')?'⚡':'👷'}</div><div><b>${esc(w.full_name)} ${w.identity_verified?'✓':''}</b><small>${esc((w.skills||[]).join(' · '))} · ${w.rating} ★ · ${w.jobs_completed} jobs completed · ${w.available?'Available now':'Unavailable'}</small></div><button class="ghost">${state.user.role==='admin'?'Manage':'Contact'}</button></div>`).join(''):'<div class="empty">No workers are currently available.</div>'}</section>`;
}

async function renderProfile() {
  const result = await api('/api/profile');
  const record = result.profile || state.user;
  const defaults = { citizen: 'Citizen', worker: 'Electrician / Local Worker', admin: 'Panchayat Admin / MRO' };
  const profile = { name:record.full_name || state.user.full_name, phone:record.phone || '', title:record.designation || defaults[state.user.role], village:record.village || state.user.village || '', address:record.address || '', photo:record.avatar_url || '', available:record.available !== false };
  const avatar = profile.photo ? `<img src="${esc(profile.photo)}" alt="Profile photo">` : esc(profile.name.slice(0, 1).toUpperCase());
  const availability = state.user.role === 'worker' ? `<label class="full worker-availability"><input id="profile-available" type="checkbox" ${profile.available ? 'checked' : ''}> Available to receive new jobs and consultation calls</label>` : '';
  $('#page').innerHTML = `<section class="panel profile-card"><div class="profile-heading"><div class="profile-avatar" id="profile-avatar">${avatar}</div><div><h2>${esc(profile.name)}</h2><p>${human(state.user.role)} · ${esc(profile.village)}</p></div></div><form id="profile-form"><input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="ghost" id="change-profile-photo">Change profile photo</button><div class="fields"><label>Full name<input id="profile-name" required maxlength="120" value="${esc(profile.name)}"></label><label>Mobile number<input id="profile-phone" required inputmode="tel" maxlength="15" value="${esc(profile.phone)}" placeholder="Enter mobile number"></label><label>Role / designation<input id="profile-title" required maxlength="100" value="${esc(profile.title)}" placeholder="e.g. Electrician, MRO, Citizen"></label><label>Village / Panchayat<input id="profile-village" required maxlength="120" value="${esc(profile.village)}" placeholder="Your village or Panchayat"></label><label class="full">Address<textarea id="profile-address" placeholder="House number, street, village, mandal, district">${esc(profile.address)}</textarea></label>${availability}</div><div class="form-footer"><button class="primary" type="submit">Save profile</button></div></form></section>`;
  let photoUrl = profile.photo;
  let newPhoto = null;
  $('#change-profile-photo').addEventListener('click', () => $('#profile-photo-file').click());
  $('#profile-photo-file').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; newPhoto = file; const reader = new FileReader(); reader.onload = () => { $('#profile-avatar').innerHTML = `<img src="${esc(reader.result)}" alt="Profile photo">`; }; reader.readAsDataURL(file); });
  $('#profile-form').addEventListener('submit', async event => { event.preventDefault(); const saveButton = $('#profile-form button[type="submit"]'); try { saveButton.disabled=true; saveButton.textContent='Saving…'; if (newPhoto) photoUrl = (await uploadImages([newPhoto]))[0] || photoUrl; const result = await api('/api/profile',{method:'PATCH',body:JSON.stringify({fullName:$('#profile-name').value.trim(),phone:$('#profile-phone').value.trim(),designation:$('#profile-title').value.trim(),village:$('#profile-village').value.trim(),address:$('#profile-address').value.trim(),avatarUrl:photoUrl,panchayatId:state.panchayatId,available:state.user.role==='worker' ? $('#profile-available').checked : undefined})}); state.user = { ...state.user, ...(result.user || result.profile || {}) }; $('#user-name').textContent = state.user.full_name.split(' ')[0]; $('#user-initial').textContent = state.user.full_name[0]?.toUpperCase() || '?'; toast('Profile saved and shared with your Panchayat.'); go('profile'); } catch (error) { saveButton.disabled=false; saveButton.textContent='Save profile'; toast(error.message || 'Profile could not be saved.'); } });
}

async function renderAnalytics() { const {stats}=await api('/api/admin/dashboard'); const cats=stats.by_category||[]; $('#page').innerHTML=`<div class="admin-grid"><div class="stat"><strong>${stats.active_complaints}</strong><span>Open complaints</span></div><div class="stat"><strong>${stats.resolved_today}</strong><span>Closed today</span></div><div class="stat"><strong>${stats.workers_online}</strong><span>Worker availability</span></div><div class="stat"><strong>4.7 ★</strong><span>Average worker rating</span></div></div><div class="two-col"><section class="panel"><h2>Complaints by department</h2><div class="chart">${cats.map(x=>`<div class="bar" style="height:${Math.max(24,x.count*18)}px"><small>${esc(x.category.slice(0,8))}</small></div>`).join('')}</div></section><section class="panel"><h2>Performance note</h2><p class="sub">Resolution time, village heatmaps and monthly trends are ready for a mapping and BI integration.</p><div class="notification"><b>Community verification boosts priority</b><p>Complaints with 5+ confirmations are automatically raised to High.</p></div></section></div>`; }
async function renderNotifications() { const {notifications}=await api('/api/notifications'); $('#notification-count').style.display=notifications.some(n=>!n.is_read)?'block':'none'; $('#page').innerHTML=`<section class="panel" style="max-width:820px"><h2>Notification centre</h2>${notifications.length?notifications.map(n=>`<div class="notification"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${date(n.created_at)}</small></div>`).join(''):'<div class="empty">You’re all caught up.</div>'}</section>`; }
function publicWorkerProfile(worker) { return { name:worker.full_name, phone:worker.phone || '', title:worker.designation || (worker.skills || []).join(' · ') || 'Local Worker', village:worker.village || '', address:worker.address || '', photo:worker.avatar_url || '', available:worker.available !== false }; }
async function renderWorkersLegacyContacts() { const {workers} = await api('/api/workers'); $('#page').innerHTML = `<section class="panel" style="max-width:920px"><h2>${state.user.role==='admin'?'Verified worker directory':'Find local workers'}</h2><p class="sub">${state.user.role==='admin'?'Worker profile details are available for Panchayat coordination.':'See local workers, their role, village, and mobile number to consult them directly.'}</p>${workers.length?workers.map(w=>{const profile=publicWorkerProfile(w);const face=profile.photo?`<img src="${esc(profile.photo)}" alt="${esc(profile.name)}">`:((w.skills||[]).includes('Electricity')?'⚡':'👷');return `<div class="worker"><div class="face">${face}</div><div><b>${esc(profile.name)} ${w.identity_verified?'✓':''}</b><small>${esc(profile.title)} · ${esc(profile.village || 'Village not set')} · ${esc(profile.phone || 'Mobile not set')}</small><small>${w.rating} ★ · ${w.jobs_completed} jobs completed · ${w.available?'Available now':'Unavailable'}</small></div>${profile.phone?`<a class="ghost worker-contact" href="tel:${esc(profile.phone)}">Call</a>`:`<span class="ghost">No number</span>`}</div>`;}).join(''):'<div class="empty">No workers are currently available.</div>'}</section>`; }
function workerRatings() {
  try { return JSON.parse(localStorage.getItem('gc_worker_ratings') || '{}'); } catch (_) { return {}; }
}
function workerRating(worker) {
  return workerRatings()[worker.id] || { average: Number(worker.rating || 0), count: 0 };
}
function ensureWorkerDialogStyles() {
  if (document.getElementById('worker-dialog-styles')) return;
  const style = document.createElement('style');
  style.id = 'worker-dialog-styles';
  style.textContent = '.worker-dialog-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(7,35,25,.56)}.worker-dialog{position:relative;width:min(100%,420px);padding:28px;border-radius:22px;background:#fff;color:#173b2d;box-shadow:0 20px 60px rgba(0,0,0,.28);text-align:center}.dialog-close{position:absolute;top:12px;right:15px;border:0;background:transparent;font-size:29px;line-height:1;color:#587064;cursor:pointer}.dialog-icon{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 12px;border-radius:16px;background:#e6f6ea;font-size:27px}.worker-dialog h2{margin:0 0 6px}.worker-dialog p{margin:7px 0;color:#62776d}.phone-number{display:block;margin:18px 0 10px;font-size:23px;letter-spacing:.5px}.dialog-actions{display:flex;gap:10px;justify-content:center;margin-top:20px}.dialog-actions>*{min-width:132px;justify-content:center;text-decoration:none}.star-picker{display:flex;justify-content:center;gap:7px;margin:20px 0 4px}.star-choice{border:0;background:transparent;color:#d5ded8;font-size:41px;line-height:1;cursor:pointer;padding:2px}.star-choice.selected{color:#f1aa23}.rating-hint{min-height:22px;font-weight:700}.save-worker-rating:disabled{opacity:.45;cursor:not-allowed}@media(max-width:520px){.worker-dialog{padding:25px 18px}.dialog-actions>*{min-width:0;flex:1}}';
  document.head.appendChild(style);
}
function showWorkerCall(worker, profile) {
  ensureWorkerDialogStyles();
  document.querySelector('#worker-contact-dialog')?.remove();
  const safePhone = esc(profile.phone || 'Mobile number not set');
  document.body.insertAdjacentHTML('beforeend', `<div class="worker-dialog-backdrop" id="worker-contact-dialog"><section class="worker-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-worker-title"><button type="button" class="dialog-close" aria-label="Close">×</button><span class="dialog-icon">📞</span><h2 id="contact-worker-title">Call ${esc(profile.name)}</h2><p>${esc(profile.title)} · ${esc(profile.village || 'Local worker')}</p><strong class="phone-number">${safePhone}</strong><p class="sub">On a phone, tap Call now to open the dialer. On a computer, copy the number and call from your mobile.</p><div class="dialog-actions"><a class="primary" href="tel:${safePhone}">Call now</a><button type="button" class="ghost copy-worker-phone" data-phone="${safePhone}">Copy number</button></div></section></div>`);
  const dialog = $('#worker-contact-dialog');
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.remove(); });
  dialog.querySelector('.copy-worker-phone').addEventListener('click', async event => {
    const phone = event.currentTarget.dataset.phone;
    try { await navigator.clipboard.writeText(phone); toast('Worker mobile number copied.'); }
    catch (_) { toast(`Call this number: ${phone}`); }
  });
}
function showWorkerRating(worker) {
  ensureWorkerDialogStyles();
  document.querySelector('#worker-rating-dialog')?.remove();
  const current = workerRating(worker);
  document.body.insertAdjacentHTML('beforeend', `<div class="worker-dialog-backdrop" id="worker-rating-dialog"><section class="worker-dialog" role="dialog" aria-modal="true" aria-labelledby="rate-worker-title"><button type="button" class="dialog-close" aria-label="Close">×</button><span class="dialog-icon">⭐</span><h2 id="rate-worker-title">Rate ${esc(worker.full_name)}</h2><p>Choose a rating for the service you received.</p><div class="star-picker" role="radiogroup" aria-label="Worker rating">${[1,2,3,4,5].map(score => `<button type="button" class="star-choice" data-score="${score}" role="radio" aria-checked="false" aria-label="${score} star${score > 1 ? 's' : ''}">★</button>`).join('')}</div><p class="rating-hint" id="rating-hint">Select 1 to 5 stars</p><div class="dialog-actions"><button type="button" class="ghost dialog-cancel">Cancel</button><button type="button" class="primary save-worker-rating" disabled>Save rating</button></div></section></div>`);
  const dialog = $('#worker-rating-dialog');
  let selectedScore = 0;
  const close = () => dialog.remove();
  dialog.querySelector('.dialog-close').addEventListener('click', close);
  dialog.querySelector('.dialog-cancel').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  const saveButton = dialog.querySelector('.save-worker-rating');
  dialog.querySelectorAll('.star-choice').forEach(button => button.addEventListener('click', () => {
    selectedScore = Number(button.dataset.score);
    dialog.querySelectorAll('.star-choice').forEach(star => { const active = Number(star.dataset.score) <= selectedScore; star.classList.toggle('selected', active); star.setAttribute('aria-checked', String(Number(star.dataset.score) === selectedScore)); });
    $('#rating-hint').textContent = `${selectedScore} out of 5 stars`;
    saveButton.disabled = false;
  }));
  saveButton.addEventListener('click', () => {
    if (!selectedScore) return;
    const personalKey = `gc_worker_rating_${state.user.id}`;
    let personal = {}; try { personal = JSON.parse(localStorage.getItem(personalKey) || '{}'); } catch (_) {}
    const previous = personal[worker.id]; personal[worker.id] = selectedScore; localStorage.setItem(personalKey, JSON.stringify(personal));
    const ratings = workerRatings(); const count = Math.max(Number(current.count || 0), 1);
    ratings[worker.id] = previous ? { average: Number((Number(current.average) + (selectedScore - previous) / count).toFixed(1)), count: current.count } : { average: Number(((Number(current.average) * count + selectedScore) / (count + 1)).toFixed(1)), count: count + 1 };
    localStorage.setItem('gc_worker_ratings', JSON.stringify(ratings));
    close(); toast('Thank you — your rating was saved.'); renderWorkers();
  });
}
function publicWorkerProfileLegacy(worker) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(`gc_profile_${worker.id}`) || '{}'); } catch (_) {}
  const fallbackPhone = { 'worker-1': '9000000002', 'worker-2': '9000000003' }[worker.id] || '';
  return { name: worker.full_name, phone: fallbackPhone, title: (worker.skills || []).join(' · ') || 'Local Worker', village: worker.village || '', photo: '', available: worker.available !== false, ...saved };
}
async function renderWorkers() {
  const { workers } = await api('/api/workers');
  const visible = workers;
  const cards = visible.map(w => {
    const profile = publicWorkerProfile(w);
    const rating = workerRating(w);
    const stars = '★'.repeat(Math.round(rating.average || 0)) + '☆'.repeat(5 - Math.round(rating.average || 0));
    const face = profile.photo ? `<img src="${esc(profile.photo)}" alt="${esc(profile.name)}">` : ((w.skills || []).includes('Electricity') ? '⚡' : '👷');
    const selfAction = `<button class="ghost toggle-availability">Mark ${profile.available !== false ? 'unavailable' : 'available'}</button>`;
    const citizenAction = `<div class="worker-actions">${profile.phone ? `<button type="button" class="ghost worker-contact" data-phone="${esc(profile.phone)}">Call</button>` : ''}<button type="button" class="ghost rate-worker">Rate</button></div>`;
    const adminAction = profile.phone ? `<button type="button" class="ghost worker-contact" data-phone="${esc(profile.phone)}">Call</button>` : '';
    const action = state.user.role === 'worker' && w.id === state.user.id ? selfAction : state.user.role === 'citizen' ? citizenAction : adminAction;
    return `<div class="worker" data-worker-id="${w.id}"><div class="face">${face}</div><div><b>${esc(profile.name)} ${w.identity_verified ? '✓' : ''}</b><small>${esc(profile.title)} · ${esc(profile.village || 'Village not set')} · ${esc(profile.phone || 'Mobile not set')}</small><small><span class="availability">● ${profile.available !== false ? 'Available now' : 'Unavailable'}</span> · <span class="rating">${stars} ${Number(rating.average || 0).toFixed(1)}</span></small></div>${action}</div>`;
  }).join('');
  const heading = state.user.role === 'admin' ? 'Verified worker directory' : 'Find local workers';
  const subtitle = state.user.role === 'worker' ? 'Set your availability so Citizens and Admins know whether they can consult you.' : state.user.role === 'admin' ? 'Current worker profiles, availability and community ratings.' : 'Consult available local workers and rate a worker after service is complete.';
  $('#page').innerHTML = `<section class="panel" style="max-width:920px"><h2>${heading}</h2><p class="sub">${subtitle}</p>${cards || '<div class="empty">No workers are currently available.</div>'}</section>`;
  document.querySelectorAll('.toggle-availability').forEach(button => button.addEventListener('click', async () => {
    const worker = workers.find(item => item.id === button.closest('.worker').dataset.workerId);
    if (!worker) return;
    const nextAvailability = worker.available === false;
    try {
      button.disabled = true;
      button.textContent = 'Saving…';
      await api('/api/profile', { method:'PATCH', body:JSON.stringify({
        fullName:state.user.full_name,
        phone:state.user.phone || '',
        designation:state.user.designation || (worker.skills || []).join(' · ') || 'Local Worker',
        village:state.user.village || worker.village || 'Pedda Cheruvu',
        panchayatId:state.panchayatId,
        available:nextAvailability,
      })});
      toast(`You are now marked ${nextAvailability ? 'available' : 'unavailable'}.`);
      renderWorkers();
    } catch (error) { button.disabled = false; button.textContent = 'Try again'; toast(error.message || 'Availability could not be updated.'); }
  }));
  document.querySelectorAll('.worker-contact').forEach(button => button.addEventListener('click', () => {
    const worker = workers.find(w => w.id === button.closest('.worker').dataset.workerId);
    showWorkerCall(worker, publicWorkerProfile(worker));
  }));
  document.querySelectorAll('.rate-worker').forEach(button => button.addEventListener('click', () => {
    const worker = workers.find(w => w.id === button.closest('.worker').dataset.workerId);
    showWorkerRating(worker);
  }));
}
function logout() { localStorage.removeItem('gc_token'); state.token=null;state.user=null; $('#app').classList.add('hidden');$('#auth').classList.remove('hidden'); $('#password').value = ''; }
$('#logout').addEventListener('click',logout); document.querySelector('.icon-btn').addEventListener('click',()=>go('notifications'));
document.addEventListener('click', event => { const trigger = event.target.closest('[data-full-image]'); if (!trigger) return; $('#full-photo').src = trigger.dataset.fullImage; $('#photo-viewer').classList.remove('hidden'); });
$('#close-photo-viewer').addEventListener('click', () => { $('#full-photo').src = ''; $('#photo-viewer').classList.add('hidden'); });
$('#photo-viewer').addEventListener('click', event => { if (event.target.id === 'photo-viewer') $('#close-photo-viewer').click(); });
(async()=>{ if(!state.token)return; try { const {user}=await api('/api/me');state.user=user;startApp(); }catch{logout();} })();
