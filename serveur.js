try {
  require("dotenv").config();
} catch (e) {
  console.log("Dotenv n'est pas utilisé ou Node gère déjà les variables d'environnement.");
}

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
// On augmente la taille maximale pour accepter les fichiers et images lourdes
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

app.post("/chat", async (req, res) => {
  try {
    const { message, fileData } = req.body; // <-- Récupération du message ET du fichier joint
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      return res.json({
        reply: "Erreur de configuration : La clé API n'a pas pu être chargée par le serveur."
      });
    }

    // Construction de la structure de contexte pour l'IA
    let contentStructure;

    if (fileData) {
      if (fileData.type.startsWith("image/")) {
        // Format spécifique pour l'analyse d'images (Vision)
        contentStructure = [
          { type: "text", text: message || "Analyse cette image." },
          { type: "image_url", image_url: { url: fileData.base64 } }
        ];
      } else {
        // Format pour l'analyse de fichiers documents / textes
        contentStructure = `Voici le contenu du fichier joint (${fileData.name}) :\n---\n${fileData.text}\n---\n\nQuestion de l'utilisateur : ${message}`;
      }
    } else {
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
          // Utilisation de Gemini 2.5 Flash : gère la vision, les gros fichiers et offre un contexte géant !
          model: "google/gemini-2.5-flash", 
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
      return res.json({
        reply: "Désolé, l'API OpenRouter a renvoyé une réponse illisible."
      });
    }
    
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return res.json({
        reply: data.choices[0].message.content
      });
    } 
    
    if (data && data.error) {
      return res.json({
        reply: `Erreur API OpenRouter : ${data.error.message || JSON.stringify(data.error)}`
      });
    }

    return res.json({
      reply: "L'API a répondu, mais n'a retourné aucun message."
    });

  } catch (error) {
    console.error("Erreur critique sur le serveur :", error);
    return res.status(500).json({
      error: "Erreur serveur interne"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
