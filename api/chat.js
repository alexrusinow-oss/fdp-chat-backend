// api/chat.js — Routing für Preise, gezielte Antworten aus kb.json, Fallback zu OpenAI

// ---- 1) Wissensbasis laden ----
const KB = require("./kb.json");

// ---- 2) Hilfsfunktionen ----
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

function isPriceIntent(text = "") {
  return /preis|preise|kosten|angebot|kalkulator|rechner|wie teuer|kostenrechner/i.test(text);
}
function mentionsRost(text = "") {
  return /(gitterrost|rost(?:system)?|aluline|blackline|rostsystem)/i.test(text);
}
function mentionsPodest(text = "") {
  return /(podest|eingangspodest|stufe|steg|treppe)/i.test(text);
}

function findInstructionNote() {
  const n = KB.find((e) => e.id === "montagehinweis-anleitungen");
  return (
    n?.text ||
    "Sobald Sie dort die Anfrage absenden, erhalten Sie die passenden Anleitungen automatisch mitgeschickt."
  );
}

// simple Scoring: Tags-Treffer + leichter Bonus für Wortüberlappung
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
    .filter((x) => x.score > 0.5) // kleiner Schwellwert, damit nur Relevantes kommt
    .map((x) => x.s);
}

// ---- 3) HTTP-Handler ----
module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
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
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { messages = [] } = body;

    const lastUserMsg =
      [...messages].reverse().find((m) => m && m.role === "user")?.content || "";

    // ---- 3a) Spezielle Preis-Logik mit klickbaren Links (HTML) ----
    if (isPriceIntent(lastUserMsg) && mentionsRost(lastUserMsg)) {
      const note = findInstructionNote();
      const html =
        `Kurzüberblick Gitterrost-Preise:<br>` +
        `• ${PRICE_HINTS.rostKurz}<br><br>` +
        `<a href="${LINKS.gitterrost}" target="_blank" rel="noopener">Gitterrostkostenrechner öffnen</a><br><br>` +
        `${note}`;
      return res.status(200).json({ reply: html });
    }
    if (isPriceIntent(lastUserMsg) && mentionsPodest(lastUserMsg)) {
      const note = findInstructionNote();
      const html =
        `Kurzüberblick Podest-Preise:<br>` +
        `• ${PRICE_HINTS.podestKurz}<br><br>` +
        `<a href="${LINKS.podest}" target="_blank" rel="noopener">Eingangspodest-System öffnen</a><br><br>` +
        `${note}`;
      return res.status(200).json({ reply: html });
    }

    // ---- 3b) Gezielte Antworten aus kb.json (Montage/Vorarbeiten etc.) ----
    const topSnippets = getTopKbSnippets(lastUserMsg, 3);
    if (topSnippets.length) {
      // Baue eine prägnante Antwort aus den besten Snippets
      const html =
        topSnippets.map((s) => s.text).join("<br><br>") +
        `<br><br><small>${findInstructionNote()}</small>`;
      return res.status(200).json({ reply: html });
    }

    // ---- 3c) Fallback: OpenAI (kurz, deutsch, Links als HTML) ----
    const systemPrompt = [
      "Du bist der AI-Assistent von Fertighaus-Designprodukte. Antworte kurz, freundlich und präzise auf Deutsch.",
      "Wenn du Links ausgibst, verwende reines HTML mit <a href=\"…\" target=\"_blank\" rel=\"noopener\">…</a> und <br> für Zeilenumbrüche. Kein Markdown.",
      `Bei Preisfragen zu Gitterrost: Kurzüberblick nennen (${PRICE_HINTS.rostKurz}) und Link "<a href='${LINKS.gitterrost}' target='_blank' rel='noopener'>Gitterrostkostenrechner öffnen</a>" + Hinweis: "${findInstructionNote()}".`,
      `Bei Preisfragen zu Podest: Kurzüberblick nennen (${PRICE_HINTS.podestKurz}) und Link "<a href='${LINKS.podest}' target='_blank' rel='noopener'>Eingangspodest-System öffnen</a>" + Hinweis: "${findInstructionNote()}".`,
      "Erfinde keine konkreten Endpreise. Wenn du etwas nicht weißt, sag das ehrlich und biete Kontakt an.",
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
