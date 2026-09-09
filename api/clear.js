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
    const stageNumero = Number(body.stageNumero);

    if (!stageNumero) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid stageNumero' });
    }

    const sql = getSql();
    await ensureSchema(sql);

    const [stage] = await sql`SELECT id FROM stages WHERE numero = ${stageNumero} LIMIT 1`;
    if (!stage) {
      return res.status(404).json({ ok: false, error: 'Stage not found' });
    }

    await sql`DELETE FROM stage_times WHERE stage_id = ${stage.id}`;
    await sql`UPDATE stages SET estado = 'PENDIENTE' WHERE id = ${stage.id}`;

    return res.status(200).json({ ok: true, message: `Etapa ${stageNumero} reabierta` });
  } catch (err) {
    console.error('API clear error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
