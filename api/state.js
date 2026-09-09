const { getSql, ensureSchema } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);

    // 1. Matchup
    const matchups = await sql`SELECT * FROM matchups ORDER BY created_at ASC LIMIT 1`;
    if (!matchups.length) {
      return res.status(404).json({ ok: false, error: 'No matchup found' });
    }
    const matchup = matchups[0];

    // 2. Participantes
    const participants = await sql`SELECT * FROM participants WHERE matchup_id = ${matchup.id} ORDER BY orden ASC`;

    // 3. Etapas
    const rawStages = await sql`SELECT * FROM stages WHERE matchup_id = ${matchup.id} ORDER BY numero ASC`;

    // 4. Tiempos
    const stageIds = rawStages.map(s => s.id);
    let rawTimes = [];
    if (stageIds.length > 0) {
      rawTimes = await sql`SELECT * FROM stage_times WHERE stage_id = ANY(${stageIds})`;
    }

    const fabioId = participants[0]?.id;
    const luisId = participants[1]?.id;

    let fabioAccum = 0;
    let luisAccum = 0;
    let completedCount = 0;
    let fabioWins = 0;
    let luisWins = 0;
    let ties = 0;

    const stages = rawStages.map(st => {
      const fTime = rawTimes.find(t => t.stage_id === st.id && t.participant_id === fabioId);
      const lTime = rawTimes.find(t => t.stage_id === st.id && t.participant_id === luisId);

      const fMs = fTime ? Number(fTime.time_ms) : null;
      const lMs = lTime ? Number(lTime.time_ms) : null;
      const hasBoth = fMs !== null && lMs !== null;

      let deltaMs = null;
      let winner = null;

      if (hasBoth) {
        completedCount++;
        fabioAccum += fMs;
        luisAccum += lMs;
        deltaMs = lMs - fMs;
        if (deltaMs > 0) {
          winner = 'fabio';
          fabioWins++;
        } else if (deltaMs < 0) {
          winner = 'luis';
          luisWins++;
        } else {
          winner = 'tie';
          ties++;
        }
      }

      return {
        id: st.id,
        numero: st.numero,
        estado: st.estado,
        fabioMs: fMs,
        luisMs: lMs,
        completed: hasBoth,
        deltaMs,
        winner
      };
    });

    const totalFabio = completedCount > 0 ? fabioAccum : null;
    const totalLuis = completedCount > 0 ? luisAccum : null;

    let leaderWinner = null;
    let leaderDelta = 0;
    let leaderText = 'Esperando tiempos...';

    if (totalFabio !== null && totalLuis !== null) {
      const diff = totalLuis - totalFabio;
      leaderDelta = Math.abs(diff);
      if (diff > 0) {
        leaderWinner = 'fabio';
        leaderText = 'LA POLINADA LIDERA';
      } else if (diff < 0) {
        leaderWinner = 'luis';
        leaderText = 'DON GATA LIDERA';
      } else {
        leaderWinner = 'tie';
        leaderText = 'EMPATE TOTAL';
      }
    }

    return res.status(200).json({
      ok: true,
      data: {
        matchup,
        participants,
        stages,
        totals: {
          fabio: totalFabio,
          luis: totalLuis,
          completed: completedCount,
          isFinished: completedCount === 4 || matchup.estado === 'FINALIZADA'
        },
        scores: {
          fabio: fabioWins,
          luis: luisWins,
          ties
        },
        leader: {
          winner: leaderWinner,
          deltaMs: leaderDelta,
          text: leaderText
        },
        source: 'neon_postgres'
      }
    });
  } catch (err) {
    console.error('API state error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
