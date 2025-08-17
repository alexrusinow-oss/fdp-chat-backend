// api/chat.js — mit Routing-Regeln für Preisfragen (Gitterrost / Podest) + CORS
module.exports = async (req, res) => {
  // --- CORS (bei Bedarf ORIGIN auf deine Domain setzen) ---
  const ORIGIN = "*";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ reply: "SERVER_ERROR: OPENAI_API_KEY fehlt im Vercel Projekt." });
    }

    // Body sicher parsen
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { messages = [] } = body;

    // Links zentral definieren
    const LINKS = {
      gitterrost: "https://www.fertighaus-designprodukte.de/gitterrostkostenrechner",
      podest:     "https://www.fertighaus-designprodukte.de/eingangspodest-system"
    };

    // Kompakte Firmen-KB (optional erweiterbar)
    const KB = {
      company: "Fertighaus-Designprodukte GmbH",
      contact: "info@fertighaus-designprodukte.de, +49 6458 4869988",
    };

    // System-Regeln, die dein gewünschtes Verhalten fest verdrahten
    const systemPrompt = [
      "Du bist der AI-Assistent von Fertighaus-Designprodukte. Antworte stets auf Deutsch, kurz, freundlich und präzise.",
      "WICHTIGE ROUTING-REGELN:",
      `1) Preisfragen zu Gitterrosten: Verweise IMMER auf den Kostenrechner (${LINKS.gitterrost}).`,
      `2) Preisfragen zu Podesten/Eingangspodest: Verweise IMMER auf die Podest-Seite (${LINKS.podest}).`,
      "3) Schreibe IMMER dazu: 'Sobald Sie dort die Anfrage absenden, erhalten Sie die passenden Anleitungen automatisch mitgeschickt.'",
      "4) Nenne keine festen Preise aus dem Kopf; leite konsequent auf die passende Seite.",
      "5) Beantworte alle anderen Produktfragen sachlich, hilfsbereit und kundenorientiert.",
      `Firmen-KB: ${JSON.stringify(KB)}`
    ].join("\n");

    // (Optional) kleine Heuristik: Wenn die letzte User-Nachricht klar eine Preisfrage ist,
    // geben wir dem Modell zusätzlich einen sanften Nudge über eine 'assistant' Vorgabe.
    const lastUser = [...messages].reverse().find(m => m?.role === "user")?.content?.toLowerCase() || "";
    let assistantNudge = "";
    const isPriceIntent = /preis|preise|kosten|angebot|kalkulator|rechner|wie teuer|kostenrechner/.test(lastUser);
    const mentionsRost  = /(gitterrost|rost|rostsystem|aluline|blackline)/.test(lastUser);
    const mentionsPod   = /(podest|eingangspodest|stufe|steg|treppe)/.test(lastUser);

    if (isPriceIntent && mentionsRost) {
      assistantNudge =
        `Bei Preisfragen zu Gitterrost: Verweise zuerst auf ${LINKS.gitterrost} und erwähne, dass beim Absenden die Anleitungen automatisch mitkommen.`;
    } else if (isPriceIntent && mentionsPod) {
      assistantNudge =
        `Bei Preisfragen zum Podest: Verweise zuerst auf ${LINKS.podest} und erwähne, dass beim Absenden die Anleitungen automatisch mitkommen.`;
    }

    // OpenAI call
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          ...(assistantNudge ? [{ role: "system", content: assistantNudge }] : []),
          ...messages
        ]
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
