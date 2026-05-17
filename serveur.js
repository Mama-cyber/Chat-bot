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
app.use(express.json());
app.use(express.static("public"));

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const apiKey = process.env.OPENROUTER_API_KEY;

    // Vérification de sécurité locale avant d'interroger OpenRouter
    if (!apiKey || apiKey.trim() === "") {
      console.error("[ERREUR] La clé OPENROUTER_API_KEY est introuvable ou vide.");
      return res.json({
        reply: "Erreur de configuration : La clé API n'a pas pu être chargée par le serveur. Vérifiez votre fichier .env."
      });
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
          model: "openrouter/free", // <-- Met automatiquement une IA gratuite disponible
          messages: [
            {
              role: "user",
              content: userMessage
            }
          ]
        })
      }
    );

    // On récupère le texte brut de la réponse pour éviter un crash si OpenRouter renvoie du texte/HTML au lieu du JSON
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
    
    // Log complet dans le terminal pour voir ce qui bloque
    console.log("=== RÉPONSE DE OPENROUTER ===");
    console.log(JSON.stringify(data, null, 2));
    console.log("=============================");

    // Structure valide
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return res.json({
        reply: data.choices[0].message.content
      });
    } 
    
    // Si OpenRouter a renvoyé une erreur claire
    if (data && data.error) {
      return res.json({
        reply: `Erreur API OpenRouter : ${data.error.message || JSON.stringify(data.error)}`
      });
    }

    // Cas de secours si la réponse est vide ou bizarre
    return res.json({
      reply: "L'API a répondu, mais n'a retourné aucun message. Vérifiez le terminal de votre serveur."
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