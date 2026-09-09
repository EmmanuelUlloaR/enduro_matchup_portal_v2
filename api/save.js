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
    const fabioMs = body.fabioMs !== undefined && body.fabioMs !== null ? Number(body.fabioMs) : NaN;
    const luisMs = body.luisMs !== undefined && body.luisMs !== null ? Number(body.luisMs) : NaN;

    if (!stageNumero || isNaN(fabioMs) || isNaN(luisMs)) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid stageNumero, fabioMs, or luisMs', received: body });
    }

    const sql = getSql();
    await ensureSchema(sql);

    // 1. Obtener matchup y participantes
    const [matchup] = await sql`SELECT * FROM matchups LIMIT 1`;
    const participants = await sql`SELECT id, orden FROM participants WHERE matchup_id = ${matchup.id} ORDER BY orden ASC`;
    const fabioId = participants[0]?.id;
    const luisId = participants[1]?.id;

    // 2. Obtener etapa
    const [stage] = await sql`SELECT id FROM stages WHERE matchup_id = ${matchup.id} AND numero = ${stageNumero} LIMIT 1`;
    if (!stage) {
      return res.status(404).json({ ok: false, error: 'Stage not found' });
    }

    // 3. Upsert tiempos para Fabio y Luis
    await sql`
      INSERT INTO stage_times (stage_id, participant_id, time_ms, updated_at)
      VALUES (${stage.id}, ${fabioId}, ${fabioMs}, NOW())
      ON CONFLICT (stage_id, participant_id)
      DO UPDATE SET time_ms = ${fabioMs}, updated_at = NOW();
    `;

    await sql`
      INSERT INTO stage_times (stage_id, participant_id, time_ms, updated_at)
      VALUES (${stage.id}, ${luisId}, ${luisMs}, NOW())
      ON CONFLICT (stage_id, participant_id)
      DO UPDATE SET time_ms = ${luisMs}, updated_at = NOW();
    `;

    // 4. Actualizar etapa a FINALIZADA
    await sql`
      UPDATE stages
      SET estado = 'FINALIZADA'
      WHERE id = ${stage.id};
    `;

    // 5. Si la carrera estaba en PRE-RACE, pasarla a EN CURSO
    if (matchup.estado === 'PRE-RACE') {
      await sql`
        UPDATE matchups
        SET estado = 'EN CURSO', updated_at = NOW()
        WHERE id = ${matchup.id};
      `;
    }

    return res.status(200).json({ ok: true, message: `Etapa ${stageNumero} guardada correctamente` });
  } catch (err) {
    console.error('API save error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
