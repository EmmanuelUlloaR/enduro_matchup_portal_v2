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
    const matchupId = body.matchupId || null;

    const raw1 = body.rider1Ms !== undefined && body.rider1Ms !== null ? body.rider1Ms : body.fabioMs;
    const raw2 = body.rider2Ms !== undefined && body.rider2Ms !== null ? body.rider2Ms : body.luisMs;

    const r1Ms = raw1 !== undefined && raw1 !== null ? Number(raw1) : NaN;
    const r2Ms = raw2 !== undefined && raw2 !== null ? Number(raw2) : NaN;

    if (!stageNumero || isNaN(r1Ms) || isNaN(r2Ms)) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid stageNumero or times', received: body });
    }

    const sql = getSql();
    await ensureSchema(sql);

    // 1. Obtener matchup
    let matchup;
    if (matchupId) {
      const rows = await sql`SELECT * FROM matchups WHERE id = ${matchupId} LIMIT 1`;
      matchup = rows[0];
    }
    if (!matchup) {
      const rows = await sql`SELECT * FROM matchups ORDER BY created_at ASC LIMIT 1`;
      matchup = rows[0];
    }
    if (!matchup) {
      return res.status(404).json({ ok: false, error: 'Matchup not found' });
    }

    // 2. Participantes
    const participants = await sql`SELECT id, orden FROM participants WHERE matchup_id = ${matchup.id} ORDER BY orden ASC`;
    const r1Id = participants[0]?.id;
    const r2Id = participants[1]?.id;

    if (!r1Id || !r2Id) {
      return res.status(400).json({ ok: false, error: 'Participants not found for matchup' });
    }

    // 3. Obtener etapa
    const [stage] = await sql`SELECT id FROM stages WHERE matchup_id = ${matchup.id} AND numero = ${stageNumero} LIMIT 1`;
    if (!stage) {
      return res.status(404).json({ ok: false, error: 'Stage not found' });
    }

    // 4. Upsert tiempos para ambos corredores
    await sql`
      INSERT INTO stage_times (stage_id, participant_id, time_ms, updated_at)
      VALUES (${stage.id}, ${r1Id}, ${r1Ms}, NOW())
      ON CONFLICT (stage_id, participant_id)
      DO UPDATE SET time_ms = ${r1Ms}, updated_at = NOW();
    `;

    await sql`
      INSERT INTO stage_times (stage_id, participant_id, time_ms, updated_at)
      VALUES (${stage.id}, ${r2Id}, ${r2Ms}, NOW())
      ON CONFLICT (stage_id, participant_id)
      DO UPDATE SET time_ms = ${r2Ms}, updated_at = NOW();
    `;

    // 5. Actualizar etapa a FINALIZADA
    await sql`
      UPDATE stages
      SET estado = 'FINALIZADA'
      WHERE id = ${stage.id};
    `;

    // 6. Si el matchup estaba en PRE-RACE, pasar a EN CURSO
    if (matchup.estado === 'PRE-RACE') {
      await sql`
        UPDATE matchups
        SET estado = 'EN CURSO', updated_at = NOW()
        WHERE id = ${matchup.id};
      `;
    }

    return res.status(200).json({ ok: true, message: `Etapa ${stageNumero} guardada correctamente para ${matchup.nombre}` });
  } catch (err) {
    console.error('API save error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
