const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const secret = () => process.env.JWT_SECRET || 'development-secret-change-me';

function sign(user) { return jwt.sign({ sub: user.id, role: user.role, name: user.full_name }, secret(), { expiresIn: '8h' }); }
async function required(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, secret());
    const { rows } = await pool.query('SELECT id, full_name, email, phone, role, village FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: 'User no longer exists' });
    req.user = rows[0]; next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}
function allow(...roles) { return (req,res,next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action' }); }
module.exports = { sign, required, allow };
