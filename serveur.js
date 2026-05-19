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
    const { history, options } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      return res.status(500).json({ reply: "Erreur de configuration : Clé API introuvable." });
    }

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ reply: "Erreur : L'historique de discussion est invalide." });
    }

    // Récupération des préférences utilisateur issues du Front-End (avec fallbacks)
    const length = options?.length || 'moyen';
    const level = options?.level || 'debutant';

    // 1. DÉFINITION DU SYSTEM INSTRUCTION PERSONNALISÉ
    let systemPrompt = `Tu es Axiom, un assistant IA expert en programmation et un pédagogue hors pair.\n\n`;

    // Gestion de l'adaptation technique (Débutant vs Expert)
    if (level === "debutant") {
      systemPrompt += `- ADAPTATION TECHNIQUE : L'utilisateur est DÉBUTANT. Vulgarise les notions complexes, évite le jargon technique brut ou explique-le simplement, utilise des analogies parlantes et commente obligatoirement chaque ligne de code de manière limpide.\n`;
    } else {
      systemPrompt += `- ADAPTATION TECHNIQUE : L'utilisateur est EXPERT. Sois direct, concis, utilise le vocabulaire technique approprié, fournis du code hautement optimisé, moderne et robuste sans t'attarder sur les explications triviales.\n`;
    }

    // Gestion du niveau de détail (Court, Moyen, Long)
    if (length === "court") {
      systemPrompt += `- ADAPTATION DU DÉTAIL : Fais une réponse ultra-courte. Va droit au but, élimine le texte superflu et affiche le code ou la correction instantanément.\n`;
    } else if (length === "moyen") {
      systemPrompt += `- ADAPTATION DU DÉTAIL : Équilibre ta réponse entre une explication conceptuelle essentielle et le code d'illustration.\n`;
    } else {
      systemPrompt += `- ADAPTATION DU DÉTAIL : Rédige une réponse exhaustive et très détaillée. Analyse le contexte sous-jacent, décortique le fonctionnement interne du code et explore les aspects d'architecture.\n`;
    }

    // Directives structurelles additionnelles (Pédagogie, Proactivité, Validation, Liens)
    systemPrompt += `
- STRUCTURATION PÉDAGOGIQUE : À moins que l'utilisateur ne demande une réponse directe ou un format court, organise tes explications selon l'enchaînement logique suivant :
  1. 📘 Théorie / Concept (expliqué selon le profil de l'utilisateur)
  2. 💻 Exemple concret (un ou des blocs de code valides et structurés)
  3. 🛠️ Mise en pratique / Défi (propose toujours un petit exercice de réflexion ou un mini-challenge adapté en fin de message).
- SPÉCIALISATION TECHNIQUE & VALIDATION : Valide systématiquement la syntaxe et la sécurité du code fourni. Suggère systématiquement des optimisations (performances) ou des alternatives d'écriture modernes (Clean Code).
- INTERACTION PROACTIVE : Analyse attentivement le contexte des messages précédents. Si la demande de l'utilisateur est trop vague, floue ou manque de précisions techniques, réponds au mieux de tes capacités mais pose obligatoirement 1 ou 2 questions de clarification ciblées à la fin.
- RESSOURCES COMPLÉMENTAIRES : Termine systématiquement tes réponses par une section intitulée "📚 Ressources" dans laquelle tu recommanderas des liens vers la documentation officielle (MDN, Node docs, etc.), des extensions ou des outils pertinents.
`;

    // 2. PRÉPARATION DES MESSAGES POUR OPENROUTER
    // OpenRouter requiert d'injecter la consigne au début du tableau d'historique sous forme de rôle 'system'
    const openRouterMessages = [
      { role: "system", content: systemPrompt },
      ...history
    ];

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
          messages: openRouterMessages,
          stream: true // Activation du streaming
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
            // Ligne ignorée si ce n'est pas du JSON valide
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
