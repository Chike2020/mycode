// PM2 process config — all 3 GRC apps on one server
// Start all:     pm2 start ecosystem.config.js --env production
// Start one:     pm2 start ecosystem.config.js --only accave-verilink --env production
// Reload all:    pm2 reload all --update-env

const LOG_DIR = '/var/log/grc-platform';
const SITES   = '/opt/sites';

module.exports = {
  apps: [
    // ── Accave Verilink GRC Platform ─────────────────────────────────────────
    {
      name:    'accave-verilink',
      script:  `${SITES}/accave/server.js`,
      cwd:     `${SITES}/accave`,
      instances: 1,
      exec_mode: 'fork',
      watch:   false,
      max_memory_restart: '350M',
      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
      error_file:      `${LOG_DIR}/accave-error.log`,
      out_file:        `${LOG_DIR}/accave-out.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay:   3000,
      max_restarts:    10,
    },

    // ── Shepherd GRC ─────────────────────────────────────────────────────────
    {
      name:    'shepherd-grc',
      script:  `${SITES}/shepherd/server.js`,
      cwd:     `${SITES}/shepherd`,
      instances: 1,
      exec_mode: 'fork',
      watch:   false,
      max_memory_restart: '350M',
      env_production: {
        NODE_ENV: 'production',
        PORT:     3001,
      },
      error_file:      `${LOG_DIR}/shepherd-error.log`,
      out_file:        `${LOG_DIR}/shepherd-out.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay:   3000,
      max_restarts:    10,
    },

    // ── Primum GRC ───────────────────────────────────────────────────────────
    {
      name:    'primum-grc',
      script:  `${SITES}/primum/server.js`,
      cwd:     `${SITES}/primum`,
      instances: 1,
      exec_mode: 'fork',
      watch:   false,
      max_memory_restart: '350M',
      env_production: {
        NODE_ENV: 'production',
        PORT:     3002,
      },
      error_file:      `${LOG_DIR}/primum-error.log`,
      out_file:        `${LOG_DIR}/primum-out.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay:   3000,
      max_restarts:    10,
    },
  ],
};
