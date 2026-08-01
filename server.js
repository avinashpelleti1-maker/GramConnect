require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { pool } = require('./lib/db');
const { sign, required, allow } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDirectory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDirectory),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, callback) => callback(null, /^(image\/(jpeg|png|webp)|audio\/(webm|mpeg|wav|x-wav|mp4|aac))$/.test(file.mimetype)),
});
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDirectory));

const categories = [
  ['Street Lights', /street\s*light|లైట్|లైటు/i], ['Water Supply', /water|leak|నీరు|పైపు/i],
  ['Electricity', /electric|pole|current|కరెంటు|స్తంభం/i], ['Roads', /road|pothole|రహదారి|గుంత/i],
  ['Drainage', /drain|overflow|కాలువ/i], ['Garbage', /garbage|waste|చెత్త/i],
  ['Sanitation', /toilet|sanitation|పారిశుద్ధ్యం/i], ['Animal Issue', /animal|dog|cattle|కుక్క/i]
];
function classify(text = '') { const match = categories.find(([, pattern]) => pattern.test(text)); const urgent = /fire|flood|medical|fallen|live wire|ప్రమాదం/i.test(text); return { category: match?.[0] || 'Other', priority: urgent ? 'high' : 'medium', confidence: match ? .87 : .55 }; }
function publicId() { return `GC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`; }
function alertAdmins(title, body) { return pool.query("INSERT INTO notifications (user_id,title,body) SELECT id,$1,$2 FROM users WHERE role='admin'", [title, body]); }
function statusTitle(status) { return status.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function selectedPanchayat(req) { return String(req.headers['x-panchayat-id'] || 'vakadu-balireddypalem').slice(0, 120); }
function requestedPanchayat(value) { return String(value || 'vakadu-balireddypalem').trim().slice(0, 120) || 'vakadu-balireddypalem'; }

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'GramConnect API' }));

app.post('/api/auth/email', async (req, res, next) => {
  try {
    const intent = req.body.intent === 'register' ? 'register' : 'login';
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fullName = String(req.body.fullName || '').trim().slice(0, 120);
    const role = ['citizen', 'worker', 'admin'].includes(req.body.role) ? req.body.role : 'citizen';
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });

    let { rows } = await pool.query('SELECT id,full_name,email,phone,role,village,panchayat_id,designation,address,avatar_url,password_hash FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    let user = rows[0];
    if (intent === 'register') {
      if (user) return res.status(409).json({ error: 'An account already exists with this email. Please sign in instead.' });
      if (fullName.length < 2) return res.status(400).json({ error: 'Please enter your name to create an account.' });
      const passwordHash = await bcrypt.hash(password, 12);
      const panchayatId = requestedPanchayat(req.body.panchayatId);
      ({ rows } = await pool.query('INSERT INTO users (email,password_hash,full_name,role,village,panchayat_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,full_name,email,phone,role,village,panchayat_id,designation,address,avatar_url', [email, passwordHash, fullName, role, 'Pedda Cheruvu', panchayatId]));
      user = rows[0];
      if (role === 'worker') await pool.query('INSERT INTO worker_profiles (user_id, skills, experience_years, identity_verified) VALUES ($1,$2,0,false)', [user.id, ['General service']]);
    } else {
      if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
      delete user.password_hash;
    }
    res.json({ token: sign(user), user });
  } catch (error) { next(error); }
});

app.get('/api/me', required, (req, res) => res.json({ user: req.user }));

