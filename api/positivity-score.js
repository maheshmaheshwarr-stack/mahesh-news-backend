// api/positivity-score.js
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

    const { articles } = req.body || {};
    if (!Array.isArray(articles) || articles.length === 0) {
      return res
        .status(400)
        .json({ error: "Body must include non-empty 'articles' array" });
    }

    // Limit for cost & latency
    const limitedArticles = articles.slice(0, 40);

    const inputForModel = limitedArticles.map((a, i) => ({
      index: i,
      title: a.title || "",
      description: a.description || "",
      content: a.content || "",
      category: a.category || "",
      source: a.source || "",
      sourceKey: a.sourceKey || "",
    }));

    const userPrompt = `
You are an assistant that scores news stories for *positive impact*.

For each article, return a number between -5 and 5:
- 5  = very positive, uplifting, constructive impact
- 2  = somewhat positive / progress / solutions
- 0  = neutral / purely informational
- -2 = somewhat negative, but not panic-level
- -5 = strongly negative, fear-inducing, about harm, conflict, disaster

Guidelines:
- Penalize stories about death, violence, war, scams, corruption, layoffs, disasters.
- Reward stories about innovation, solutions, people being helped, sustainability, collaboration.
- Politics is allowed, but only score it positive if it clearly improves people's lives in a tangible way.

Return ONLY valid JSON of the form:
{ "scores": [s0, s1, s2, ...] }

Where scores[i] is the score for articles[i].

Here are the articles (array of objects):
${JSON.stringify(inputForModel, null, 2)}
    `.trim();

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a careful, structured assistant that returns ONLY valid JSON.",
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
      console.error("OpenAI error:", openaiRes.status, txt);
      return res
        .status(500)
        .json({ error: "OpenAI API error", status: openaiRes.status });
    }

    const data = await openaiRes.json();
    const rawContent = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      console.error("Failed to parse AI JSON:", e, rawContent);
      return res.status(500).json({ error: "AI response parsing failed" });
    }

    if (!parsed || !Array.isArray(parsed.scores)) {
      return res.status(500).json({ error: "AI did not return scores[]" });
    }

    // Ensure we return one score per article we sent (fill missing with 0)
    const scores = limitedArticles.map((_, i) => {
      const v = parsed.scores[i];
      return typeof v === "number" ? v : 0;
    });

    return res.status(200).json({ scores });
  } catch (err) {
    console.error("Error in /api/positivity-score:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
