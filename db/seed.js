require('dotenv').config();
const { pool } = require('../lib/db');
(async () => {
  try {
    console.log('No accounts are seeded. Create the first account from the GramConnect sign-up screen.');
  } finally { await pool.end(); }
})().catch(error => { console.error(error.message); process.exit(1); });
