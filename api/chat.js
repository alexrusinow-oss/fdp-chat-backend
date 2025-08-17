// api/chat.js — Preis-Kurzinfo + klickbare Links (HTML) + CORS
module.exports = async (req, res) => {
  const ORIGIN = "*";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ reply: "SERVER_ERROR: OPENAI_API_KEY fehlt." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { messages = [] } = body;

    const LINKS = {
      gitterrost: "https://www.fertighaus-designprodukte.de/gitterrostkostenrechner",
      podest:     "https://www.fertighaus-designprodukte.de/eingangspodest-system"
    };

    const KB = {
      prices_hint: {
        gitterrost: {
          PRO:   "ab 330 €/lfm",
          BASIC: "ab 200 €/lfm",
          blackline: "Konsole: 149 €/lfm"
        }
      }
    };

    const systemPrompt = [
      "Du bist der AI-Assistent von Fertighaus-Designprodukte. Antworte kurz, freundlich und präzise in DE.",
      // WICHTIG: Wir wollen HTML ausgeben (für klickbare Links)
      "Wenn du Links ausgibst, verwende reines HTML mit <a href=\"…\" target=\"_blank\" rel=\"noopener\">…</a> und <br> für Zeilenumbrüche. Kein Markdown.",
      "REGELN für Preisfragen:",
      `- Gitterrost: gib zuerst eine kurze Preisübersicht (z. B. PRO ${KB.prices_hint.gitterrost.PRO}, BASIC ${KB.prices_hint.gitterrost.BASIC}, Blackline-Konsole ${KB.prices_hint.gitterrost.blackline}).`,
      `  Danach in einer separaten Zeile ein klickbarer Link: <a href="${LINKS.gitterrost}" target="_blank" rel="noopener">Gitterrostkostenrechner öffnen</a>.`,
      "  Füge IMMER hinzu: „Sobald Sie dort die Anfrage absenden, erhalten Sie die passenden Anleitungen automatisch mitgeschickt.“",
      `- Podest: nenne, dass der Preis von Größe/Konfiguration abhängt und verweise mit klickbarem Link: <a href="${LINKS.podest}" target="_blank" rel="noopener">Eingangspodest-System</a> + derselbe Hinweis zu den Anleitungen.`,
      "- Keine festen Endpreise erfinden; kurze Orientierung + Link ist Pflicht.",
    ].join("\n");

    const lastUser = [...messages].reverse().find(m => m?.role === "user")?.content?.toLowerCase() || "";
    const isPrice = /preis|preise|kosten|angebot|kalkulator|rechner|wie teuer|kostenrechner/.test(lastUser);
    const aboutRost = /(gitterrost|rost|rostsystem|aluline|blackline)/.test(lastUser);
    const aboutPod  = /(podest|eingangspodest|stufe|steg|treppe)/.test(lastUser);

    let extraRule = "";
    if (isPrice && aboutRost) {
      extraRule = "Dies ist eine Preisfrage zu Gitterrost – gib die Preisübersicht + HTML-Link wie angewiesen aus.";
    } else if (isPrice && aboutPod) {
      extraRule = "Dies ist eine Preisfrage zum Podest – gib die kurze Orientierung + HTML-Link wie angewiesen aus.";
    }

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
          ...(extraRule ? [{ role: "system", content: extraRule }] : []),
          ...messages
        ]
      })
    });

    if (!r.ok) return res.status(500).json({ reply: "OPENAI_ERROR: " + (await r.text()) });
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || "Keine Antwort erhalten.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ reply: "SERVER_ERROR: " + (err?.message || String(err)) });
  }
};
