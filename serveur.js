// On garde dotenv mais on sécurise son chargement au cas où Node gère déjà les variables d'environnement
try {
  require("dotenv").config();
} catch (e) {
  console.log("Dotenv n'est pas utilisé ou Node gère déjà les variables d'environnement.");
}

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

app.post("/chat", async (req, res) => {
  try {
    const { history } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      return res.status(500).json({ reply: "Erreur de configuration : Clé API introuvable." });
    }

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ reply: "Erreur : L'historique de discussion est invalide." });
    }

    // Configurer la réponse HTTP pour le Streaming (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Appel à OpenRouter avec l'option "stream: true"
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openrouter/free", 
          messages: history,
          stream: true // <-- L'option magique pour activer le streaming d'OpenRouter
        })
      }
    );

    // Lecture du flux de données provenant d'OpenRouter
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      
      // On garde la dernière ligne incomplète dans le buffer
      buffer = lines.pop(); 

      for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine) continue;
        if (cleanedLine === "data: [DONE]") {
          res.write("data: [DONE]\n\n");
          continue;
        }

        if (cleanedLine.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(cleanedLine.replace(/^data: /, ""));
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              // Envoi direct du morceau de texte à index.html
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // Ligne ignorée si ce n'est pas du JSON valide (métadonnées d'OpenRouter)
          }
        }
      }
    }

    res.end();

  } catch (error) {
    console.error("Erreur critique sur le serveur :", error);
    // En cas d'erreur au milieu du stream, on ferme proprement le flux
    res.write(`data: ${JSON.stringify({ error: "Erreur serveur interne" })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
