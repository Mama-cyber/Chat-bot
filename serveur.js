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
// IMPORTANT : On laisse la limite à 50mb pour accepter les gros volumes de texte/images sans planter
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

app.post("/chat", async (req, res) => {
  try {
    const { history } = req.body; // <-- On récupère tout l'historique de discussion envoyé par index.html
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      console.error("[ERREUR] La clé OPENROUTER_API_KEY est introuvable ou vide.");
      return res.json({ 
        reply: "Erreur de configuration : La clé API n'a pas pu être chargée par le serveur. Vérifiez votre configuration Render." 
      });
    }

    if (!history || !Array.isArray(history)) {
      return res.json({ 
        reply: "Erreur : L'historique de discussion transmis est invalide ou absent." 
      });
    }

    // Appel à l'API d'OpenRouter
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          // Choix automatique parmi les modèles gratuits d'OpenRouter
          model: "openrouter/free", 
          messages: history // <-- On injecte tout le tableau pour que l'IA se souvienne du contexte !
        })
      }
    );

    // Récupération du texte brut pour éviter un crash si la réponse n'est pas du JSON
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
    
    // Si la structure de réponse d'OpenRouter est valide, on renvoie le message
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return res.json({ 
        reply: data.choices[0].message.content 
      });
    } 
    
    // Si OpenRouter nous renvoie une erreur explicite
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

// Lancement du serveur sur le port fourni par Render ou 3000 par défaut
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
