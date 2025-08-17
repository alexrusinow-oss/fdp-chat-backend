// api/chat.js — Preise + KB + „nochmal?“-Flow ohne Doppel-Hinweise

const KB = require("./kb.json");

const LINKS = {
  gitterrost: "https://www.fertighaus-designprodukte.de/gitterrostkostenrechner",
  podest: "https://www.fertighaus-designprodukte.de/eingangspodest-system",
};

const PRICE_HINTS = {
  rostKurz:
    "Orientierung: PRO ab 330 €/lfm, BASIC ab 200 €/lfm, Blackline-Konsole 149 €/lfm (je nach Ausführung).",
  podestKurz:
    "Die Podestkosten hängen von Größe und Konfiguration ab (Modulanzahl, Breite/Tiefe, Ausführung).",
};

const NOTE =
  "Sobald Sie dort die Anfrage absenden, erhalten Sie die passenden Montageanleitungen automatisch mitgeschickt.";

// ---------- Helper ----------
function isPriceIntent(t = "") {
  return /preis|preise|kosten|angebot|kalkulator|rechner|wie teuer|kostenrechner/i.test(t);
}
function mentionsRost(t = "") {
  return /(gitterrost|rost(?:system)?|aluline|blackline|rostsystem)/i.test(t);
}
function mentionsPodest(t = "") {
  return /(podest|eingangspodest|stufe|steg|treppe)/i.test(t);
}
function hasNote(messages = []) {
  const needle = "passenden montageanleitungen automatisch mitgeschickt";
  return messages.some(
    (m) => m?.role === "assistant" && (m.content || "").toLowerCase().includes(needle)
  );
}

// „nochmal/erneut/wiederholen“ erkannt?
function isRepeatRequest(text = "") {
  return /(nochmal|erneut|wiederholen|wieder|repeat|noch einmal)/i.test(text);
}
// „ja“ erkannt?
function isAffirmative(text = "") {
  return /^(ja|gerne|bitte|okay|ok|mach mal|ja bitte)\b/i.test(text.trim());
}

// Letzte/zweite letzte Assistant-Nachrichten
function getLastAssistant(messages = []) {
  return [...messages].reverse().find((m) => m?.role === "assistant")?.content || "";
}
function getSecondLastAssistant(messages = []) {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") {
      count++;
      if (count === 2) return messages[i]?.content || "";
    }
  }
  return "";
}

// KB scoring
function scoreSnippet(snippet, query) {
  const q = (query || "").toLowerCase();
  const tagHits = (snippet.tags || []).reduce((s, t) => s + (q.includes(t.toLowerCase()) ? 1 : 0), 0);
  const bonus = snippet.text
    .toLowerCase()
    .split(/\W+/)
    .slice(0, 25)
    .reduce((s, w) => s + (w && q.includes(w) ? 0.05 : 0), 0);
  return tagHits + bonus;
}
function getTopKbSnippets(query, max = 3) {
  return KB.map((s) => ({ s, score: scoreSnippet(s, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .filter((x) => x.score > 0.5)
    .map((x) => x.s);
}

module.exports = async (req, res) => {
  // CORS – bei Bedarf auf deine Domain einschränken
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY)
      return res.status(500).json({ reply: "SERVER_ERROR: OPENAI_API_KEY fehlt im Vercel Projekt." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { messages = [] } = body;

    const lastUserMsg =
      [...messages].reverse().find((m) => m && m.role === "user")?.content || "";

    const lastAssistant = getLastAssistant(messages);
    const secondLastAssistant = getSecondLastAssistant(messages);
    const lastAssistantWasRepeatPrompt = /<!--REPEAT_PROMPT-->/.test(lastAssistant);

    // ---------- REPEAT FLOW ----------
    // Fall 1: Nutzer sagt „ja“, nachdem wir ihn eben gefragt haben, ob wir erneut senden sollen
    if (isAffirmative(lastUserMsg) && lastAssistantWasRepeatPrompt && secondLastAssistant) {
      const html = `Alles klar – hier ist die Erklärung nochmals:<br><br>${secondLastAssistant}`;
      return res.status(200).json({ reply: html });
    }

    // Fall 2: Nutzer fragt „nochmal/erneut/wieder“ (oder sehr ähnlich) -> freundlich erinnern + Rückfrage
    if (isRepeatRequest(lastUserMsg) && lastAssistant) {
      const html =
        `Ich habe das eben oben beantwortet. Soll ich die Erklärung nochmal komplett senden? ` +
        `Antworten Sie einfach mit „ja“. <!--REPEAT_PROMPT-->`;
      return res.status(200).json({ reply: html });
    }

    // ---------- A) Preis-Routing (Hinweis max. 1x pro Verlauf) ----------
    if (isPriceIntent(lastUserMsg) && mentionsRost(lastUserMsg)) {
      const extra = hasNote(messages) ? "" : `<br><br>${NOTE}`;
      const html =
        `Kurzüberblick Gitterrost-Preise:<br>` +
        `• ${PRICE_HINTS.rostKurz}<br><br>` +
        `<a href="${LINKS.gitterrost}" target="_blank" rel="noopener">Gitterrostkostenrechner öffnen</a>` +
        extra;
      return res.status(200).json({ reply: html });
    }
    if (isPriceIntent(lastUserMsg) && mentionsPodest(lastUserMsg)) {
      const extra = hasNote(messages) ? "" : `<br><br>${NOTE}`;
      const html =
        `Kurzüberblick Podest-Preise:<br>` +
        `• ${PRICE_HINTS.podestKurz}<br><br>` +
        `<a href="${LINKS.podest}" target="_blank" rel="noopener">Eingangspodest-System öffnen</a>` +
        extra;
      return res.status(200).json({ reply: html });
    }

    // ---------- B) Gezielte Antworten aus KB (ohne Hinweis) ----------
    const topSnippets = getTopKbSnippets(lastUserMsg, 3);
    if (topSnippets.length) {
      const html = topSnippets.map((s) => s.text).join("<br><br>");
      return res.status(200).json({ reply: html });
    }

    // ---------- C) Fallback: OpenAI (kurz, deutsch, HTML-Links erlaubt) ----------
    const systemPrompt = [
      "Du bist der AI-Assistent von Fertighaus-Designprodukte. Antworte kurz, freundlich und präzise auf Deutsch.",
      "Wenn du Links ausgibst, verwende reines HTML mit <a href=\"…\" target=\"_blank\" rel=\"noopener\">…</a> und <br> für Zeilenumbrüche. Kein Markdown.",
      "Erfinde keine konkreten Endpreise. Wenn du etwas nicht weißt, sag das ehrlich und biete Kontakt an."
    ].join("\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
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
