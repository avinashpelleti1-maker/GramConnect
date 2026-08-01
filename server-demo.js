// Local development server: mirrors the GramConnect API without requiring PostgreSQL.
// Data resets whenever this process is restarted. Use server.js + PostgreSQL for deployment.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const secret = process.env.JWT_SECRET || 'local-gramconnect-demo';
const uploads = path.join(__dirname, 'uploads');
fs.mkdirSync(uploads, { recursive: true });
const upload = multer({ storage: multer.diskStorage({ destination: (_r,_f,done)=>done(null,uploads), filename: (_r,f,done)=>done(null,`${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(f.originalname)}`) }), limits:{fileSize:25*1024*1024,files:3} });
app.use(cors()); app.use(express.json({limit:'1mb'})); app.use(express.static(path.join(__dirname,'public'))); app.use('/uploads',express.static(uploads));

const panchayatId=(mandal,name)=>`${mandal}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const fallbackPanchayats=[
  ['VAKADU','BALIREDDYPALEM'],['VAKADU','DUGARAJAPATNAM'],['VAKADU','JAMINKOTHAPALEM'],['VAKADU','JUVVINATTU'],['VAKADU','KALLURU'],['VAKADU','KASIPURAM'],['VAKADU','KONDAPURAM'],['VAKADU','KONDURU'],['VAKADU','MOLAGANUR'],['VAKADU','MULAPADAVA'],['VAKADU','MUTTEMBAKA'],['VAKADU','NELLIPUDI'],['VAKADU','NIDIGURTHI'],['VAKADU','PUDIRAYADORUVU'],['VAKADU','RAVIGUNTAPALEM'],['VAKADU','THIRUMUR'],['VAKADU','VAKADU'],['VAKADU','VALAMEDU'],['VAKADU','YARAGATIPALLE'],
  ['SULLURPET','ABAKA'],['SULLURPET','DAMA NELLORE'],['SULLURPET','DAMARAYA'],['SULLURPET','GOPALA REDDY PALEM'],['SULLURPET','ILLUPURU'],['SULLURPET','KOTAPOLLURU'],['SULLURPET','KUDIRI'],['SULLURPET','MANGALAMPADU'],['SULLURPET','MANGANELLORE'],
  ['BALAYAPALLI','ALIMILI'],['BALAYAPALLI','BALAYAPALLI'],['BALAYAPALLI','BHyravaram'],['BALAYAPALLI','CHILAMANURU'],['BALAYAPALLI','KADAGUNTA'],['BALAYAPALLI','KAYYURU'],['BALAYAPALLI','MANNURU'],['BALAYAPALLI','PALLIPADU'],['BALAYAPALLI','SANGAVARAM'],
  ['VENKATAGIRI','AMMAPALEM'],['VENKATAGIRI','CHELIKAMPADU'],['VENKATAGIRI','KALAPADU'],['VENKATAGIRI','LALAPET'],['VENKATAGIRI','PETLURU'],['VENKATAGIRI','SIDDAVARAM'],['VENKATAGIRI','VALLIVEDU'],
  ['DAKKILI','ALTHURUPADU'],['DAKKILI','AMUDURU'],['DAKKILI','DAKKILI'],['DAKKILI','DEVULAPALLE'],['DAKKILI','NAGAVOLU'],['DAKKILI','PALUGODU'],['DAKKILI','SREEPURAM'],
].map(([mandal,name])=>({id:panchayatId(mandal,name),district:'TIRUPATI',mandal,name}));
let panchayatCache=fallbackPanchayats;
let catalogueStarted=false;
async function refreshOfficialCatalogue(){
  if(catalogueStarted)return; catalogueStarted=true;
  try{
    const response=await fetch('https://tirupati.ap.gov.in/village-panchayats/',{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'GramConnect/1.0'}});
    const html=await response.text(); const rows=[];
    for(const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
      const cells=[...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>x[1].replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim());
      if(cells.length>=4&&cells[1].toUpperCase().includes('TIRUPATI')){const mandal=cells[2].toUpperCase(),name=cells[3].toUpperCase();rows.push({id:panchayatId(mandal,name),district:'TIRUPATI',mandal,name});}
    }
    if(rows.length>100)panchayatCache=rows;
  }catch(_){ /* Use the bundled official fallback groups when the site is unavailable. */ }
}
const users=[];
const passwordHashes = new Map();
const workers=[];
let complaints=[];
let alerts=[]; let notifications=[]; let counter=1000;
let announcements=[];
const auth=(req,res,next)=>{const token=req.headers.authorization?.replace('Bearer ','');try{const data=jwt.verify(token,secret);const user=users.find(x=>x.id===data.sub);if(!user)throw Error();req.user=user;next();}catch(_){res.status(401).json({error:'Authentication required'});}};
const allow=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'You do not have permission for this action'});
const human=s=>String(s).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const classify=text=>/light|లైట్/i.test(text)?'Street Lights':/water|leak|నీరు/i.test(text)?'Water Supply':/road|pothole|రహదారి/i.test(text)?'Roads':/electric|pole|current|కరెంటు/i.test(text)?'Electricity':'Other';
const sosRoutes={medical:['108 Medical response team','Panchayat health coordinator'],fire:['Fire & rescue response team','Panchayat emergency coordinator'],police:['Police response desk','Panchayat emergency coordinator'],electricity:['Electricity emergency technician','Panchayat electrical coordinator'],flood:['Flood response team','Panchayat disaster coordinator'],animal_attack:['Animal rescue response team','Panchayat emergency coordinator'],women_safety:['Women safety response desk','Panchayat emergency coordinator']};
const notify=(id,title,body)=>notifications.unshift({id:`note-${Date.now()}-${Math.random()}`,user_id:id,title,body,is_read:false,created_at:new Date().toISOString()});
const selectedPanchayat=req=>String(req.headers['x-panchayat-id']||req.user?.panchayat_id||'vakadu-balireddypalem');
const panchayatName=id=>panchayatCache.find(x=>x.id===id)?.name||'BALIREDDYPALEM';
const normalise=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const distanceMetres=(a,b)=>{if(!a.latitude||!a.longitude||!b.latitude||!b.longitude)return Infinity;const r=Math.PI/180,lat1=Number(a.latitude)*r,lat2=Number(b.latitude)*r,dLat=lat2-lat1,dLon=(Number(b.longitude)-Number(a.longitude))*r;const q=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));};
const repeatPriority=count=>count>=8?'critical':count>=4?'high':count>=2?'medium':'low';

app.get('/api/health',(_q,res)=>res.json({ok:true,local:true}));
app.post('/api/auth/email', async (req, res) => {
  try {
    const intent = req.body.intent === 'register' ? 'register' : 'login';
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fullName = String(req.body.fullName || '').trim().slice(0, 120);
    const role = ['citizen','worker','admin'].includes(req.body.role) ? req.body.role : 'citizen';
    const panchayatId = String(req.body.panchayatId || 'vakadu-balireddypalem');
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:'Enter a valid email address.'});
    if (password.length < 8) return res.status(400).json({error:'Password must contain at least 8 characters.'});
    let user = users.find(item => item.email === email);
    if (intent === 'register') {
      if (user) return res.status(409).json({error:'An account already exists with this email. Please sign in instead.'});
      if (fullName.length < 2) return res.status(400).json({error:'Please enter your name to create an account.'});
      user = {id:`user-${Date.now()}`,email,phone:null,full_name:fullName,role,village:`${panchayatName(panchayatId)} Panchayat`,panchayat_id:panchayatId};
      users.push(user); passwordHashes.set(user.id, await bcrypt.hash(password, 12));
      if (role === 'worker') workers.push({id:user.id,panchayat_id:panchayatId,full_name:user.full_name,village:user.village,skills:['General service'],experience_years:0,available:true,identity_verified:false,rating:0,jobs_completed:0});
    } else {
      if (!user || !(await bcrypt.compare(password, passwordHashes.get(user.id) || ''))) return res.status(401).json({error:'Incorrect email or password.'});
    }
    res.json({token:jwt.sign({sub:user.id,role:user.role},secret,{expiresIn:'8h'}),user});
  } catch (error) { res.status(500).json({error:error.message || 'Could not complete sign in.'}); }
});
app.get('/api/panchayats',async (_req,res)=>{await refreshOfficialCatalogue();res.json({source:'Tirupati District Government',panchayats:panchayatCache});});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.post('/api/uploads',auth,upload.array('files',3),(req,res)=>{const base=`${req.protocol}://${req.get('host')}`;const files=(req.files||[]).map(x=>({url:`${base}/uploads/${x.filename}`,name:x.originalname,size:x.size}));if(!files.length)return res.status(400).json({error:'Choose an image to upload'});res.status(201).json({files});});
app.get('/api/complaints',auth,(req,res)=>{const scope=selectedPanchayat(req);let list=complaints.filter(x=>x.panchayat_id===scope);if(req.user.role==='citizen')list=list.filter(x=>x.citizen_id===req.user.id);if(req.user.role==='worker')list=list.filter(x=>x.assigned_worker_id===req.user.id);res.json({complaints:[...list].sort((a,b)=>b.created_at.localeCompare(a.created_at))});});
app.post('/api/complaints',auth,allow('citizen'),(req,res)=>{const description=String(req.body.description||'').trim(),location=String(req.body.locationLabel||'').trim(),category=String(req.body.category||'').trim();if(description.length<8)return res.status(400).json({error:'Please add a short description or voice recording'});if(!category)return res.status(400).json({error:'Please select a problem category'});if(!location)return res.status(400).json({error:'Please enter the location manually'});const scope=selectedPanchayat(req);const incoming={latitude:req.body.latitude,longitude:req.body.longitude};const duplicate=complaints.find(item=>item.panchayat_id===scope&&!['resolved','closed'].includes(item.status)&&((normalise(item.location_label)===normalise(location)&&item.category===category)||distanceMetres(item,incoming)<=100));if(duplicate)return res.status(409).json({error:'This problem has already been reported in this Panchayat.',duplicate});const repeatCount=complaints.filter(item=>item.panchayat_id===scope&&item.category===category&&(normalise(item.location_label)===normalise(location)||distanceMetres(item,incoming)<=100)).length;const complaint={id:`complaint-${Date.now()}`,panchayat_id:scope,panchayat_name:panchayatName(scope),public_id:`GC-2026-${counter++}`,citizen_id:req.user.id,assigned_worker_id:null,citizen_name:String(req.body.reporterName||req.user.full_name),reporter_phone:String(req.body.reporterPhone||req.user.phone),worker_name:null,category,priority:repeatPriority(repeatCount+1),status:'submitted',description,location_label:location,latitude:req.body.latitude||null,longitude:req.body.longitude||null,confirmations:0,before_photo_urls:Array.isArray(req.body.photoUrls)?req.body.photoUrls:[],voice_urls:Array.isArray(req.body.voiceUrls)?req.body.voiceUrls:[],after_photo_urls:[],created_at:new Date().toISOString()};complaints.unshift(complaint);users.filter(x=>x.role==='admin').forEach(x=>notify(x.id,`New ${category} complaint`,`${complaint.public_id} needs review.`));res.status(201).json({complaint,ai:{priority:complaint.priority,repeatCount:repeatCount+1}});});
app.patch('/api/complaints/:id',auth,allow('admin','worker'),(req,res)=>{const complaint=complaints.find(x=>x.id===req.params.id);if(!complaint)return res.status(404).json({error:'Complaint not found'});if(req.user.role==='worker'&&complaint.assigned_worker_id!==req.user.id)return res.status(403).json({error:'This job is not assigned to you'});if(req.body.assignedWorkerId!==undefined){complaint.assigned_worker_id=req.body.assignedWorkerId||null;complaint.worker_name=users.find(x=>x.id===complaint.assigned_worker_id)?.full_name||null;}if(req.body.status)complaint.status=req.body.status;if(req.body.priority)complaint.priority=req.body.priority;if(req.body.status==='resolved'&&Array.isArray(req.body.photoUrls)&&req.body.photoUrls.length)complaint.after_photo_urls=req.body.photoUrls;notify(complaint.citizen_id,`Complaint ${human(complaint.status)}`,`${complaint.public_id} has been updated.`);res.json({complaint});});
app.post('/api/complaints/:id/support',auth,allow('citizen'),(req,res)=>{const complaint=complaints.find(x=>x.id===req.params.id);if(!complaint)return res.status(404).json({error:'Complaint not found'});complaint.confirmations++;complaint.priority=repeatPriority(complaint.confirmations+1);res.json({message:'Your confirmation was recorded.',confirmations:complaint.confirmations,priority:complaint.priority});});
app.get('/api/workers',auth,(req,res)=>res.json({workers:workers.filter(x=>x.available&&x.panchayat_id===selectedPanchayat(req))}));
app.post('/api/sos',auth,allow('citizen'),(req,res)=>{const scope=selectedPanchayat(req),type=sosRoutes[req.body.type]?req.body.type:'medical';const alert={id:`sos-${Date.now()}`,panchayat_id:scope,citizen_id:req.user.id,alert_type:type,routed_to:sosRoutes[type],latitude:req.body.latitude||null,longitude:req.body.longitude||null,status:'open',created_at:new Date().toISOString(),full_name:req.user.full_name,phone:req.user.phone};alerts.unshift(alert);users.filter(x=>x.role==='admin').forEach(x=>notify(x.id,`SOS: ${human(alert.alert_type)}`,`${req.user.full_name} · ${req.user.phone} · GPS ${alert.latitude||'not available'}, ${alert.longitude||'not available'} · Routed to ${alert.routed_to.join(', ')}.`));res.status(201).json({alert,message:`SOS sent to Admin and ${alert.routed_to.join(' / ')}.`});});
app.get('/api/sos',auth,allow('admin'),(req,res)=>res.json({alerts:alerts.filter(x=>x.panchayat_id===selectedPanchayat(req))}));
app.patch('/api/sos/:id',auth,allow('admin'),(req,res)=>{const alert=alerts.find(x=>x.id===req.params.id);if(!alert)return res.status(404).json({error:'SOS alert not found'});alert.status=req.body.status||alert.status;notify(alert.citizen_id,`SOS ${human(alert.status)}`,`Your emergency alert is ${alert.status}.`);res.json({alert});});
app.get('/api/notifications',auth,(req,res)=>res.json({notifications:notifications.filter(x=>x.user_id===req.user.id).slice(0,30)}));
app.get('/api/announcements',auth,(req,res)=>{const scope=selectedPanchayat(req);res.json({announcements:announcements.filter(item=>item.panchayat_id===scope).sort((a,b)=>b.created_at.localeCompare(a.created_at))});});
app.post('/api/announcements',auth,allow('admin'),(req,res)=>{const title=String(req.body.title||'').trim().slice(0,140),message=String(req.body.message||'').trim().slice(0,1000),image_url=String(req.body.imageUrl||'').trim().slice(0,1200);if(title.length<3||message.length<5)return res.status(400).json({error:'Add an announcement title and message'});const scope=selectedPanchayat(req);const announcement={id:`announcement-${Date.now()}`,panchayat_id:scope,title,message,image_url,author_name:req.user.full_name,created_at:new Date().toISOString()};announcements.unshift(announcement);users.filter(user=>user.panchayat_id===scope&&user.id!==req.user.id).forEach(user=>notify(user.id,'New Panchayat announcement',title));res.status(201).json({announcement});});
app.get('/api/admin/dashboard',auth,allow('admin'),(req,res)=>{const scope=selectedPanchayat(req);const scoped=complaints.filter(x=>x.panchayat_id===scope);const open=scoped.filter(x=>!['closed','resolved'].includes(x.status));const categories={};scoped.forEach(x=>categories[x.category]=(categories[x.category]||0)+1);res.json({stats:{active_complaints:open.length,active_sos:alerts.filter(x=>x.panchayat_id===scope&&x.status==='open').length,workers_online:workers.filter(x=>x.available&&x.panchayat_id===scope).length,resolved_today:scoped.filter(x=>x.status==='resolved').length,by_category:Object.entries(categories).map(([category,count])=>({category,count}))}});});
app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`GramConnect local server running at http://localhost:${PORT}`));
