// api/chat.js  — Minimal-Serverless-Function (ohne Build, ohne extra Pakete)
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST allowed" });
    }

    // Body sicher parsen (Vercel liefert evtl. schon Objekt)
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { messages = [] } = body;

    // --- Deine Kurz-KB (kannst du später erweitern) ---
    const KB = {
      company: "Fertighaus-Designprodukte GmbH",
      contact: "info@fertighaus-designprodukte.de, +49 6458 4869988",
      products: {
        gitterrost: {
          PRO: {
            price_lfm: 330,
            spec: "Tiefe 30 cm + Laibung, Aufbauhöhe 2,5 cm, Länge bis 2,5 m (optional 3,5 m), Tiefe in ±5,3 cm, RAL-Pulver."
          },
          BASIC: {
            price_lfm: 200,
            spec: "Fixe Längen 1/1,5/2/2,5 m, Tiefe 30 cm, Aufbauhöhe 2,5 cm; keine Sonderzuschnitte/Gehrungen/Laibung."
          },
          blackline: {
            price_lfm: 149,
            spec: "Konsole für 6/8 cm Randstein, höhenverstellbar, Antirutschmatte & Schaumstoffband, Bohrversion inkl. Dübel/Schrauben, ~1 cm Aufbau, schwarz matt."
          },
          lead: "Ø EFH ~8 lfm; Produktion 20–30 Werktage (Mo–Fr)."
        }
        // TODO: Eingangspodest-Daten ergänzen
      }
    };

    const systemPrompt = [
      "Du bist der Website-Assistent von Fertighaus-Designprodukte.",
      "Antworte präzise, freundlich, in DE.",
      "Nutze zuerst die bereitgestellte KB. Fehlt etwas: 'Preis/Details auf Anfrage' + Kontakt anbieten.",
      `KB: ${JSON.stringify(KB)}`
    ].join("\n");

    // OpenAI Responses API aufrufen (ohne SDK, via fetch)
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.3
      })
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ reply: "Fehler vom Modell: " + txt });
    }

    const data = await r.json();
    const reply =
      data?.output_text ||
      data?.response_text ||
      data?.choices?.[0]?.message?.content ||
      "Keine Antwort erhalten.";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ reply: "Serverfehler: " + (err?.message || String(err)) });
  }
};
