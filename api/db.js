const { neon } = require('@neondatabase/serverless');

let schemaInitialized = false;

function getSql() {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!conn) {
    throw new Error('DATABASE_URL or POSTGRES_URL not configured');
  }
  return neon(conn);
}

async function ensureSchema(sql) {
  if (schemaInitialized) return;

  // 1. Tablas principales
  await sql`
    CREATE TABLE IF NOT EXISTS matchups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PRE-RACE',
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      matchup_id UUID NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      apodo TEXT NOT NULL,
      apellido TEXT NOT NULL,
      foto_url TEXT NOT NULL,
      orden INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      matchup_id UUID NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
      numero INT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(matchup_id, numero)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stage_times (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      time_ms BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(stage_id, participant_id)
    );
  `;

  // 2. Comprobar e inicializar Matchup 1 si no existe
  const existingMatchups = await sql`SELECT id, nombre FROM matchups ORDER BY created_at ASC`;
  let m1Id = existingMatchups[0]?.id;

  if (!m1Id) {
    const [matchup] = await sql`
      INSERT INTO matchups (nombre, estado)
      VALUES ('Enduro Evolution 2026 — Match Up en Llamas', 'PRE-RACE')
      RETURNING id;
    `;
    m1Id = matchup.id;

    await sql`
      INSERT INTO participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
      VALUES (${m1Id}, 'Fabio', '“La Polinada”', 'SILVESTRI', 'assets/fabio.png', 1);
    `;

    await sql`
      INSERT INTO participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
      VALUES (${m1Id}, 'Luis', '“Don Gata”', 'PEÑA', 'assets/luis.png', 2);
    `;

    for (let i = 1; i <= 4; i++) {
      await sql`
        INSERT INTO stages (matchup_id, numero, estado)
        VALUES (${m1Id}, ${i}, 'PENDIENTE')
        ON CONFLICT (matchup_id, numero) DO NOTHING;
      `;
    }
  }

  // 3. Comprobar e inicializar Matchup 2 (Ramón Reyes vs Ricky Tarrazo)
  const allCurrentMatchups = await sql`SELECT id, nombre FROM matchups ORDER BY created_at ASC`;
  if (allCurrentMatchups.length < 2) {
    const [m2] = await sql`
      INSERT INTO matchups (nombre, estado)
      VALUES ('Matchup 2 — Ramón Reyes vs Ricky Tarrazo', 'PRE-RACE')
      RETURNING id;
    `;
    const m2Id = m2.id;

    await sql`
      INSERT INTO participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
      VALUES (${m2Id}, 'Ramón', '“El Patrón”', 'REYES', 'assets/ramon.png', 1);
    `;

    await sql`
      INSERT INTO participants (matchup_id, nombre, apodo, apellido, foto_url, orden)
      VALUES (${m2Id}, 'Ricky', '“Chuquiton”', 'TARRAZO', 'assets/ricky.png', 2);
    `;

    for (let i = 1; i <= 4; i++) {
      await sql`
        INSERT INTO stages (matchup_id, numero, estado)
        VALUES (${m2Id}, ${i}, 'PENDIENTE')
        ON CONFLICT (matchup_id, numero) DO NOTHING;
      `;
    }
  }

  schemaInitialized = true;
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return req.body;
}

module.exports = { getSql, ensureSchema, getBody };
