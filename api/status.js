const { getSql, ensureSchema, getBody } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = getBody(req);
    const { status } = body;

    if (!['PRE-RACE', 'EN CURSO', 'FINALIZADA'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Invalid status', received: body });
    }

    const sql = getSql();
    await ensureSchema(sql);

    await sql`
      UPDATE matchups
      SET estado = ${status}, updated_at = NOW();
    `;

    return res.status(200).json({ ok: true, message: `Estado actualizado a ${status}` });
  } catch (err) {
    console.error('API status error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
