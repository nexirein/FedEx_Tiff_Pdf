const express = require('express');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Load .env manually (also try .env.local as fallback)
let envPath = join(__dirname, '.env');
if (!existsSync(envPath)) envPath = join(__dirname, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...vals] = trimmed.split('=');
      const val = vals.join('=').trim();
      if (!process.env[key]) process.env[key] = val.replace(/^["']|["']$/g, '');
    }
  }
}

const TENANT_ID = process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = process.env.AZURE_AD_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET;
const PORT = process.env.PORT || 3001;

async function getAppOnlyToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function sendEmail(token, from, to, subject, bodyText) {
  const url = `https://graph.microsoft.com/v1.0/users/${from}/sendMail`;
  const email = {
    message: {
      subject: subject || 'No subject',
      body: { contentType: 'Text', content: bodyText || '' },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(email),
  });
  if (!res.ok) throw new Error(`Send mail failed (${res.status}): ${await res.text()}`);
  return true;
}

// Serve the SPA HTML with MSAL popup
app.get('/', (req, res) => {
  const missing = !TENANT_ID || !CLIENT_ID;
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Outlook Mail Demo</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://alcdn.msauth.net/browser/3.11.0/js/msal-browser.min.js"></script>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-lg">
    <div class="text-center mb-6">
      <div class="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-gray-800">Pre-Alert Email Demo</h1>
      <p class="text-sm text-gray-500 mt-1">Connect your Outlook to send test emails</p>
    </div>

    <!-- Status / Connection -->
    <div id="connectionSection" class="mb-6">
      <div id="disconnectedState">
        <button id="connectBtn"
          class="w-full bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-medium py-3 px-4 rounded-lg transition duration-150 flex items-center justify-center gap-2">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 2a3.5 3.5 0 013.163 5H17a3 3 0 012.994 2.8L20 10v2a3 3 0 01-2.8 2.995L17 15h-1.337a3.502 3.502 0 01-6.326 0H8a3 3 0 01-3-3v-2a3 3 0 013-3h2.337A3.5 3.5 0 0111.5 2z"/></svg>
          Connect Outlook
        </button>
        <p class="text-xs text-gray-400 text-center mt-2">Click to sign in with your FedEx account</p>
      </div>
      <div id="connectedState" class="hidden">
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
              <span id="userAvatar" class="text-green-700 font-bold text-sm">B</span>
            </div>
            <div>
              <p class="text-sm font-medium text-green-800">Connected as</p>
              <p id="userEmail" class="text-sm text-green-700 font-mono">bipul.sikder@fedex.com</p>
            </div>
            <button id="disconnectBtn" class="ml-auto text-xs text-red-600 hover:text-red-800 underline">Disconnect</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Send form -->
    <form id="emailForm" class="space-y-4 hidden">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">From</label>
        <input type="email" id="fromField" readonly
          class="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-600 cursor-not-allowed">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">To</label>
        <input type="email" id="toField" required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="recipient@fedex.com">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Subject</label>
        <input type="text" id="subjectField"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value="Pre-Alert — Test shipment">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Body</label>
        <textarea id="bodyField" rows="4"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >Dear Customer,

Please find attached the pre-alert for the upcoming shipment.

Shipment Reference: TEST-001
Origin: FedEx Hub
Destination: Your Facility

Best regards,
Operations Team</textarea>
      </div>
      <button type="submit"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
        </svg>
        Send Email
      </button>
    </form>

    <div id="result" class="mt-4 hidden"></div>

    <div class="mt-6 pt-4 border-t border-gray-100">
      <p class="text-xs text-gray-400 text-center">
        Uses MSAL.js popup flow — no secrets exposed to browser<br>
        Token is sent to server to send the email
      </p>
    </div>
  </div>

  <script>
    const TENANT_ID = '${TENANT_ID || ''}';
    const CLIENT_ID = '${CLIENT_ID || ''}';

    let msalInstance, account;

    async function initMsal() {
      if (!TENANT_ID || !CLIENT_ID) return;
      msalInstance = new msal.PublicClientApplication({
        auth: {
          clientId: CLIENT_ID,
          authority: 'https://login.microsoftonline.com/' + TENANT_ID,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'localStorage' },
      });
      // Check if already logged in
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        account = accounts[0];
        showConnected(account.username);
      }
    }

    document.getElementById('connectBtn')?.addEventListener('click', async () => {
      if (!TENANT_ID || !CLIENT_ID) {
        alert('Server not configured. Add Azure AD credentials to .env file.');
        return;
      }
      try {
        const res = await msalInstance.loginPopup({
          scopes: ['https://graph.microsoft.com/Mail.Send', 'https://graph.microsoft.com/User.Read'],
          prompt: 'select_account',
        });
        account = res.account;
        showConnected(account.username);
      } catch (err) {
        if (err.message?.includes('user_cancelled')) return;
        const result = document.getElementById('result');
        result.className = 'mt-4 bg-red-50 border border-red-200 rounded-lg p-4';
        result.innerHTML = '<p class="text-red-700 font-medium">✗ Connection failed</p><p class="text-red-600 text-xs mt-1">' + (err.errorMessage || err.message) + '</p>';
        result.classList.remove('hidden');
      }
    });

    function showConnected(email) {
      document.getElementById('disconnectedState').classList.add('hidden');
      document.getElementById('connectedState').classList.remove('hidden');
      document.getElementById('emailForm').classList.remove('hidden');
      document.getElementById('userEmail').textContent = email;
      document.getElementById('userAvatar').textContent = email.charAt(0).toUpperCase();
      document.getElementById('fromField').value = email;
    }

    document.getElementById('disconnectBtn')?.addEventListener('click', () => {
      if (msalInstance) msalInstance.logoutPopup();
      account = null;
      document.getElementById('disconnectedState').classList.remove('hidden');
      document.getElementById('connectedState').classList.add('hidden');
      document.getElementById('emailForm').classList.add('hidden');
    });

    document.getElementById('emailForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!account) return;

      const btn = e.target.querySelector('button');
      const result = document.getElementById('result');
      btn.disabled = true;
      btn.innerHTML = '<svg class="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Sending...';
      result.classList.add('hidden');

      try {
        // Get token silently (or popup if needed)
        const tokenRes = await msalInstance.acquireTokenSilent({
          scopes: ['https://graph.microsoft.com/Mail.Send'],
          account,
        });
        // Send token to server to relay the email
        const res = await fetch('/api/send-delegated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: tokenRes.accessToken,
            from: account.username,
            to: document.getElementById('toField').value,
            subject: document.getElementById('subjectField').value,
            body: document.getElementById('bodyField').value,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          result.className = 'mt-4 bg-green-50 border border-green-200 rounded-lg p-4';
          result.innerHTML = '<p class="text-green-700 font-medium">✓ Email sent!</p><p class="text-green-600 text-xs mt-1">To: ' + document.getElementById('toField').value + '</p>';
        } else {
          result.className = 'mt-4 bg-red-50 border border-red-200 rounded-lg p-4';
          result.innerHTML = '<p class="text-red-700 font-medium">✗ Failed</p><p class="text-red-600 text-xs mt-1">' + data.error + '</p>';
        }
      } catch (err) {
        // If silent fails, try popup
        try {
          const tokenRes = await msalInstance.acquireTokenPopup({
            scopes: ['https://graph.microsoft.com/Mail.Send'],
            account,
          });
          const res = await fetch('/api/send-delegated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: tokenRes.accessToken,
              from: account.username,
              to: document.getElementById('toField').value,
              subject: document.getElementById('subjectField').value,
              body: document.getElementById('bodyField').value,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            result.className = 'mt-4 bg-green-50 border border-green-200 rounded-lg p-4';
            result.innerHTML = '<p class="text-green-700 font-medium">✓ Email sent!</p><p class="text-green-600 text-xs mt-1">To: ' + document.getElementById('toField').value + '</p>';
          } else {
            result.className = 'mt-4 bg-red-50 border border-red-200 rounded-lg p-4';
            result.innerHTML = '<p class="text-red-700 font-medium">✗ Failed</p><p class="text-red-600 text-xs mt-1">' + data.error + '</p>';
          }
        } catch (popupErr) {
          result.className = 'mt-4 bg-red-50 border border-red-200 rounded-lg p-4';
          result.innerHTML = '<p class="text-red-700 font-medium">✗ Error</p><p class="text-red-600 text-xs mt-1">' + (popupErr.errorMessage || popupErr.message) + '</p>';
        }
      }

      result.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Send Email';
    });

    initMsal();
  </script>
</body>
</html>
  `);
});

// App-only send (client credentials) - from the previous demo
app.post('/api/send', async (req, res) => {
  try {
    const { from, to, subject, body } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'From and To are required' });
    const token = await getAppOnlyToken();
    await sendEmail(token, from, to, subject, body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delegated send (uses token from MSAL popup)
app.post('/api/send-delegated', async (req, res) => {
  try {
    const { token, from, to, subject, body } = req.body;
    if (!token) return res.status(400).json({ error: 'No token provided' });
    if (!from || !to) return res.status(400).json({ error: 'From and To are required' });
    await sendEmail(token, from, to, subject, body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  🚀 Demo app: http://localhost:${PORT}`);
  console.log(`  🔵 Click "Connect Outlook" → popup → send test email\n`);
});
