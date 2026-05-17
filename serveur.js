// On garde dotenv mais on sécurise son chargement au cas où Node injecte déjà le .env
try {
  require("dotenv").config();
} catch (e) {
  console.log("Dotenv n'est pas utilisé ou Node gère déjà les variables d'environnement.");
}

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
// IMPORTANT : On laisse la limite à 50mb pour que le serveur accepte les gros volumes de texte/images
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

app.post("/chat", async (req, res) => {
  try {
    // Récupération du message et du fichier envoyé par index.html
    const { message, fileData } = req.body; 
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      console.error("[ERREUR] La clé OPENROUTER_API_KEY est introuvable ou vide.");
      return res.json({
        reply: "Erreur de configuration : La clé API n'a pas pu être chargée par le serveur. Vérifiez votre configuration Render."
      });
    }

    // Construction du contexte pour l'IA
    let contentStructure;

    if (fileData) {
      if (fileData.type && fileData.type.startsWith("image/")) {
        // Format pour l'analyse d'images (Vision)
        contentStructure = [
          { type: "text", text: message || "Analyse cette image." },
          { type: "image_url", image_url: { url: fileData.base64 } }
        ];
      } else {
        // Format pour les documents (PPTX, PDF, TXT convertis en texte nettoyé)
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
          // RETOUR AU CHOIX AUTOMATIQUE GRATUIT :
          // OpenRouter choisira le meilleur modèle gratuit disponible à l'instant T.
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
      console.error("Impossible de parser la réponse en JSON. Reçu :", responseText);
      return res.json({
        reply: "Désolé, l'API OpenRouter a renvoyé une réponse illisible."
      });
    }
    
    // Structure de réponse valide
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return res.json({
        reply: data.choices[0].message.content
      });
    } 
    
    // Si OpenRouter renvoie une erreur
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
