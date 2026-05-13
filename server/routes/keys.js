const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../auth');
const { getKeys, getKeyById, createKey, deleteKey } = require('../db');

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

/** Convert ed25519 SPKI DER buffer → OpenSSH authorized_keys line */
function ed25519SpkiToSsh(spkiDer, comment = 'cxssh') {
  // SPKI for ed25519: 12-byte header + 32-byte raw public key
  const rawPub = spkiDer.slice(-32);
  const keyType = 'ssh-ed25519';
  const blob = Buffer.concat([
    uint32BE(keyType.length), Buffer.from(keyType),
    uint32BE(rawPub.length), rawPub,
  ]);
  return `ssh-ed25519 ${blob.toString('base64')} ${comment}`;
}

/** Try to derive SSH public key string from a private-key PEM */
function privateKeyToSshPublic(pemStr, comment = 'cxssh') {
  try {
    const privKey = crypto.createPrivateKey(pemStr);
    const pubKey  = crypto.createPublicKey(privKey);
    const keyType = privKey.asymmetricKeyType; // 'ed25519', 'rsa', 'ec', …
    if (keyType === 'ed25519') {
      const spkiDer = pubKey.export({ type: 'spki', format: 'der' });
      return ed25519SpkiToSsh(spkiDer, comment);
    }
    // For RSA / EC just return the SPKI PEM — user can copy it
    return pubKey.export({ type: 'spki', format: 'pem' });
  } catch {
    return null;
  }
}

/** SHA-256 fingerprint of an OpenSSH public key blob */
function sshFingerprint(sshPublicLine) {
  try {
    const parts = sshPublicLine.trim().split(' ');
    const blob = Buffer.from(parts[1], 'base64');
    const hash = crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
    return `SHA256:${hash}`;
  } catch {
    return null;
  }
}

// ── routes ────────────────────────────────────────────────────────────────────

// GET /api/keys
router.get('/', requireAuth, (req, res) => {
  res.json(getKeys());
});

// GET /api/keys/:id/public  – return public key for copying
router.get('/:id/public', requireAuth, (req, res) => {
  const key = getKeyById(req.params.id);
  if (!key) return res.status(404).json({ error: 'Not found' });
  res.json({ public_key: key.public_key, fingerprint: key.fingerprint });
});

// POST /api/keys/generate
router.post('/generate', requireAuth, (req, res) => {
  const { name, key_type = 'ed25519', comment } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  let privateKeyPem, publicKeySsh, keyTypeSaved;

  if (key_type === 'rsa') {
    const pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    });
    privateKeyPem = pair.privateKey;
    // RSA SPKI PEM as SSH public key — best-effort
    publicKeySsh = privateKeyToSshPublic(privateKeyPem, comment || name);
    keyTypeSaved = 'rsa-4096';
  } else {
    // ed25519 (default)
    const pair = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding:  { type: 'spki',  format: 'der' },
    });
    privateKeyPem = pair.privateKey;
    publicKeySsh  = ed25519SpkiToSsh(pair.publicKey, comment || name);
    keyTypeSaved  = 'ed25519';
  }

  const fingerprint = sshFingerprint(publicKeySsh);

  const saved = createKey({
    id: uuidv4(), name,
    key_type: keyTypeSaved,
    private_key: privateKeyPem,
    public_key:  publicKeySsh,
    fingerprint,
  });

  res.status(201).json({
    id: saved.id, name: saved.name,
    key_type: saved.key_type,
    public_key: saved.public_key,
    fingerprint: saved.fingerprint,
    created_at: saved.created_at,
  });
});

// POST /api/keys/import
router.post('/import', requireAuth, (req, res) => {
  const { name, private_key, public_key } = req.body;
  if (!name || !private_key) return res.status(400).json({ error: 'name and private_key are required' });

  // Detect key type
  let keyType = 'unknown';
  try {
    const k = crypto.createPrivateKey(private_key);
    keyType = k.asymmetricKeyType || 'unknown';
  } catch (e) {
    return res.status(400).json({ error: `Invalid private key: ${e.message}` });
  }

  const derivedPublic = public_key || privateKeyToSshPublic(private_key, name);
  const fingerprint   = derivedPublic ? sshFingerprint(derivedPublic) : null;

  const saved = createKey({
    id: uuidv4(), name,
    key_type: keyType,
    private_key: private_key.trim(),
    public_key:  derivedPublic || null,
    fingerprint,
  });

  res.status(201).json({
    id: saved.id, name: saved.name,
    key_type: saved.key_type,
    public_key: saved.public_key,
    fingerprint: saved.fingerprint,
    created_at: saved.created_at,
  });
});

// DELETE /api/keys/:id
router.delete('/:id', requireAuth, (req, res) => {
  if (!getKeyById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  deleteKey(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