app.get('/api/profile', required, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT u.id,u.full_name,u.email,u.phone,u.role,u.village,u.panchayat_id,u.designation,u.address,u.avatar_url,
      wp.skills,wp.experience_years,wp.available,wp.identity_verified,wp.rating,wp.jobs_completed
      FROM users u LEFT JOIN worker_profiles wp ON wp.user_id=u.id WHERE u.id=$1`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: rows[0] });
  } catch (error) { next(error); }
});

app.patch('/api/profile', required, async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    const fullName = String(req.body.fullName ?? req.user.full_name ?? '').trim().slice(0, 120);
    const phone = String(req.body.phone ?? '').trim().slice(0, 15) || null;
    const village = String(req.body.village ?? req.user.village ?? '').trim().slice(0, 120);
    const designation = String(req.body.designation ?? '').trim().slice(0, 100) || null;
    const address = String(req.body.address ?? '').trim().slice(0, 800) || null;
    const avatarUrl = String(req.body.avatarUrl ?? '').trim().slice(0, 1200) || null;
    const panchayatId = requestedPanchayat(req.body.panchayatId || req.user.panchayat_id);
    if (fullName.length < 2 || village.length < 2) return res.status(400).json({ error: 'Please enter your name and village.' });
    if (phone && !/^[+0-9][0-9\- ]{7,14}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid mobile number.' });

    await client.query('BEGIN');
    const { rows } = await client.query(`UPDATE users
      SET full_name=$1,phone=$2,village=$3,panchayat_id=$4,designation=$5,address=$6,avatar_url=$7
      WHERE id=$8
      RETURNING id,full_name,email,phone,role,village,panchayat_id,designation,address,avatar_url`,
      [fullName, phone, village, panchayatId, designation, address, avatarUrl, req.user.id]);
    let profile = rows[0];
    if (profile.role === 'worker') {
      const available = typeof req.body.available === 'boolean' ? req.body.available : undefined;
      const skills = Array.isArray(req.body.skills) ? req.body.skills.map(skill => String(skill).trim()).filter(Boolean).slice(0, 8) : undefined;
      const worker = await client.query(`UPDATE worker_profiles
        SET available=COALESCE($1,available),skills=COALESCE($2,skills)
        WHERE user_id=$3
        RETURNING skills,experience_years,available,identity_verified,rating,jobs_completed`, [available, skills, req.user.id]);
      profile = { ...profile, ...(worker.rows[0] || {}) };
    }
    await client.query('COMMIT');
    res.json({ profile, user: profile });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
    next(error);
  } finally { client?.release(); }
});

app.get('/api/announcements', required, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT a.*, u.full_name AS author_name
      FROM announcements a JOIN users u ON u.id=a.author_id
      WHERE a.panchayat_id=$1 ORDER BY a.created_at DESC LIMIT 100`, [selectedPanchayat(req)]);
    res.json({ announcements: rows });
  } catch (error) { next(error); }
});

app.post('/api/announcements', required, allow('admin'), async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 140);
    const message = String(req.body.message || '').trim().slice(0, 1000);
    const imageUrl = String(req.body.imageUrl || '').trim().slice(0, 1200);
    if (title.length < 3 || message.length < 5) return res.status(400).json({ error: 'Add an announcement title and message' });
    const { rows } = await pool.query(`INSERT INTO announcements (panchayat_id,author_id,title,message,image_url)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`, [selectedPanchayat(req), req.user.id, title, message, imageUrl || null]);
    res.status(201).json({ announcement: { ...rows[0], author_name: req.user.full_name } });
  } catch (error) { next(error); }
});

app.post('/api/uploads', required, upload.array('files', 3), (req, res) => {
  const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const files = (req.files || []).map(file => ({
    url: `${baseUrl}/uploads/${file.filename}`,
    name: file.originalname,
    size: file.size,
  }));
  if (!files.length) return res.status(400).json({ error: 'Upload up to three JPG, PNG or WebP images.' });
  res.status(201).json({ files });
});

app.get('/api/complaints', required, async (req, res, next) => {
  try {
    const values = [], where = [];
    if (req.user.role === 'citizen') { values.push(req.user.id); where.push(`c.citizen_id=$${values.length}`); }
    if (req.user.role === 'worker') { values.push(req.user.id); where.push(`c.assigned_worker_id=$${values.length}`); }
    if (req.query.status) { values.push(req.query.status); where.push(`c.status=$${values.length}`); }
    const { rows } = await pool.query(`SELECT c.*, c.photo_urls AS before_photo_urls,
      COALESCE((SELECT cu.photo_urls FROM complaint_updates cu WHERE cu.complaint_id=c.id AND cu.status='resolved' AND cardinality(cu.photo_urls)>0 ORDER BY cu.created_at DESC LIMIT 1), ARRAY[]::text[]) AS after_photo_urls,
      u.full_name AS citizen_name, w.full_name AS worker_name
      FROM complaints c JOIN users u ON u.id=c.citizen_id LEFT JOIN users w ON w.id=c.assigned_worker_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.created_at DESC LIMIT 100`, values);
    res.json({ complaints: rows });
  } catch (error) { next(error); }
});

