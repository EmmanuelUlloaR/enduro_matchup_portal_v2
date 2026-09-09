/**
 * Enduro Evolution 2026 — Supabase Service & Realtime Client
 * Connects to Supabase DB or seamlessly falls back to local storage with multi-tab Realtime.
 */

(function () {
  'use strict';

  const BROADCAST_CHANNEL_NAME = 'enduro_matchup_realtime_v2';
  const LOCAL_DB_KEY = 'enduro_matchup_local_db_v2';

  const bc = ('BroadcastChannel' in window) ? new BroadcastChannel(BROADCAST_CHANNEL_NAME) : null;

  // Tiempos formateados y parsing flexible en milisegundos
  function parseTime(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return Math.round(val);
    const clean = String(val).trim().replace(',', '.');
    if (!clean) return null;

    // Caso 1: Cadena numérica pura (milisegundos ej. "151420")
    if (/^\d+$/.test(clean) && parseInt(clean, 10) > 10000) {
      return parseInt(clean, 10);
    }

    // Caso 2: mm:ss.mmm, m:ss.mmm, mm:ss, m:ss, o con puntos mm.ss.mmm
    const match = clean.match(/^(\d{1,2})[:.]([0-5]?\d)(?:[.:](\d{1,3}))?$/);
    if (match) {
      const mins = parseInt(match[1], 10) * 60000;
      const secs = parseInt(match[2], 10) * 1000;
      const millis = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      return mins + secs + millis;
    }

    return NaN;
  }

  function fmt(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '--:--.---';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const x = Math.floor(ms % 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
  }

  function dFmt(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    return (Math.abs(ms) / 1000).toFixed(3) + 's';
  }

  // Estructura de fallback local si Supabase no está configurado
  function getBlankLocalData() {
    return {
      matchup: {
        id: 'local-matchup-1',
        nombre: 'Enduro Evolution 2026 — Match Up en Llamas',
        estado: 'PRE-RACE',
        fecha: new Date().toISOString()
      },
      participants: [
        { id: 'p-fabio', nombre: 'Fabio', apodo: '“La Polinada”', apellido: 'SILVESTRI', foto_url: 'assets/fabio.png', orden: 1 },
        { id: 'p-luis', nombre: 'Luis', apodo: '“Don Gata”', apellido: 'PEÑA', foto_url: 'assets/luis.png', orden: 2 }
      ],
      stages: [
        { id: 's-1', numero: 1, estado: 'PENDIENTE', fabioMs: null, luisMs: null },
        { id: 's-2', numero: 2, estado: 'PENDIENTE', fabioMs: null, luisMs: null },
        { id: 's-3', numero: 3, estado: 'PENDIENTE', fabioMs: null, luisMs: null },
        { id: 's-4', numero: 4, estado: 'PENDIENTE', fabioMs: null, luisMs: null }
      ],
      updatedAt: null
    };
  }

  function loadLocalDb() {
    try {
      const stored = localStorage.getItem(LOCAL_DB_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Error reading local db:', e);
    }
    const fresh = getBlankLocalData();
    saveLocalDb(fresh);
    return fresh;
  }

  function saveLocalDb(data) {
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(data));
    bc?.postMessage({ type: 'SYNC_UPDATE' });
  }

  class EnduroService {
    constructor() {
      this.supabase = null;
      this.isOnline = false;
      this.listeners = new Set();
      this.statusListeners = new Set();
      this.channel = null;
      this.cachedState = null;
      this.init();
    }

    async init() {
      const config = window.EnduroConfig ? window.EnduroConfig.get() : {};
      const hasCredentials = config.supabaseUrl && config.supabaseAnonKey &&
        !config.supabaseUrl.includes('TU_SUPABASE') &&
        config.supabaseUrl.startsWith('http');

      if (hasCredentials && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
          this.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
          // Verificar conexión con un select simple
          const { data, error } = await this.supabase.from('matchups').select('id').limit(1);
          if (!error) {
            this.isOnline = true;
            this.notifyStatus('connected');
            this.setupRealtime();
            await this.refresh();
            return;
          } else {
            console.warn('Supabase connect test error:', error);
          }
        } catch (e) {
          console.warn('Supabase initialization failed, falling back to local storage:', e);
        }
      }

      // Modo local
      this.isOnline = false;
      this.notifyStatus(hasCredentials ? 'connecting' : 'offline_mode');
      this.setupLocalSync();
      await this.refresh();
    }

    setupRealtime() {
      if (!this.supabase) return;
      if (this.channel) {
        this.supabase.removeChannel(this.channel);
      }

      this.channel = this.supabase
        .channel('enduro_realtime_feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matchups' }, () => {
          this.refresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stages' }, () => {
          this.refresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_times' }, () => {
          this.refresh();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.notifyStatus('connected');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            this.notifyStatus('offline_mode');
          }
        });
    }

    setupLocalSync() {
      bc?.addEventListener('message', (ev) => {
        if (ev.data?.type === 'SYNC_UPDATE') {
          this.refresh();
        }
      });

      window.addEventListener('storage', (ev) => {
        if (ev.key === LOCAL_DB_KEY) {
          this.refresh();
        }
      });
    }

    notifyStatus(status) {
      this.connectionStatus = status;
      this.statusListeners.forEach((fn) => {
        try { fn(status); } catch (err) { console.error(err); }
      });
    }

    onStatusChange(fn) {
      this.statusListeners.add(fn);
      if (this.connectionStatus) fn(this.connectionStatus);
      return () => this.statusListeners.delete(fn);
    }

    onUpdate(fn) {
      this.listeners.add(fn);
      if (this.cachedState) fn(this.cachedState);
      return () => this.listeners.delete(fn);
    }

    triggerUpdate() {
      if (!this.cachedState) return;
      this.listeners.forEach((fn) => {
        try { fn(this.cachedState); } catch (err) { console.error(err); }
      });
    }

    // Calcula estadísticas, líder y totales del estado
    computeMetrics(matchup, participants, stages) {
      const pFabio = participants.find(p => p.orden === 1) || participants[0];
      const pLuis = participants.find(p => p.orden === 2) || participants[1];

      let fabioAccum = 0;
      let luisAccum = 0;
      let completedCount = 0;
      let fabioWins = 0;
      let luisWins = 0;
      let ties = 0;

      const enrichedStages = stages.map((st) => {
        const hasBoth = st.fabioMs !== null && st.luisMs !== null;
        let deltaMs = null;
        let winner = null;

        if (hasBoth) {
          completedCount++;
          fabioAccum += st.fabioMs;
          luisAccum += st.luisMs;
          deltaMs = st.luisMs - st.fabioMs;
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
          ...st,
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

      return {
        matchup,
        participants: [pFabio, pLuis],
        stages: enrichedStages,
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
        isOnline: this.isOnline,
        connectionStatus: this.connectionStatus || (this.isOnline ? 'connected' : 'offline_mode')
      };
    }

    async refresh() {
      if (this.isOnline && this.supabase) {
        try {
          // 1. Obtener matchup
          const { data: matchups, error: mErr } = await this.supabase
            .from('matchups')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(1);

          if (mErr || !matchups?.length) throw mErr || new Error('No matchup found');
          const matchup = matchups[0];

          // 2. Participantes
          const { data: participants, error: pErr } = await this.supabase
            .from('participants')
            .select('*')
            .eq('matchup_id', matchup.id)
            .order('orden', { ascending: true });

          if (pErr || !participants?.length) throw pErr || new Error('No participants found');

          // 3. Etapas
          const { data: rawStages, error: sErr } = await this.supabase
            .from('stages')
            .select('*')
            .eq('matchup_id', matchup.id)
            .order('numero', { ascending: true });

          if (sErr) throw sErr;

          // 4. Tiempos de etapa
          const stageIds = rawStages.map(s => s.id);
          const { data: rawTimes, error: tErr } = await this.supabase
            .from('stage_times')
            .select('*')
            .in('stage_id', stageIds);

          if (tErr) throw tErr;

          const fabioId = participants[0].id;
          const luisId = participants[1].id;

          const stages = rawStages.map(st => {
            const fabioTime = rawTimes.find(t => t.stage_id === st.id && t.participant_id === fabioId);
            const luisTime = rawTimes.find(t => t.stage_id === st.id && t.participant_id === luisId);
            return {
              id: st.id,
              numero: st.numero,
              estado: st.estado,
              fabioMs: fabioTime ? Number(fabioTime.time_ms) : null,
              luisMs: luisTime ? Number(luisTime.time_ms) : null
            };
          });

          this.cachedState = this.computeMetrics(matchup, participants, stages);
          this.triggerUpdate();
          return this.cachedState;
        } catch (e) {
          console.warn('Error fetching Supabase data, fallback to local:', e);
        }
      }

      // Carga desde DB local
      const local = loadLocalDb();
      this.cachedState = this.computeMetrics(local.matchup, local.participants, local.stages);
      this.triggerUpdate();
      return this.cachedState;
    }

    // =========================================================================
    // Mutaciones de Datos (Guardar tiempos, borrar, cambiar estado)
    // =========================================================================

    async saveStageTimes(stageNumero, fabioMs, luisMs) {
      if (this.isOnline && this.supabase && this.cachedState) {
        try {
          const { matchup, participants, stages } = this.cachedState;
          const stage = stages.find(s => s.numero === stageNumero);
          if (!stage) throw new Error('Etapa no encontrada');

          const fabioId = participants[0].id;
          const luisId = participants[1].id;

          // Upsert para Fabio
          const { error: fErr } = await this.supabase
            .from('stage_times')
            .upsert({
              stage_id: stage.id,
              participant_id: fabioId,
              time_ms: fabioMs,
              updated_at: new Date().toISOString()
            }, { onConflict: 'stage_id,participant_id' });
          if (fErr) throw fErr;

          // Upsert para Luis
          const { error: lErr } = await this.supabase
            .from('stage_times')
            .upsert({
              stage_id: stage.id,
              participant_id: luisId,
              time_ms: luisMs,
              updated_at: new Date().toISOString()
            }, { onConflict: 'stage_id,participant_id' });
          if (lErr) throw lErr;

          // Actualizar estado de etapa a FINALIZADA
          await this.supabase
            .from('stages')
            .update({ estado: 'FINALIZADA' })
            .eq('id', stage.id);

          // Si el matchup estaba en PRE-RACE, pasarlo automáticamente a EN CURSO
          if (matchup.estado === 'PRE-RACE') {
            await this.updateRaceStatus('EN CURSO');
          }

          await this.refresh();
          return true;
        } catch (e) {
          console.error('Error saving to Supabase:', e);
        }
      }

      // Guardar en DB local
      const local = loadLocalDb();
      const st = local.stages.find(s => s.numero === stageNumero);
      if (st) {
        st.fabioMs = fabioMs;
        st.luisMs = luisMs;
        st.estado = 'FINALIZADA';
        if (local.matchup.estado === 'PRE-RACE') {
          local.matchup.estado = 'EN CURSO';
        }
        saveLocalDb(local);
        await this.refresh();
        return true;
      }
      return false;
    }

    async clearStageTimes(stageNumero) {
      if (this.isOnline && this.supabase && this.cachedState) {
        try {
          const { stages } = this.cachedState;
          const stage = stages.find(s => s.numero === stageNumero);
          if (stage) {
            await this.supabase
              .from('stage_times')
              .delete()
              .eq('stage_id', stage.id);

            await this.supabase
              .from('stages')
              .update({ estado: 'PENDIENTE' })
              .eq('id', stage.id);

            await this.refresh();
            return true;
          }
        } catch (e) {
          console.error('Error clearing stage on Supabase:', e);
        }
      }

      const local = loadLocalDb();
      const st = local.stages.find(s => s.numero === stageNumero);
      if (st) {
        st.fabioMs = null;
        st.luisMs = null;
        st.estado = 'PENDIENTE';
        saveLocalDb(local);
        await this.refresh();
        return true;
      }
      return false;
    }

    async updateRaceStatus(newStatus) {
      if (!['PRE-RACE', 'EN CURSO', 'FINALIZADA'].includes(newStatus)) return false;

      if (this.isOnline && this.supabase && this.cachedState) {
        try {
          const { matchup } = this.cachedState;
          const { error } = await this.supabase
            .from('matchups')
            .update({ estado: newStatus, updated_at: new Date().toISOString() })
            .eq('id', matchup.id);
          if (error) throw error;
          await this.refresh();
          return true;
        } catch (e) {
          console.error('Error updating status on Supabase:', e);
        }
      }

      const local = loadLocalDb();
      local.matchup.estado = newStatus;
      saveLocalDb(local);
      await this.refresh();
      return true;
    }

    async resetMatchup() {
      if (this.isOnline && this.supabase && this.cachedState) {
        try {
          const { matchup, stages } = this.cachedState;
          const stageIds = stages.map(s => s.id);

          await this.supabase.from('stage_times').delete().in('stage_id', stageIds);
          await this.supabase.from('stages').update({ estado: 'PENDIENTE' }).in('id', stageIds);
          await this.supabase.from('matchups').update({ estado: 'PRE-RACE' }).eq('id', matchup.id);

          await this.refresh();
          return true;
        } catch (e) {
          console.error('Error resetting matchup on Supabase:', e);
        }
      }

      const fresh = getBlankLocalData();
      saveLocalDb(fresh);
      await this.refresh();
      return true;
    }
  }

  // Exportar helper utilities & service instance
  window.EnduroService = new EnduroService();
  window.EnduroTime = { parseTime, fmt, dFmt };

})();
