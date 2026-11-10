
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/") {
      return jsonResponse({ message: "Study Hub Worker is running." });
    }

    if (url.pathname !== "/ask") {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST for this endpoint." }, 405);
    }

    try {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";

      const { success } = await env.RATE_LIMITER.limit({
        key: ip,
      });

      if (!success) {
        return jsonResponse({
          error: "Too many requests. Please wait a minute and try again."
        }, 429);
      }

      const rawBody = await request.text();

      if (rawBody.length > 8000) {
        return jsonResponse({ error: "Request is too large." }, 413);
      }

      let data;

      try {
        data = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ error: "Invalid JSON." }, 400);
      }

      const subject = String(data.subject || "").trim();
      const topic = String(data.topic || "").trim();
      const difficulty = String(data.difficulty || "medium").trim();
      const question = String(data.question || "").trim();

      if (!subject || !topic) {
        return jsonResponse({
          error: "Please provide a subject and topic."
        }, 400);
      }

      if (
        subject.length > 60 ||
        topic.length > 150 ||
        question.length > 2000
      ) {
        return jsonResponse({ error: "One of the fields is too long." }, 400);
      }

      const prompt = `
You are Study Hub, a helpful educational assistant.
Help a secondary-school student understand their studies.
Explain clearly, step by step, and use simple examples.
Do not invent facts. If unsure, say so.

Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}
Student's question: ${question || "Explain this topic and give a short practice question."}
`;

      const result = await env.AI.run(
        "@cf/zai-org/glm-4.7-flash",
        {
          messages: [
            {
              role: "system",
              content: "You are a patient and accurate study tutor."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_completion_tokens: 500
        }
      );

      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({
        error: "The study assistant could not complete that request. Please try again."
      }, 500);
    }
  },
};
