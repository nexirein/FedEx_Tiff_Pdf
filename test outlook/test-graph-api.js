// Microsoft Graph API — test email sending via client credentials flow
// Usage: node test-graph-api.js
// Requires these env vars (can be in .env.local or exported):
//   AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET
//   MAILBOX (e.g. "sharedmailbox@fedex.com")
//   RECIPIENT (e.g. "bipul.sikder@fedex.com")

const TENANT_ID = process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = process.env.AZURE_AD_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET;
const MAILBOX = process.env.MAILBOX;
const RECIPIENT = process.env.RECIPIENT;

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !MAILBOX || !RECIPIENT) {
  console.error(`
Missing environment variables. Set them and try again:

  export AZURE_AD_TENANT_ID="your-tenant-id"
  export AZURE_AD_CLIENT_ID="your-client-id"
  export AZURE_AD_CLIENT_SECRET="your-client-secret"
  export MAILBOX="sharedmailbox@fedex.com"
  export RECIPIENT="bipul.sikder@fedex.com"
  node test-graph-api.js

Or put them in a .env file and use: source .env && node test-graph-api.js
`);
  process.exit(1);
}

async function getAccessToken() {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token request failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function sendTestEmail(token, from, to) {
  const url = `https://graph.microsoft.com/v1.0/users/${from}/sendMail`;
  const email = {
    message: {
      subject: 'Test — Microsoft Graph API integration',
      body: {
        contentType: 'Text',
        content: `Hello,\n\nThis is a test email sent via Microsoft Graph API (client credentials flow).\n\nIf you received this, the setup works correctly.\n\nSent at: ${new Date().toISOString()}`,
      },
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Send mail failed (${res.status}): ${err}`);
  }

  console.log(`\n✓ Email sent successfully from ${from} to ${to}`);
}

async function main() {
  console.log('\n🔐 Requesting access token...');
  const token = await getAccessToken();
  console.log('✓ Token obtained');

  console.log(`\n📧 Sending test email from ${MAILBOX} to ${RECIPIENT}...`);
  await sendTestEmail(token, MAILBOX, RECIPIENT);

  console.log('\n✅ All tests passed. Your Azure AD + Graph API setup is working.\n');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
