const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));   // evidence files are base64-encoded
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/org',       require('./routes/org'));
app.use('/api/state',     require('./routes/state'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/evidence',  require('./routes/evidence'));
app.use('/api/risks',     require('./routes/risks'));
app.use('/api/vendors',   require('./routes/vendors'));
app.use('/api/snapshots', require('./routes/snapshots'));
app.use('/api/audit',     require('./routes/audit'));
app.use('/api/calendar',  require('./routes/calendar'));
app.use('/api/ai',        require('./routes/ai'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── SPA routes ────────────────────────────────────────────────────────────────
app.get('/app',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`GRC Platform running → http://localhost:${PORT}`);
});
