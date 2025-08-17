// api/chat.js — robuste Minimalfunktion mit CORS + klaren Fehlermeldungen
module.exports = async (req, res) => {
  // --- CORS (bei Bedarf ORIGIN auf deine Domain setzen) ---
  const ORIGIN = "*";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ reply: "SERVER_ERROR: OPENAI_API_KEY fehlt im Vercel Projekt." });
    }

    // Body sicher parsen (String oder Objekt möglich)
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { messages = [] } = body;

    // (Optional) kleine Firmen-KB – kann leer bleiben oder erweitert werden
    const KB = {
      company: "Fertighaus-Designprodukte GmbH",
      products: {
        gitterrost: {
          PRO: { price_lfm: 330, spec: "Tiefe 30 cm + Laibung, Aufbauhöhe 2,5 cm, Länge bis 2,5 m (optional 3,5 m), Tiefe in ±5,3 cm, RAL-Pulver." },
          BASIC:{ price_lfm: 200, spec: "Fixe Längen 1/1,5/2/2,5 m, Tiefe 30 cm, Aufbauhöhe 2,5 cm; keine Sonderzuschnitte/Gehrungen/Laibung." }
        },
        blackline:{ price_lfm: 149, spec: "Konsole für 6/8 cm Randstein, höhenverstellbar, Antirutschmatte & Schaumstoffband; ~1 cm Aufbau; schwarz matt." }
      }
    };

    const systemPrompt = [
      "Du bist der Website-Assistent von Fertighaus-Designprodukte.",
      "Antworte freundlich, präzise, in Deutsch.",
      "Nutze zuerst die bereitgestellte KB. Falls Infos fehlen: 'Preis/Details auf Anfrage' und Kontakt anbieten.",
      `KB: ${JSON.stringify(KB)}`
    ].join("\n");

    // Kompatibel & günstig: chat.completions mit gpt-4o-mini
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.3
      })
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ reply: "OPENAI_ERROR: " + txt });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || "Keine Antwort erhalten.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ reply: "SERVER_ERROR: " + (err?.message || String(err)) });
  }
};
