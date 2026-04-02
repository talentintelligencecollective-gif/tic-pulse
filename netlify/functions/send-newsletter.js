// netlify/functions/send-newsletter.js
// Sends a newsletter HTML email via Brevo transactional API

export async function handler(event) {
  // Only POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Auth check: require a valid Supabase JWT
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } = process.env;
  if (!BREVO_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "BREVO_API_KEY not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { to, subject, htmlContent, senderName } = body;

  if (!to || !subject || !htmlContent) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields: to, subject, htmlContent" }) };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = Array.isArray(to) ? to : [to];
  for (const email of recipients) {
    if (!emailRegex.test(email)) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid email: ${email}` }) };
    }
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: senderName || BREVO_SENDER_NAME || "TIC Pulse",
          email: BREVO_SENDER_EMAIL || "noreply@ticpulse.com",
        },
        to: recipients.map((email) => ({ email })),
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Brevo API error:", response.status, err);
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Failed to send email",
          detail: err.message || `Brevo returned ${response.status}`,
        }),
      };
    }

    const result = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, messageId: result.messageId }),
    };
  } catch (err) {
    console.error("Send newsletter error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal error sending email" }),
    };
  }
}
