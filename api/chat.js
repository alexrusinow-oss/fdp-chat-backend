export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { messages = [] } = req.body;

  const KB = {
    company: "Fertighaus-Designprodukte GmbH",
    products: {
      gitterrost: {
        PRO: { price_lfm: 330, spec: "Tiefe 30 cm + Laibung, Aufbauhöhe 2,5 cm, Länge bis 2,5 m (optional 3,5 m), Tiefe in ±5,3 cm, RAL-Pulver." },
        BASIC: { price_lfm: 200, spec: "Fixe Längen 1/1,5/2/2,5 m, Tiefe 30 cm, Aufbauhöhe 2,5 cm; keine Sonderzuschnitte/Gehrungen/Laibung." }
      },
      blackline: { price_lfm: 149, spec: "Konsole für 6/8 cm Randstein, höhenverstellbar, Antirutschmatte & Schaumstoffband, Bohrversion inkl. Dübel/Schrauben, ~1 cm Aufbau, schwarz matt." }
    }
  };

  const systemPrompt = [
    "Du bist der Website-Assistent von Fertighaus-Designprodukte.",
    "Antworten freundlich, präzise, in DE.",
    "Nutze zuerst die KB:",
    JSON.stringify(KB)
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    return res.status(500).json({ reply: "Fehler: " + txt });
  }

  const data = await response.json();
  const reply = data?.output_text || "Keine Antwort erhalten.";
  res.status(200).json({ reply });
}
