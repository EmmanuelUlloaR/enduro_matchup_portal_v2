/**
 * Enduro Evolution 2026 — Configuration Module
 * Manages Supabase credentials and administrative security PIN.
 */

const CONFIG_STORAGE_KEY = 'enduro_matchup_config_v2';

const DEFAULT_CONFIG = {
  // Puedes pegar aquí tus credenciales de Supabase o configurarlas desde /admin
  supabaseUrl: '',
  supabaseAnonKey: '',
  adminPin: 'enduro2026',
  matchupTitle: 'Enduro Evolution 2026 — Match Up en Llamas'
};

function getConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn('Error reading config from localStorage:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(updated) {
  try {
    const current = getConfig();
    const merged = { ...current, ...updated };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.error('Error saving config:', e);
    return null;
  }
}

// Exportar globalmente
window.EnduroConfig = {
  get: getConfig,
  save: saveConfig,
  DEFAULT_PIN: DEFAULT_CONFIG.adminPin
};