app.post('/api/complaints', required, allow('citizen'), async (req, res, next) => {
  try {
    const description = String(req.body.description || '').trim();
    if (description.length < 8) return res.status(400).json({ error: 'Please add a short problem description' });
    const latitude = Number(req.body.latitude), longitude = Number(req.body.longitude);
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
    if (hasLocation) {
      const duplicate = await pool.query(`SELECT public_id,category,status,location_label FROM complaints WHERE status NOT IN ('closed','resolved')
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND 6371000 * acos(least(1, cos(radians($1))*cos(radians(latitude))*cos(radians(longitude)-radians($2))+sin(radians($1))*sin(radians(latitude)))) < 100
        ORDER BY created_at DESC LIMIT 1`, [latitude, longitude]);
      if (duplicate.rows[0]) return res.status(409).json({ duplicate: duplicate.rows[0], message: 'This problem has already been reported nearby.' });
    }
    const ai = classify(description);
    const category = categories.some(([name]) => name === req.body.category) ? req.body.category : ai.category;
    const priority = ['low','medium','high','critical'].includes(req.body.priority) ? req.body.priority : ai.priority;
    let id = publicId();
    let created;
    for (let attempts = 0; attempts < 3; attempts++) {
      try {
        const { rows } = await pool.query(`INSERT INTO complaints (public_id,citizen_id,category,priority,description,latitude,longitude,location_label,photo_urls,voice_urls,ai_confidence)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [id, req.user.id, category, priority, description, hasLocation ? latitude : null, hasLocation ? longitude : null, String(req.body.locationLabel || '').slice(0, 200), Array.isArray(req.body.photoUrls) ? req.body.photoUrls.slice(0, 3) : [], Array.isArray(req.body.voiceUrls) ? req.body.voiceUrls.slice(0, 1) : [], ai.confidence]);
        created = rows[0]; break;
      } catch (error) { if (error.code !== '23505') throw error; id = publicId(); }
    }
    await pool.query('INSERT INTO complaint_updates (complaint_id,actor_id,status,note) VALUES ($1,$2,$3,$4)', [created.id, req.user.id, 'submitted', 'Complaint submitted by citizen']);
    await alertAdmins(`New ${category} complaint`, `${created.public_id} was reported at ${created.location_label || 'an unlabelled location'}.`);
    res.status(201).json({ complaint: created, ai });
  } catch (error) { next(error); }
});

app.get('/api/complaints/:id/updates', required, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT cu.*, u.full_name AS actor_name FROM complaint_updates cu LEFT JOIN users u ON u.id=cu.actor_id WHERE complaint_id=$1 ORDER BY created_at ASC`, [req.params.id]);
    res.json({ updates: rows });
  } catch (error) { next(error); }
});

app.patch('/api/complaints/:id', required, allow('admin', 'worker'), async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    const complaint = (await client.query('SELECT * FROM complaints WHERE id=$1', [req.params.id])).rows[0];
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (req.user.role === 'worker' && complaint.assigned_worker_id !== req.user.id) return res.status(403).json({ error: 'This job is not assigned to you' });
    const requestedWorkerId = req.user.role === 'admin' ? String(req.body.assignedWorkerId || '').trim() : '';
    let assignedWorker = null;
    if (requestedWorkerId) {
      assignedWorker = (await client.query(`SELECT id,full_name FROM users
        WHERE id=$1 AND role='worker' AND panchayat_id=$2`, [requestedWorkerId, selectedPanchayat(req)])).rows[0];
      if (!assignedWorker) return res.status(400).json({ error: 'Choose a valid worker from this Panchayat.' });
    }
    const workerId = assignedWorker?.id || complaint.assigned_worker_id;
    const wasAssigned = Boolean(workerId && String(workerId) !== String(complaint.assigned_worker_id || ''));
    let status = ['under_review','assigned','on_the_way','in_progress','resolved','verification','closed'].includes(req.body.status) ? req.body.status : complaint.status;
    if (wasAssigned && ['submitted','under_review'].includes(status)) status = 'assigned';

    await client.query('BEGIN');
    const { rows } = await client.query(`UPDATE complaints SET status=$1, assigned_worker_id=$2, priority=$3, updated_at=NOW(), resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE resolved_at END WHERE id=$4 RETURNING *`, [status, workerId, req.body.priority || complaint.priority, complaint.id]);
    await client.query('INSERT INTO complaint_updates (complaint_id,actor_id,status,note,photo_urls) VALUES ($1,$2,$3,$4,$5)', [complaint.id, req.user.id, status, String(req.body.note || '').slice(0, 600), req.body.photoUrls || []]);
    await client.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [complaint.citizen_id, `Complaint ${statusTitle(status)}`, `${complaint.public_id} has been updated.`]);
    if (wasAssigned && assignedWorker) {
      await client.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [assignedWorker.id, 'New complaint assigned', `${complaint.public_id}: ${complaint.description.slice(0, 120)}`]);
    }
    await client.query('COMMIT');
    res.json({ complaint: rows[0], workerAssigned: wasAssigned, workerName: assignedWorker?.full_name || null });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client?.release(); }
});

