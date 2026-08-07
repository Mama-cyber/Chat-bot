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
    // CORRECTION CRITIQUE : On récupère "history" ET "options" envoyés par le fichier HTML
    const { history, options } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      return res.status(500).json({ reply: "Erreur de configuration : Clé API introuvable." });
    }

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ reply: "Erreur : L'historique de discussion est invalide." });
    }

    // Extraction des choix de l'utilisateur (avec valeurs par défaut de secours)
    const length = options?.length || 'court';
    const level = options?.level || 'debutant';

    // CONSTRUCTION DU PROMPT SYSTEME DYNAMIQUE EN FONCTION DE TES CLICS
    let systemPrompt = `Tu es Axiom, un assistant IA expert en programmation et un pédagogue hors pair.\n\n`;

    // 1. Force l'IA à changer son vocabulaire selon le niveau choisi
    if (level === "debutant") {
      systemPrompt += `[CONSIGNE CRITIQUE - NIVEAU DÉBUTANT] :\n`;
      systemPrompt += `- L'utilisateur est un grand débutant en programmation.\n`;
      systemPrompt += `- Vulgarise absolument TOUT. N'utilise aucun jargon complexe sans l'expliquer.\n`;
      systemPrompt += `- Fais des analogies simples avec la vie de tous les jours.\n`;
      systemPrompt += `- AJOUTE OBLIGATOIREMENT DES COMMENTAIRES SIMPLES SUR CHAQUE LIGNE DE CODE pour expliquer son rôle.\n\n`;
    } else {
      systemPrompt += `[CONSIGNE CRITIQUE - NIVEAU EXPERT] :\n`;
      systemPrompt += `- L'utilisateur est un développeur chevronné de haut niveau.\n`;
      systemPrompt += `- Sois direct, technique, précis et va droit au but.\n`;
      systemPrompt += `- Fournis du code ultra-optimisé, moderne (ES6+, clean code), sécurisé et robuste.\n`;
      systemPrompt += `- Ne perds pas de temps avec des explications de base (pas besoin d'expliquer ce qu'est une boucle ou une variable).\n\n`;
    }

    // 2. Force l'IA à couper ou étendre sa réponse selon la taille choisie
    if (length === "court") {
      systemPrompt += `[CONSIGNE CRITIQUE - FORMAT COURT] :\n`;
      systemPrompt += `- Ta réponse doit être extrêmement concise et faire moins de 5 à 10 lignes.\n`;
      systemPrompt += `- Supprime les salutations, les introductions et les conclusions.\n`;
      systemPrompt += `- Donne directement le code corrigé ou la réponse brute sans tourner autour du pot.\n\n`;
    } else if (length === "moyen") {
      systemPrompt += `[CONSIGNE CRITIQUE - FORMAT MOYEN] :\n`;
      systemPrompt += `- Fais une réponse équilibrée.\n`;
      systemPrompt += `- Une explication rapide du concept de quelques lignes, suivie du bloc de code nécessaire.\n\n`;
    } else {
      systemPrompt += `[CONSIGNE CRITIQUE - FORMAT LONG] :\n`;
      systemPrompt += `- Rédige une réponse exhaustive, encyclopédique et très détaillée.\n`;
      systemPrompt += `- Analyse le contexte global, explique le fonctionnement interne de la machine ou du langage, et liste les pièges courants à éviter.\n\n`;
    }

    // 3. Intégration des autres fonctionnalités pédagogiques de ta feuille de route
    systemPrompt += `
[DIRECTIVES COMPLÉMENTAIRES SYSTÉMATIQUES] :
- CONVERSATION NATURELLE : Si l'utilisateur dit simplement bonjour, prend de tes nouvelles ou fait une remarque générale sans demander de code, réponds de façon humaine, chaleureuse et naturelle, SANS forcer de structure technique (pas de théorie ni de défi dans ce cas).
- STRUCTURATION (uniquement pour le code) : Si l'utilisateur pose une vraie question technique ou demande de l'aide en programmation, organise ta réponse avec des sections claires : 📘 Théorie, 💻 Exemple, et termine par "🛠️ Défi du jour" adapté au niveau.
- RESSOURCES : N'ajoute la section "📚 Ressources" que lorsqu'un véritable sujet technique a été abordé.
`;

    // PREPARATION DU PAQUET AVEC LA REGLE SYSTEME EN PREMIER
    const openRouterMessages = [
      { role: "system", content: systemPrompt },
      ...history
    ];

    // Configurer la réponse HTTP pour le Streaming (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Appel à OpenRouter
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
          stream: true 
        })
      }
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
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
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }

    res.end();

  } catch (error) {
    console.error("Erreur critique sur le serveur :", error);
    res.write(`data: ${JSON.stringify({ error: "Erreur serveur interne" })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
