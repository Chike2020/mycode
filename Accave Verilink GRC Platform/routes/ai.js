const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// POST /api/ai/chat — proxy to Anthropic, using org's API key
router.post('/chat', requireAuth, async (req, res) => {
  const org = db.prepare('SELECT anthropic_key FROM organizations WHERE id = ?').get(req.user.orgId);
  const apiKey = org?.anthropic_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(402).json({ error: 'No Anthropic API key configured. Add one in Settings → API Key.' });

  const { system, messages, max_tokens = 1000 } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  try {
    const upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens,
        system,
        messages,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach Anthropic API' });
  }
});

module.exports = router;
