/**
 * Enduro Evolution 2026 — Supabase Service & Realtime Client (v2 Multi-Matchup)
 * Supports multiple matchups (Fabio vs Luis, Ramón vs Ricky), Neon Postgres Serverless,
 * Supabase Realtime, and robust LocalStorage fallback with BroadcastChannel.
 */

(function () {
  'use strict';

  const BROADCAST_CHANNEL_NAME = 'enduro_matchup_realtime_v2';
  const LOCAL_DB_KEY = 'enduro_matchup_local_db_v2';

  const bc = ('BroadcastChannel' in window) ? new BroadcastChannel(BROADCAST_CHANNEL_NAME) : null;
  const REMOTE_API_ORIGIN = 'https://gata-vs-polini-portal.vercel.app';

  // Fetch inteligente con fallback automático a la API productiva en Vercel (Neon Postgres)
  async function apiFetch(path, options = {}) {
    // 1. Probar ruta relativa en el mismo origen
    try {
      const resp = await fetch(path, options);
      if (resp && resp.ok) return resp;
      if (resp && resp.status !== 404) return resp;
    } catch (e) {
      // Ignorar fallo de red local
    }

    // 2. Si dio 404 o falló localmente, conectar directo a Vercel Neon API
    try {
      const fullUrl = REMOTE_API_ORIGIN + path;
      return await fetch(fullUrl, options);
    } catch (err) {
      console.warn('Fallback a API remota de Neon falló:', err);
      return null;
    }
  }

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

  // Estructura de fallback local con 2 duelos
  function getBlankLocalData() {
    return {
      matchups: [
        {
          id: 'local-matchup-1',
          nombre: 'Enduro Evolution 2026 — Fabio vs Luis',
          estado: 'PRE-RACE',
          fecha: new Date().toISOString(),
          participants: [
            { id: 'p-fabio', nombre: 'Fabio', apodo: '“La Polinada”', apellido: 'SILVESTRI', foto_url: 'assets/fabio.png', orden: 1 },
            { id: 'p-luis', nombre: 'Luis', apodo: '“Don Gata”', apellido: 'PEÑA', foto_url: 'assets/luis.png', orden: 2 }
          ],
          stages: [
            { id: 's-1-1', numero: 1, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null },
            { id: 's-1-2', numero: 2, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null },
            { id: 's-1-3', numero: 3, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null },
            { id: 's-1-4', numero: 4, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null }
          ]
        },
        {
          id: 'local-matchup-2',
          nombre: 'Matchup 2 — Ramón Reyes vs Ricky Tarrazo',
          estado: 'PRE-RACE',
          fecha: new Date().toISOString(),
          participants: [
            { id: 'p-ramon', nombre: 'Ramón', apodo: '“El Patrón”', apellido: 'REYES', foto_url: 'assets/ramon.png', orden: 1 },
            { id: 'p-ricky', nombre: 'Ricky', apodo: '“Chuquiton”', apellido: 'TARRAZO', foto_url: 'assets/ricky.png', orden: 2 }
          ],
          stages: [
            { id: 's-2-1', numero: 1, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null },
            { id: 's-2-2', numero: 2, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null },
            { id: 's-2-3', numero: 3, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null },
            { id: 's-2-4', numero: 4, estado: 'PENDIENTE', rider1Ms: null, rider2Ms: null, fabioMs: null, luisMs: null }
          ]
        }
      ],
      updatedAt: null
    };
  }

  function loadLocalDb() {
    try {
      const stored = localStorage.getItem(LOCAL_DB_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.matchups) && parsed.matchups.length >= 2) {
          return parsed;
        }
        // Migración limpia si venía de v1 (un solo matchup)
        const fresh = getBlankLocalData();
        if (parsed && parsed.matchup && Array.isArray(parsed.stages)) {
          fresh.matchups[0].matchup = parsed.matchup;
          fresh.matchups[0].stages = parsed.stages;
          if (parsed.participants) fresh.matchups[0].participants = parsed.participants;
        }
        saveLocalDb(fresh);
        return fresh;
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
      this.allMatchups = [];
      this.activeMatchupIndex = 0;
      this.init();
    }

    async init() {
      this.notifyStatus('connecting');

      // 1. Prioridad Máxima: Neon Serverless Postgres mediante API Vercel
      try {
        await this.refresh();
        if (this.isNeon && this.isOnline) {
          return;
        }
      } catch (e) {
        console.warn('Neon API initial check failed:', e);
      }

      // 2. Supabase directo si hay credenciales configuradas
      const config = window.EnduroConfig ? window.EnduroConfig.get() : {};
      const hasCredentials = config.supabaseUrl && config.supabaseAnonKey &&
        !config.supabaseUrl.includes('TU_SUPABASE') &&
        config.supabaseUrl.startsWith('http');

      if (hasCredentials && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
          this.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
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

      // 3. Modo local de respaldo
      this.isOnline = false;
      this.notifyStatus('offline_mode');
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

    // Cambiar el matchup activo
    setActiveMatchup(idOrIndex) {
      if (typeof idOrIndex === 'number') {
        this.activeMatchupIndex = idOrIndex;
      } else if (typeof idOrIndex === 'string') {
        const foundIdx = this.allMatchups.findIndex(m => m.id === idOrIndex || String(m.id).includes(idOrIndex));
        if (foundIdx !== -1) {
          this.activeMatchupIndex = foundIdx;
        }
      }

      if (this.allMatchups && this.allMatchups[this.activeMatchupIndex]) {
        this.cachedState = {
          ...this.allMatchups[this.activeMatchupIndex],
          allMatchups: this.allMatchups,
          activeIndex: this.activeMatchupIndex,
          isOnline: this.isOnline,
          connectionStatus: this.connectionStatus || (this.isOnline ? 'connected' : 'offline_mode')
        };
        this.triggerUpdate();
      }
    }

    getActiveMatchup() {
      return this.allMatchups[this.activeMatchupIndex] || this.cachedState;
    }

    getAllMatchups() {
      return this.allMatchups;
    }

    // Calcula estadísticas, líder y totales de un matchup específico
    computeMetrics(matchup, participants, stages, mIndex = 0) {
      const p1 = participants.find(p => p.orden === 1) || participants[0] || { nombre: 'Piloto 1', apodo: '', apellido: '' };
      const p2 = participants.find(p => p.orden === 2) || participants[1] || { nombre: 'Piloto 2', apodo: '', apellido: '' };

      let r1Accum = 0;
      let r2Accum = 0;
      let completedCount = 0;
      let r1Wins = 0;
      let r2Wins = 0;
      let ties = 0;

      const enrichedStages = stages.map((st) => {
        const t1 = st.rider1Ms !== undefined && st.rider1Ms !== null ? st.rider1Ms : st.fabioMs;
        const t2 = st.rider2Ms !== undefined && st.rider2Ms !== null ? st.rider2Ms : st.luisMs;
        const hasBoth = t1 !== null && t2 !== null && !isNaN(t1) && !isNaN(t2);

        let deltaMs = null;
        let winner = null;

        if (hasBoth) {
          completedCount++;
          r1Accum += t1;
          r2Accum += t2;
          deltaMs = t2 - t1; // > 0 significa que r1 fue más veloz
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
          ...st,
          rider1Ms: t1,
          rider2Ms: t2,
          fabioMs: t1, // compatibilidad
          luisMs: t2,  // compatibilidad
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
          const cleanNick = p1.apodo ? p1.apodo.replace(/[“”"]/g, '').toUpperCase() : p1.nombre.toUpperCase();
          leaderText = `${cleanNick} LIDERA`;
        } else if (diff < 0) {
          leaderWinner = 'rider2';
          const cleanNick = p2.apodo ? p2.apodo.replace(/[“”"]/g, '').toUpperCase() : p2.nombre.toUpperCase();
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
        matchup,
        participants: [p1, p2],
        stages: enrichedStages,
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
    }

    async refresh() {
      // 1. Prioridad: Endpoints Serverless de Neon Postgres
      try {
        const resp = await apiFetch('/api/state', { cache: 'no-store' });
        if (resp && resp.ok) {
          const json = await resp.json();
          if (json.ok) {
            this.isNeon = true;
            this.isOnline = true;
            this.notifyStatus('connected');

            if (json.matchups && json.matchups.length >= 2) {
              this.allMatchups = json.matchups;
            } else if (json.data || (json.matchups && json.matchups.length === 1)) {
              const primary = json.data || json.matchups[0];
              const local = loadLocalDb();
              const m1Enriched = this.computeMetrics(primary.matchup || primary, primary.participants, primary.stages, 0);
              const m2Obj = local.matchups[1];
              const m2Enriched = m2Obj ? this.computeMetrics(
                { id: m2Obj.id, nombre: m2Obj.nombre, estado: m2Obj.estado, fecha: m2Obj.fecha },
                m2Obj.participants,
                m2Obj.stages,
                1
              ) : null;
              this.allMatchups = m2Enriched ? [m1Enriched, m2Enriched] : [m1Enriched];
            }

            const current = this.allMatchups[this.activeMatchupIndex] || this.allMatchups[0];
            this.cachedState = {
              ...current,
              allMatchups: this.allMatchups,
              activeIndex: this.activeMatchupIndex,
              isOnline: true,
              connectionStatus: 'connected'
            };
            this.triggerUpdate();
            return this.cachedState;
          }
        }
      } catch (e) {
        // Continuar con fallback
      }

      // 2. Supabase directo
      if (this.isOnline && this.supabase) {
        try {
          const { data: rawMatchups, error: mErr } = await this.supabase
            .from('matchups')
            .select('*')
            .order('created_at', { ascending: true });

          if (mErr || !rawMatchups?.length) throw mErr || new Error('No matchups found');

          const { data: rawParticipants } = await this.supabase.from('participants').select('*').order('orden', { ascending: true });
          const { data: rawStages } = await this.supabase.from('stages').select('*').order('numero', { ascending: true });
          const { data: rawTimes } = await this.supabase.from('stage_times').select('*');

          this.allMatchups = rawMatchups.map((m, mIdx) => {
            const mParticipants = (rawParticipants || []).filter(p => p.matchup_id === m.id).sort((a, b) => a.orden - b.orden);
            const mStages = (rawStages || []).filter(s => s.matchup_id === m.id).sort((a, b) => a.numero - b.numero);

            const mappedStages = mStages.map(st => {
              const t1 = rawTimes?.find(t => t.stage_id === st.id && t.participant_id === mParticipants[0]?.id);
              const t2 = rawTimes?.find(t => t.stage_id === st.id && t.participant_id === mParticipants[1]?.id);
              return {
                id: st.id,
                numero: st.numero,
                estado: st.estado,
                rider1Ms: t1 ? Number(t1.time_ms) : null,
                rider2Ms: t2 ? Number(t2.time_ms) : null
              };
            });

            return this.computeMetrics(m, mParticipants, mappedStages, mIdx);
          });

          const current = this.allMatchups[this.activeMatchupIndex] || this.allMatchups[0];
          this.cachedState = {
            ...current,
            allMatchups: this.allMatchups,
            activeIndex: this.activeMatchupIndex,
            isOnline: true,
            connectionStatus: 'connected'
          };
          this.triggerUpdate();
          return this.cachedState;
        } catch (e) {
          console.warn('Error fetching Supabase data, fallback to local:', e);
        }
      }

      // 3. Carga desde DB local
      const local = loadLocalDb();
      this.allMatchups = local.matchups.map((mObj, idx) => {
        return this.computeMetrics(
          { id: mObj.id, nombre: mObj.nombre, estado: mObj.estado, fecha: mObj.fecha },
          mObj.participants,
          mObj.stages,
          idx
        );
      });

      const current = this.allMatchups[this.activeMatchupIndex] || this.allMatchups[0];
      this.cachedState = {
        ...current,
        allMatchups: this.allMatchups,
        activeIndex: this.activeMatchupIndex,
        isOnline: false,
        connectionStatus: this.connectionStatus || 'offline_mode'
      };
      this.triggerUpdate();
      return this.cachedState;
    }

    // =========================================================================
    // Mutaciones de Datos (Guardar tiempos, borrar, cambiar estado)
    // =========================================================================

    async saveStageTimes(stageNumero, rider1Ms, rider2Ms, matchupId = null) {
      const activeMatchup = this.getActiveMatchup();
      const targetMatchupId = matchupId || activeMatchup?.id;
      const isLocalId = !targetMatchupId || String(targetMatchupId).startsWith('local-');

      // Prioridad Neon Serverless vía API (solo si el ID es de Neon/remoto)
      if (!isLocalId) {
        try {
          const resp = await apiFetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stageNumero,
              rider1Ms,
              rider2Ms,
              fabioMs: rider1Ms,
              luisMs: rider2Ms,
              matchupId: targetMatchupId
            })
          });
          if (resp && resp.ok) {
            this.isNeon = true;
            this.isOnline = true;
            await this.refresh();
            return true;
          }
        } catch (e) {
          console.error('Error saving to Neon API:', e);
        }
      }

      // Fallback Supabase
      if (this.isOnline && this.supabase) {
        try {
          const { data: stages } = await this.supabase
            .from('stages')
            .select('*')
            .eq('matchup_id', targetMatchupId)
            .eq('numero', stageNumero);

          const stage = stages?.[0];
          if (!stage) throw new Error('Etapa no encontrada');

          const { data: participants } = await this.supabase
            .from('participants')
            .select('*')
            .eq('matchup_id', targetMatchupId)
            .order('orden', { ascending: true });

          const r1Id = participants?.[0]?.id;
          const r2Id = participants?.[1]?.id;

          if (r1Id) {
            await this.supabase.from('stage_times').upsert({
              stage_id: stage.id,
              participant_id: r1Id,
              time_ms: rider1Ms,
              updated_at: new Date().toISOString()
            }, { onConflict: 'stage_id,participant_id' });
          }

          if (r2Id) {
            await this.supabase.from('stage_times').upsert({
              stage_id: stage.id,
              participant_id: r2Id,
              time_ms: rider2Ms,
              updated_at: new Date().toISOString()
            }, { onConflict: 'stage_id,participant_id' });
          }

          await this.supabase.from('stages').update({ estado: 'FINALIZADA' }).eq('id', stage.id);
          await this.supabase.from('matchups').update({ estado: 'EN CURSO' }).eq('id', targetMatchupId);

          await this.refresh();
          return true;
        } catch (e) {
          console.error('Error saving to Supabase:', e);
        }
      }

      // Guardar en DB local
      const local = loadLocalDb();
      const mItem = local.matchups.find(m => m.id === targetMatchupId) || local.matchups[this.activeMatchupIndex];
      if (mItem) {
        const st = mItem.stages.find(s => s.numero === stageNumero);
        if (st) {
          st.rider1Ms = rider1Ms;
          st.rider2Ms = rider2Ms;
          st.fabioMs = rider1Ms;
          st.luisMs = rider2Ms;
          st.estado = 'FINALIZADA';
          if (mItem.estado === 'PRE-RACE') {
            mItem.estado = 'EN CURSO';
          }
          saveLocalDb(local);
          await this.refresh();
          return true;
        }
      }
      return false;
    }

    async clearStageTimes(stageNumero, matchupId = null) {
      const activeMatchup = this.getActiveMatchup();
      const targetMatchupId = matchupId || activeMatchup?.id;
      const isLocalId = !targetMatchupId || String(targetMatchupId).startsWith('local-');

      if (!isLocalId) {
        try {
          const resp = await apiFetch('/api/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stageNumero, matchupId: targetMatchupId })
          });
          if (resp && resp.ok) {
            this.isNeon = true;
            this.isOnline = true;
            await this.refresh();
            return true;
          }
        } catch (e) {
          console.error('Error clearing on Neon API:', e);
        }
      }

      if (this.isOnline && this.supabase) {
        try {
          const { data: stages } = await this.supabase
            .from('stages')
            .select('id')
            .eq('matchup_id', targetMatchupId)
            .eq('numero', stageNumero);

          const stage = stages?.[0];
          if (stage) {
            await this.supabase.from('stage_times').delete().eq('stage_id', stage.id);
            await this.supabase.from('stages').update({ estado: 'PENDIENTE' }).eq('id', stage.id);
            await this.refresh();
            return true;
          }
        } catch (e) {
          console.error('Error clearing stage on Supabase:', e);
        }
      }

      const local = loadLocalDb();
      const mItem = local.matchups.find(m => m.id === targetMatchupId) || local.matchups[this.activeMatchupIndex];
      if (mItem) {
        const st = mItem.stages.find(s => s.numero === stageNumero);
        if (st) {
          st.rider1Ms = null;
          st.rider2Ms = null;
          st.fabioMs = null;
          st.luisMs = null;
          st.estado = 'PENDIENTE';
          saveLocalDb(local);
          await this.refresh();
          return true;
        }
      }
      return false;
    }

    async updateRaceStatus(newStatus, matchupId = null) {
      if (!['PRE-RACE', 'EN CURSO', 'FINALIZADA'].includes(newStatus)) return false;
      const activeMatchup = this.getActiveMatchup();
      const targetMatchupId = matchupId || activeMatchup?.id;
      const isLocalId = !targetMatchupId || String(targetMatchupId).startsWith('local-');

      if (!isLocalId) {
        try {
          const resp = await apiFetch('/api/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus, matchupId: targetMatchupId })
          });
          if (resp && resp.ok) {
            this.isNeon = true;
            this.isOnline = true;
            await this.refresh();
            return true;
          }
        } catch (e) {
          console.error('Error updating status on Neon API:', e);
        }
      }

      if (this.isOnline && this.supabase) {
        try {
          await this.supabase
            .from('matchups')
            .update({ estado: newStatus, updated_at: new Date().toISOString() })
            .eq('id', targetMatchupId);
          await this.refresh();
          return true;
        } catch (e) {
          console.error('Error updating status on Supabase:', e);
        }
      }

      const local = loadLocalDb();
      const mItem = local.matchups.find(m => m.id === targetMatchupId) || local.matchups[this.activeMatchupIndex];
      if (mItem) {
        mItem.estado = newStatus;
        saveLocalDb(local);
        await this.refresh();
        return true;
      }
      return false;
    }

    async resetMatchup(matchupId = null) {
      const activeMatchup = this.getActiveMatchup();
      const targetMatchupId = matchupId || activeMatchup?.id;
      const isLocalId = !targetMatchupId || String(targetMatchupId).startsWith('local-');

      if (!isLocalId) {
        try {
          const resp = await apiFetch('/api/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchupId: targetMatchupId })
          });
          if (resp && resp.ok) {
            this.isNeon = true;
            this.isOnline = true;
            await this.refresh();
            return true;
          }
        } catch (e) {
          console.error('Error resetting on Neon API:', e);
        }
      }

      if (this.isOnline && this.supabase) {
        try {
          const { data: stages } = await this.supabase
            .from('stages')
            .select('id')
            .eq('matchup_id', targetMatchupId);

          const stageIds = stages?.map(s => s.id) || [];
          if (stageIds.length > 0) {
            await this.supabase.from('stage_times').delete().in('stage_id', stageIds);
            await this.supabase.from('stages').update({ estado: 'PENDIENTE' }).in('id', stageIds);
          }
          await this.supabase.from('matchups').update({ estado: 'PRE-RACE' }).eq('id', targetMatchupId);
          await this.refresh();
          return true;
        } catch (e) {
          console.error('Error resetting matchup on Supabase:', e);
        }
      }

      const local = loadLocalDb();
      const mItem = local.matchups.find(m => m.id === targetMatchupId) || local.matchups[this.activeMatchupIndex];
      if (mItem) {
        mItem.estado = 'PRE-RACE';
        mItem.stages.forEach(st => {
          st.rider1Ms = null;
          st.rider2Ms = null;
          st.fabioMs = null;
          st.luisMs = null;
          st.estado = 'PENDIENTE';
        });
        saveLocalDb(local);
        await this.refresh();
        return true;
      }
      return false;
    }
  }

  // Exportar helper utilities & service instance
  window.EnduroService = new EnduroService();
  window.EnduroTime = { parseTime, fmt, dFmt };

})();
