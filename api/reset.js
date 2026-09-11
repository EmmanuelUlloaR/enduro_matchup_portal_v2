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
    const { matchupId } = body;

    const sql = getSql();
    await ensureSchema(sql);

    if (matchupId) {
      // Obtener las etapas de este matchup
      const stages = await sql`SELECT id FROM stages WHERE matchup_id = ${matchupId}`;
      const stageIds = stages.map(s => s.id);
      if (stageIds.length > 0) {
        await sql`DELETE FROM stage_times WHERE stage_id = ANY(${stageIds});`;
      }
      await sql`UPDATE stages SET estado = 'PENDIENTE' WHERE matchup_id = ${matchupId};`;
      await sql`UPDATE matchups SET estado = 'PRE-RACE', updated_at = NOW() WHERE id = ${matchupId};`;

      return res.status(200).json({ ok: true, message: 'Duelo reiniciado por completo' });
    }

    await sql`DELETE FROM stage_times;`;
    await sql`UPDATE stages SET estado = 'PENDIENTE';`;
    await sql`UPDATE matchups SET estado = 'PRE-RACE', updated_at = NOW();`;

    return res.status(200).json({ ok: true, message: 'Todos los matchups reiniciados por completo' });
  } catch (err) {
    console.error('API reset error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