app.post('/api/complaints/:id/support', required, allow('citizen'), async (req, res, next) => {
  try {
    const stance = req.body.stance === 'fixed' ? 'fixed' : 'confirm';
    const complaint = (await pool.query('SELECT * FROM complaints WHERE id=$1', [req.params.id])).rows[0];
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    await pool.query('INSERT INTO complaint_supports (complaint_id,citizen_id,stance) VALUES ($1,$2,$3) ON CONFLICT (complaint_id,citizen_id) DO UPDATE SET stance=EXCLUDED.stance', [complaint.id, req.user.id, stance]);
    const confirmations = (await pool.query("SELECT COUNT(*)::int AS count FROM complaint_supports WHERE complaint_id=$1 AND stance='confirm'", [complaint.id])).rows[0].count;
    const priority = confirmations >= 5 ? 'high' : complaint.priority;
    await pool.query('UPDATE complaints SET confirmations=$1,priority=$2,updated_at=NOW() WHERE id=$3', [confirmations, priority, complaint.id]);
    res.json({ message: stance === 'confirm' ? 'Your confirmation was recorded.' : 'Thanks for the update.', confirmations, priority });
  } catch (error) { next(error); }
});

app.get('/api/workers', required, async (req, res, next) => {
  try {
    const availability = req.user.role === 'citizen' ? 'AND wp.available=true' : '';
    const { rows } = await pool.query(`SELECT u.id,u.full_name,u.phone,u.village,u.panchayat_id,u.designation,u.address,u.avatar_url,
      wp.skills,wp.experience_years,wp.available,wp.identity_verified,wp.rating,wp.jobs_completed
      FROM users u JOIN worker_profiles wp ON wp.user_id=u.id
      WHERE u.role='worker' AND u.panchayat_id=$1 ${availability}
      ORDER BY wp.available DESC,wp.rating DESC,wp.jobs_completed DESC`, [selectedPanchayat(req)]);
    res.json({ workers: rows });
  } catch (error) { next(error); }
});

app.post('/api/sos', required, allow('citizen'), async (req, res, next) => {
  try {
    const type = ['medical','fire','police','electricity','flood','animal_attack','women_safety'].includes(req.body.type) ? req.body.type : 'medical';
    const { rows } = await pool.query('INSERT INTO sos_alerts (citizen_id,alert_type,latitude,longitude) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.id, type, Number(req.body.latitude) || null, Number(req.body.longitude) || null]);
    await alertAdmins(`SOS: ${statusTitle(type)}`, `Emergency alert from ${req.user.full_name}.`);
    res.status(201).json({ alert: rows[0], message: 'SOS sent to the Panchayat control room.' });
  } catch (error) { next(error); }
});

app.get('/api/sos', required, allow('admin'), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT s.*,u.full_name,u.phone FROM sos_alerts s JOIN users u ON u.id=s.citizen_id ORDER BY CASE s.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END, s.created_at DESC LIMIT 100`);
    res.json({ alerts: rows });
  } catch (error) { next(error); }
});

app.patch('/api/sos/:id', required, allow('admin'), async (req, res, next) => {
  try {
    const status = ['open', 'acknowledged', 'resolved'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Invalid SOS status' });
    const { rows } = await pool.query('UPDATE sos_alerts SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'SOS alert not found' });
    await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [rows[0].citizen_id, `SOS ${statusTitle(status)}`, `Your ${statusTitle(rows[0].alert_type)} alert has been ${status}.`]);
    res.json({ alert: rows[0] });
  } catch (error) { next(error); }
});

app.get('/api/notifications', required, async (req, res, next) => { try { const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.user.id]); res.json({ notifications: rows }); } catch (error) { next(error); } });

app.get('/api/admin/dashboard', required, allow('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM complaints WHERE status NOT IN ('closed','resolved')) active_complaints,
      (SELECT COUNT(*)::int FROM sos_alerts WHERE status='open') active_sos,
      (SELECT COUNT(*)::int FROM worker_profiles WHERE available=true) workers_online,
      (SELECT COUNT(*)::int FROM complaints WHERE resolved_at::date=CURRENT_DATE) resolved_today,
      (SELECT json_agg(x) FROM (SELECT category,COUNT(*)::int count FROM complaints GROUP BY category ORDER BY count DESC LIMIT 6) x) by_category`);
    res.json({ stats: rows[0] });
  } catch (error) { next(error); }
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Images must be under 25 MB; attach up to three files.' });
  if (error.message === 'Invalid image type') return res.status(400).json({ error: 'Upload JPG, PNG, WebP, WebM, MP3, WAV or M4A files only.' });
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
app.listen(PORT, () => console.log(`GramConnect is running on http://localhost:${PORT}`));
