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

    // 1. Obtener todos los matchups
    const matchups = await sql`SELECT * FROM matchups ORDER BY created_at ASC`;
    if (!matchups.length) {
      return res.status(404).json({ ok: false, error: 'No matchup found' });
    }

    // 2. Obtener todos los participantes y etapas de una sola vez
    const matchupIds = matchups.map(m => m.id);
    const allParticipants = await sql`SELECT * FROM participants WHERE matchup_id = ANY(${matchupIds}) ORDER BY orden ASC`;
    const allStages = await sql`SELECT * FROM stages WHERE matchup_id = ANY(${matchupIds}) ORDER BY numero ASC`;
    const stageIds = allStages.map(s => s.id);

    let allTimes = [];
    if (stageIds.length > 0) {
      allTimes = await sql`SELECT * FROM stage_times WHERE stage_id = ANY(${stageIds})`;
    }

    // 3. Procesar cada matchup
    const enrichedMatchups = matchups.map((matchup, mIndex) => {
      const participants = allParticipants.filter(p => p.matchup_id === matchup.id).sort((a, b) => a.orden - b.orden);
      const r1 = participants[0];
      const r2 = participants[1];

      const rawStages = allStages.filter(s => s.matchup_id === matchup.id).sort((a, b) => a.numero - b.numero);

      let r1Accum = 0;
      let r2Accum = 0;
      let completedCount = 0;
      let r1Wins = 0;
      let r2Wins = 0;
      let ties = 0;

      const stages = rawStages.map(st => {
        const t1 = r1 ? allTimes.find(t => t.stage_id === st.id && t.participant_id === r1.id) : null;
        const t2 = r2 ? allTimes.find(t => t.stage_id === st.id && t.participant_id === r2.id) : null;

        const ms1 = t1 ? Number(t1.time_ms) : null;
        const ms2 = t2 ? Number(t2.time_ms) : null;
        const hasBoth = ms1 !== null && ms2 !== null;

        let deltaMs = null;
        let winner = null;

        if (hasBoth) {
          completedCount++;
          r1Accum += ms1;
          r2Accum += ms2;
          deltaMs = ms2 - ms1; // > 0 significa que r1 fue más rápido
          if (deltaMs > 0) {
            winner = 'rider1';
            r1Wins++;
          } else if (deltaMs < 0) {
            winner = 'rider2';
            r2Wins++;
          } else {
            winner = 'tie';
            ties++;
          }
        }

        return {
          id: st.id,
          numero: st.numero,
          estado: st.estado,
          rider1Ms: ms1,
          rider2Ms: ms2,
          fabioMs: ms1, // retrocompatibilidad
          luisMs: ms2,  // retrocompatibilidad
          completed: hasBoth,
          deltaMs,
          winner
        };
      });

      const totalR1 = completedCount > 0 ? r1Accum : null;
      const totalR2 = completedCount > 0 ? r2Accum : null;

      let leaderWinner = null;
      let leaderDelta = 0;
      let leaderText = 'Esperando tiempos...';

      if (totalR1 !== null && totalR2 !== null) {
        const diff = totalR2 - totalR1;
        leaderDelta = Math.abs(diff);
        if (diff > 0) {
          leaderWinner = 'rider1';
          const cleanNick = r1?.apodo ? r1.apodo.replace(/[“”"]/g, '').toUpperCase() : r1?.nombre?.toUpperCase();
          leaderText = `${cleanNick} LIDERA`;
        } else if (diff < 0) {
          leaderWinner = 'rider2';
          const cleanNick = r2?.apodo ? r2.apodo.replace(/[“”"]/g, '').toUpperCase() : r2?.nombre?.toUpperCase();
          leaderText = `${cleanNick} LIDERA`;
        } else {
          leaderWinner = 'tie';
          leaderText = 'EMPATE TOTAL';
        }
      }

      return {
        id: matchup.id,
        nombre: matchup.nombre,
        estado: matchup.estado,
        fecha: matchup.fecha,
        index: mIndex,
        participants,
        stages,
        totals: {
          rider1: totalR1,
          rider2: totalR2,
          fabio: totalR1, // retrocompatibilidad
          luis: totalR2,  // retrocompatibilidad
          completed: completedCount,
          isFinished: completedCount === 4 || matchup.estado === 'FINALIZADA'
        },
        scores: {
          rider1: r1Wins,
          rider2: r2Wins,
          fabio: r1Wins, // retrocompatibilidad
          luis: r2Wins,  // retrocompatibilidad
          ties
        },
        leader: {
          winner: leaderWinner,
          deltaMs: leaderDelta,
          text: leaderText
        }
      };
    });

    const primaryData = enrichedMatchups[0];

    return res.status(200).json({
      ok: true,
      data: primaryData,
      matchups: enrichedMatchups,
      source: 'neon_postgres'
    });
  } catch (err) {
    console.error('API state error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
