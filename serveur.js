try {
  require("dotenv").config();
} catch (e) {
  console.log("Dotenv n'est pas utilisé ou Node gère déjà les variables d'environnement.");
}

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
// On augmente la taille maximale autorisée pour les requêtes (important pour les images en Base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.static("public"));

app.post("/chat", async (req, res) => {
  try {
    const { message, fileData } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      return res.json({
        reply: "Erreur de configuration : La clé API n'a pas pu être chargée."
      });
    }

    // On prépare le contenu du message pour l'IA
    let contentStructure = [];

    // Si l'utilisateur a envoyé un fichier ou une image
    if (fileData) {
      if (fileData.type.startsWith("image/")) {
        // Structure requise par OpenRouter/Vision pour les images
        contentStructure.push({
          type: "text",
          text: message || "Analyse cette image."
        });
        contentStructure.push({
          type: "image_url",
          image_url: {
            url: fileData.base64 // Contient l'image encodée en data:image/...;base64,...
          }
        });
      } else {
        // Si c'est un fichier texte/document, on l'injecte dans le contexte textuel
        contentStructure = `Voici le contenu du fichier attaché (${fileData.name}) :\n---\n${fileData.text}\n---\n\nQuestion de l'utilisateur : ${message}`;
      }
    } else {
      // Message classique en texte brut
      contentStructure = message;
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          // Attention : openrouter/free ne gère pas toujours les images. 
          // gpt-4o-mini ou google/gemini-2.5-flash sont parfaits pour la vision.
          model: "openrouter/free", 
          messages: [
            {
              role: "user",
              content: contentStructure
            }
          ]
        })
      }
    );

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      return res.json({ reply: "Désolé, la réponse de l'API est illisible." });
    }

    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return res.json({ reply: data.choices[0].message.content });
    } 
    
    if (data && data.error) {
      return res.json({ reply: `Erreur API OpenRouter : ${data.error.message}` });
    }

    return res.json({ reply: "L'API n'a retourné aucun message." });

  } catch (error) {
    console.error("Erreur critique :", error);
    return res.status(500).json({ error: "Erreur serveur interne" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
