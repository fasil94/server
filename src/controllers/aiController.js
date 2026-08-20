function parseJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned);
}

export async function generateTask(req, res) {
  const prompt = String(req.body?.prompt || "").trim();

  if (!prompt) {
    return res.status(400).json({ message: "Please describe what you want to accomplish." });
  }

  const rawApiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "";
  const apiKey = rawApiKey.trim();

  if (!apiKey) {
    return res.status(503).json({
      message: "AI is not configured yet. Add GEMINI_API_KEY to backend/.env and restart the backend."
    });
  }

  // የሞዴሉን ስም ወደ "gemini-1.5-flash-latest" ቀይረነዋል
  const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + apiKey;

  try {
    const systemInstruction = 
      "You are TaskFlow AI, a task planning assistant. " +
      "Turn the user's goal into one practical task. " +
      "Return ONLY valid JSON with exactly these keys: " +
      "title (string), description (string), priority (Low|Medium|High), " +
      "estimatedHours (number), subtasks (array of 3-6 strings).";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemInstruction + "\n\nUser Goal: " + prompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status >= 400 && response.status < 500 ? 400 : 502).json({
        message: data?.error?.message || "AI request failed."
      });
    }

    const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const result = parseJson(outputText);

    const priority = ["Low", "Medium", "High"].includes(result.priority)
      ? result.priority
      : "Medium";

    const estimatedHours = Number.isFinite(Number(result.estimatedHours))
      ? Number(result.estimatedHours)
      : 1;

    const subtasks = Array.isArray(result.subtasks)
      ? result.subtasks.filter(Boolean).slice(0, 6).map(String)
      : [];

    res.json({
      title: String(result.title || prompt).slice(0, 120),
      description: String(result.description || "").slice(0, 1000),
      priority,
      estimatedHours,
      subtasks
    });
  } catch (error) {
    console.error("AI generation error:", error);
    res.status(502).json({
      message: "Could not generate an AI task. Check your API key/model and try again."
    });
  }
}