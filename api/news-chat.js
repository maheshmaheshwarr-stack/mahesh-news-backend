// api/news-chat.js
export default async function handler(req, res) {
  // Basic CORS so your GitHub Pages site can call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const { question, articles } = req.body || {};
    if (!question || !Array.isArray(articles)) {
      return res.status(400).json({
        error: "Body must include 'question' (string) and 'articles' (array)",
      });
    }

    // Trim to avoid huge prompts
    const limitedArticles = articles.slice(0, 15).map((a, idx) => ({
      index: idx,
      title: a.title || "",
      description: a.description || "",
      category: a.category || "",
      source: a.source || "",
      url: a.url || "",
    }));

    const userPrompt = `
You are a calm, concise news assistant.

You receive:
- A list of recent news articles (title, brief description, category, source, URL)
- A question from the user

Your job:
1. Answer ONLY using information that could reasonably come from these articles.
2. If the user asks something outside these articles, say briefly that you only know about "today's feed" shown on the page.
3. Be clear and structured. Prefer short bullet points (3–6 bullets) or a short paragraph.
4. If relevant, mention source names (like "Indian Express", "TechCrunch") in a natural way.
5. If the question is broad (e.g., "What are today's highlights?"), summarise key themes in 3–5 bullets.
6. If articles show both positive and negative aspects, keep a balanced and non-alarming tone.

User question:
"${question}"

Articles context (array of objects):
${JSON.stringify(limitedArticles, null, 2)}
    `.trim();

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a calm, structured assistant for summarising a news feed. Keep answers short and grounded in the provided articles.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const txt = await openaiRes.text();
      console.error("OpenAI chat error:", openaiRes.status, txt);
      return res
        .status(500)
        .json({ error: "OpenAI API error", status: openaiRes.status });
    }

    const data = await openaiRes.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || "";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("Error in /api/news-chat:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
