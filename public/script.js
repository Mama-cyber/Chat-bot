let selectedFile = null;
let allChats = JSON.parse(localStorage.getItem("axiom_chats")) || {};
let currentChatId = null;
let isGenerating = false;
let currentAbortController = null;

window.onload = function () {
  renderSidebar();
  initTextareaAutoResize();
  if (Object.keys(allChats).length > 0) {
    const sortedIds = Object.keys(allChats).sort(
      (a, b) => allChats[b].updatedAt - allChats[a].updatedAt,
    );
    loadChat(sortedIds[0]);
  } else {
    startNewChat();
  }
};

function initTextareaAutoResize() {
  const textarea = document.getElementById("user-input");

  textarea.addEventListener("input", function () {
    this.style.height = "42px";
    this.style.height = this.scrollHeight + "px";
  });

  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleActionClick();
    }
  });
}

function resetTextareaHeight() {
  const textarea = document.getElementById("user-input");
  textarea.style.height = "42px";
}

document.addEventListener("click", function (event) {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menu-toggle");

    if (
      sidebar.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      sidebar.classList.remove("open");
    }
  }
});

function renderSidebar() {
  const listContainer = document.getElementById("history-list");
  listContainer.innerHTML = "";

  const sortedIds = Object.keys(allChats).sort(
    (a, b) => allChats[b].updatedAt - allChats[a].updatedAt,
  );

  sortedIds.forEach((id) => {
    const item = document.createElement("div");
    item.className = `history-item ${id === currentChatId ? "active" : ""}`;

    const textSpan = document.createElement("span");
    textSpan.className = "history-item-text";
    textSpan.innerHTML = `<i class="fas fa-comment-alt"></i> ${allChats[id].title}`;
    textSpan.onclick = () => {
      if (isGenerating) return;
      loadChat(id);
      if (window.innerWidth <= 768) {
        document.getElementById("sidebar").classList.remove("open");
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-chat-btn";
    deleteBtn.innerHTML = `<i class="fas fa-trash-alt"></i>`;
    deleteBtn.title = "Supprimer cette discussion";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (isGenerating) return;
      deleteChat(id);
    };

    item.appendChild(textSpan);
    item.appendChild(deleteBtn);
    listContainer.appendChild(item);
  });
}

function startNewChat() {
  if (isGenerating) return;

  // 1. On cherche s'il existe déjà une discussion vide qui s'appelle "Nouvelle discussion"
  const existingNewChatId = Object.keys(allChats).find(
    (id) => allChats[id].title === "Nouvelle discussion",
  );

  if (existingNewChatId) {
    // Si elle existe déjà et qu'on est déjà dessus, on ne fait rien
    if (currentChatId === existingNewChatId) {
      // On ferme juste la sidebar sur mobile au cas où
      if (window.innerWidth <= 768) {
        document.getElementById("sidebar").classList.remove("open");
      }
      return;
    }

    // Si elle existe mais qu'on n'est pas dessus, on y emmène l'utilisateur
    loadChat(existingNewChatId);
    if (window.innerWidth <= 768) {
      document.getElementById("sidebar").classList.remove("open");
    }
    return;
  }

  // 2. Si aucune "Nouvelle discussion" n'existe, on la crée normalement
  currentChatId = "chat_" + Date.now();
  allChats[currentChatId] = {
    title: "Nouvelle discussion",
    history: [
      {
        role: "assistant",
        content: "Bonjour, comment puis-je vous aider aujourd'hui ?",
        feedback: null,
      },
    ],
    updatedAt: Date.now(),
  };
  saveToStorage();
  loadChat(currentChatId);

  // Ferme la barre latérale sur mobile après la création
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar").classList.remove("open");
  }
}

function loadChat(id) {
  currentChatId = id;
  renderSidebar();

  const chatContainer = document.getElementById("chat-container");
  chatContainer.innerHTML = "";

  allChats[id].history.forEach((msg, index) => {
    let msgElement;
    if (msg.role === "user" && Array.isArray(msg.content)) {
      msgElement = displayMessage("user", msg.content[0].text, true);
    } else if (
      msg.role === "user" &&
      msg.content.includes("Voici le contenu du fichier joint")
    ) {
      const extraction =
        msg.content.split("\n\nQuestion : ")[1] || "Analyse de document";
      msgElement = displayMessage(
        "user",
        `[Document joint] ${extraction}`,
        true,
      );
    } else {
      msgElement = displayMessage(msg.role, msg.content, true);
    }

    if (msg.role === "assistant") {
      addBotActions(msgElement, msg.content, index, msg.feedback);
    } else if (msg.role === "user") {
      let rawText =
        typeof msg.content === "string"
          ? msg.content
          : msg.content[0]?.text || "";
      if (rawText.includes("Voici le contenu du fichier joint")) {
        rawText = rawText.split("\n\nQuestion : ")[1] || rawText;
      }
      addUserActions(msgElement, rawText, index);
    }
  });
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function deleteChat(id) {
  if (confirm("Voulez-vous vraiment supprimer cette discussion ?")) {
    delete allChats[id];
    saveToStorage();

    if (currentChatId === id) {
      const remainingIds = Object.keys(allChats);
      if (remainingIds.length > 0) {
        const nextChatId = remainingIds.sort(
          (a, b) => allChats[b].updatedAt - allChats[a].updatedAt,
        )[0];
        loadChat(nextChatId);
      } else {
        startNewChat();
      }
    } else {
      renderSidebar();
    }
  }
}

function saveToStorage() {
  localStorage.setItem("axiom_chats", JSON.stringify(allChats));
}

function toggleSidebar(event) {
  if (event) event.stopPropagation();
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle("open");
  } else {
    sidebar.classList.toggle("closed");
  }
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  selectedFile = { name: file.name, type: file.type };
  const reader = new FileReader();
  const previewContainer = document.getElementById("preview-container");
  const previewContent = document.getElementById("preview-content");

  if (file.type.startsWith("image/")) {
    reader.onload = function (e) {
      selectedFile.base64 = e.target.result;
      previewContent.innerHTML = `<img src="${e.target.result}"> <span>${file.name}</span>`;
      previewContainer.style.setProperty("display", "flex", "important");
    };
    reader.readAsDataURL(file);
  } else {
    reader.onload = function (e) {
      let rawText = e.target.result;
      let cleanText = rawText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      cleanText = cleanText.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      cleanText = cleanText.replace(/<[^>]+>/g, " ");
      cleanText = cleanText.replace(
        /[^a-zA-Z0-9àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\s.,!?;:()'\-""\n]/g,
        " ",
      );
      cleanText = cleanText.replace(/\s+/g, " ").trim();

      if (cleanText.length > 80000) {
        cleanText =
          cleanText.substring(0, 80000) + "... [Texte extrait et condensé]";
      }

      selectedFile.text = cleanText;
      previewContent.innerHTML = `<i class="fas fa-file-alt"></i> <span>${file.name}</span>`;
      previewContainer.style.setProperty("display", "flex", "important");
    };
    reader.readAsText(file);
  }
}

function clearFile() {
  selectedFile = null;
  document.getElementById("file-input").value = "";
  document
    .getElementById("preview-container")
    .style.setProperty("display", "none", "important");
}

function copyText(button, textToCopy) {
  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      button.classList.add("copied");
      button.innerHTML = `<i class="fas fa-check"></i>`;
      setTimeout(() => {
        button.classList.remove("copied");
        button.innerHTML = `<i class="fas fa-copy"></i>`;
      }, 2000);
    })
    .catch((err) => {
      console.error(err);
    });
}

// Transforme tous les <pre><code> générés par marked en blocs Snapcode (header + dots)
// pour éviter que les longs blocs de code débordent de la bulle du bot.
//
// Options :
//   - applyHighlight=false : on ne colorie pas le code (utilisé pendant le
//     streaming pour ne pas ralentir chaque token). On recoloriera à la fin.
//   - applyHighlight=true  : on colorie via highlight.js (Atom One Dark),
//     comme dans VSCode. À n'appeler qu'une fois la génération complète.
function enhanceCodeBlocks(container, applyHighlight = false) {
  if (!container) return;
  // Sélecteur limité à la zone passée en argument pour ne pas toucher au reste du DOM
  const pres = container.querySelectorAll("pre");
  pres.forEach((pre) => {
    // Si déjà transformé, on ne fait rien (idempotent)
    if (pre.closest(".code-container")) {
      // Si on a déjà wrapé mais qu'on nous demande la coloration maintenant
      if (applyHighlight && window.hljs) {
        const innerCode = pre.closest(".code-container").querySelector("code");
        if (innerCode && !innerCode.dataset.highlighted) {
          try {
            window.hljs.highlightElement(innerCode);
          } catch (e) {
            console.warn("hljs échec sur un bloc déjà wrapé :", e);
          }
        }
      }
      return;
    }

    // On s'assure qu'aucun <pre> nu n'échappe à la limitation de largeur
    pre.style.maxWidth = "100%";

    // Récupération du <code> interne et de la langue
    const codeEl = pre.querySelector("code") || pre;
    let lang = "";
    const className = codeEl.className || "";
    const langMatch = className.match(/language-([\w-]+)/i);
    if (langMatch) {
      lang = langMatch[1];
    } else if (pre.dataset && pre.dataset.language) {
      lang = pre.dataset.language;
    }

    // Lecture du texte brut (résistante si le DOM a été mal fermé pendant le streaming)
    const rawText = codeEl.textContent || codeEl.innerText || "";

    // Création de la coquille Snapcode
    const wrapper = document.createElement("div");
    wrapper.className = "code-container";

    const header = document.createElement("div");
    header.className = "code-header";

    const buttons = document.createElement("div");
    buttons.className = "code-buttons";
    buttons.innerHTML =
      '<span class="code-dot red"></span><span class="code-dot yellow"></span><span class="code-dot green"></span>';

    const langLabel = document.createElement("span");
    langLabel.className = "code-lang";
    langLabel.textContent = lang ? lang : "code";

    header.appendChild(buttons);
    header.appendChild(langLabel);

    // On reconstruit un <pre><code> propre à partir du texte brut
    const newPre = document.createElement("pre");
    const newCode = document.createElement("code");
    if (lang) newCode.className = `language-${lang}`;
    newCode.textContent = rawText;
    newPre.appendChild(newCode);

    wrapper.appendChild(header);
    wrapper.appendChild(newPre);

    // Remplacement du <pre> d'origine par le bloc Snapcode
    pre.replaceWith(wrapper);

    // Coloration syntaxique à la demande (uniquement en fin de streaming
    // pour ne pas pénaliser chaque token). highlight.js lit la classe
    // "language-xxx" sur le <code> et dépose ses propres <span> à
    // l'intérieur, ce qui colore le code façon VSCode.
    if (applyHighlight && window.hljs) {
      try {
        window.hljs.highlightElement(newCode);
      } catch (e) {
        console.warn("hljs échec :", e);
      }
    }
  });
}

function displayMessage(role, text, isHistoryLoad = false) {
  const chatContainer = document.getElementById("chat-container");
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}-message`;

  if (role === "user") {
    msgDiv.innerHTML = `
    <div class="message-text-content"><i class="fas fa-user me-1"></i> <span class="render-zone"></span></div>
  `;
    msgDiv.querySelector(".render-zone").textContent = text;
  } else {
    msgDiv.innerHTML = `
    <div class="message-text-content"><i class="fas fa-robot me-1"></i> <span class="render-zone"></span></div>
  `;
    const content = msgDiv.querySelector(".render-zone");
    content.innerHTML = `<div class="bot-message-content">${marked.parse(text)}</div>`;
    // Transforme les <pre> en blocs Snapcode (avec header, dots et overflow caché)
    // + coloration syntaxique type VSCode via highlight.js
    enhanceCodeBlocks(content.querySelector(".bot-message-content"), true);
  }

  chatContainer.appendChild(msgDiv);
  if (!isHistoryLoad) chatContainer.scrollTop = chatContainer.scrollHeight;
  return msgDiv;
}

function addUserActions(msgDiv, text, historyIndex) {
  if (msgDiv.querySelector(".user-actions")) return;

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "user-actions";

  actionsDiv.innerHTML = `
    <button class="action-btn copy-user-btn" title="Copier le prompt"><i class="fas fa-copy"></i></button>
    <button class="action-btn edit-user-btn" title="Modifier directement dans la bulle"><i class="fas fa-pen"></i></button>
    <button class="action-btn share-user-btn" title="Partager"><i class="fas fa-share-alt"></i></button>
  `;

  const copyBtn = actionsDiv.querySelector(".copy-user-btn");
  const editBtn = actionsDiv.querySelector(".edit-user-btn");
  const shareBtn = actionsDiv.querySelector(".share-user-btn");

  copyBtn.onclick = function () {
    copyText(this, text);
  };

  editBtn.onclick = function () {
    if (isGenerating) return;

    const renderZone = msgDiv.querySelector(".render-zone");
    const inlineTextarea = document.createElement("textarea");
    inlineTextarea.className = "inline-edit-textarea";
    inlineTextarea.value = text;

    renderZone.innerHTML = "";
    renderZone.appendChild(inlineTextarea);
    inlineTextarea.focus();

    inlineTextarea.style.height = inlineTextarea.scrollHeight + "px";
    inlineTextarea.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = this.scrollHeight + "px";
    });

    actionsDiv.innerHTML = `
      <button class="action-btn save-inline-btn" style="opacity:1; color:#fff; font-weight:600;" title="Valider et régénérer">
        <i class="fas fa-check me-1"></i> Envoyer
      </button>
      <button class="action-btn cancel-inline-btn" style="opacity:0.6; color:#fff;" title="Annuler">
        Annuler
      </button>
    `;

    const triggerSave = () => {
      const newPromptText = inlineTextarea.value.trim();
      if (!newPromptText) return;
      executePromptRegeneration(newPromptText, historyIndex);
    };

    inlineTextarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        triggerSave();
      }
    });

    actionsDiv.querySelector(".save-inline-btn").onclick = triggerSave;
    actionsDiv.querySelector(".cancel-inline-btn").onclick = () => {
      loadChat(currentChatId);
    };
  };

  shareBtn.onclick = function () {
    if (navigator.share) {
      navigator
        .share({
          title: "Prompt Axiom",
          text: text,
        })
        .catch((err) => console.log(err));
    } else {
      navigator.clipboard.writeText(text).then(() => {
        shareBtn.innerHTML = `<i class="fas fa-check"></i>`;
        alert("Prompt copié dans le presse-papiers !");
        setTimeout(() => {
          shareBtn.innerHTML = `<i class="fas fa-share-alt"></i>`;
        }, 2000);
      });
    }
  };

  msgDiv.appendChild(actionsDiv);
}

function addBotActions(msgDiv, text, index, currentFeedback = null) {
  if (msgDiv.querySelector(".bot-actions")) return;

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "bot-actions";

  actionsDiv.innerHTML = `
  <button class="action-btn copy-bot-btn" title="Copier la réponse"><i class="fas fa-copy"></i></button>
  <button class="action-btn like-btn" title="Bon raisonnement"><i class="far fa-thumbs-up"></i></button>
  <button class="action-btn dislike-btn" title="Mauvais raisonnement"><i class="far fa-thumbs-down"></i></button>
  <button class="action-btn share-btn" title="Partager"><i class="fas fa-share-alt"></i></button>
`;

  const copyBtn = actionsDiv.querySelector(".copy-bot-btn");
  const likeBtn = actionsDiv.querySelector(".like-btn");
  const dislikeBtn = actionsDiv.querySelector(".dislike-btn");
  const shareBtn = actionsDiv.querySelector(".share-btn");

  updateFeedbackUI(likeBtn, dislikeBtn, currentFeedback);

  copyBtn.onclick = function () {
    copyText(this, text);
  };

  likeBtn.onclick = function () {
    const currentChat = allChats[currentChatId];
    if (!currentChat || !currentChat.history[index]) return;
    const isLiked = currentChat.history[index].feedback === "like";
    currentChat.history[index].feedback = isLiked ? null : "like";
    saveToStorage();
    updateFeedbackUI(likeBtn, dislikeBtn, currentChat.history[index].feedback);
  };

  dislikeBtn.onclick = function () {
    const currentChat = allChats[currentChatId];
    if (!currentChat || !currentChat.history[index]) return;
    const isDisliked = currentChat.history[index].feedback === "dislike";
    currentChat.history[index].feedback = isDisliked ? null : "dislike";
    saveToStorage();
    updateFeedbackUI(likeBtn, dislikeBtn, currentChat.history[index].feedback);
  };

  shareBtn.onclick = function () {
    if (navigator.share) {
      navigator
        .share({
          title: "Réponse Axiom",
          text: text,
        })
        .catch((err) => console.log(err));
    } else {
      navigator.clipboard.writeText(text).then(() => {
        shareBtn.innerHTML = `<i class="fas fa-check"></i>`;
        alert("La réponse a été copiée dans votre presse-papiers !");
        setTimeout(() => {
          shareBtn.innerHTML = `<i class="fas fa-share-alt"></i>`;
        }, 2000);
      });
    }
  };

  msgDiv.appendChild(actionsDiv);
}

function updateFeedbackUI(likeBtn, dislikeBtn, feedback) {
  if (feedback === "like") {
    likeBtn.className = "action-btn like-btn active";
    likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i>';
    dislikeBtn.className = "action-btn dislike-btn";
    dislikeBtn.innerHTML = '<i class="far fa-thumbs-down"></i>';
  } else if (feedback === "dislike") {
    dislikeBtn.className = "action-btn dislike-btn active";
    dislikeBtn.innerHTML = '<i class="fas fa-thumbs-down"></i>';
    likeBtn.className = "action-btn like-btn";
    likeBtn.innerHTML = '<i class="far fa-thumbs-up"></i>';
  } else {
    likeBtn.className = "action-btn like-btn";
    likeBtn.innerHTML = '<i class="far fa-thumbs-up"></i>';
    dislikeBtn.className = "action-btn dislike-btn";
    dislikeBtn.innerHTML = '<i class="far fa-thumbs-down"></i>';
  }
}

function handleActionClick() {
  if (isGenerating) {
    stopGeneration();
  } else {
    sendMessage();
  }
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

async function sendMessage() {
  const input = document.getElementById("user-input");
  const messageText = input.value.trim();
  if (!messageText && !selectedFile) return;
  executePromptRegeneration(messageText, null);
}

async function executePromptRegeneration(
  messageText,
  targetHistoryIndex = null,
) {
  const chatContainer = document.getElementById("chat-container");
  const buttonIcon = document.getElementById("button-icon");

  const lengthOption = document.getElementById("option-length").value;
  const levelOption = document.getElementById("option-level").value;

  isGenerating = true;
  buttonIcon.className = "fas fa-stop";

  let contentStructure;

  if (targetHistoryIndex !== null) {
    let currentHistory = allChats[currentChatId].history;
    let originalItem = currentHistory[targetHistoryIndex];

    if (
      typeof originalItem.content === "object" &&
      Array.isArray(originalItem.content)
    ) {
      contentStructure = [...originalItem.content];
      contentStructure[0].text = messageText;
    } else if (
      typeof originalItem.content === "string" &&
      originalItem.content.includes("Voici le contenu du fichier joint")
    ) {
      const parts = originalItem.content.split("\n\nQuestion : ");
      contentStructure = `${parts[0]}\n\nQuestion : ${messageText}`;
    } else {
      contentStructure = messageText;
    }

    currentHistory[targetHistoryIndex] = {
      role: "user",
      content: contentStructure,
    };
    allChats[currentChatId].history = currentHistory.slice(
      0,
      targetHistoryIndex + 1,
    );
    loadChat(currentChatId);
  } else {
    if (allChats[currentChatId].title === "Nouvelle discussion") {
      allChats[currentChatId].title = messageText
        ? messageText.substring(0, 24) + "..."
        : "Analyse de fichier";
    }

    let viewText = messageText;
    if (selectedFile) {
      viewText =
        (selectedFile.type.startsWith("image/")
          ? `[Image: ${selectedFile.name}] `
          : `[Document: ${selectedFile.name}] `) + viewText;
    }

    const userMsgDiv = displayMessage("user", viewText);

    if (selectedFile) {
      if (selectedFile.type.startsWith("image/")) {
        contentStructure = [
          { type: "text", text: messageText || "Analyse cette image." },
          { type: "image_url", image_url: { url: selectedFile.base64 } },
        ];
      } else {
        contentStructure = `Voici le contenu du fichier joint (${selectedFile.name}) :\n---\n${selectedFile.text}\n---\n\nQuestion : ${messageText}`;
      }
    } else {
      contentStructure = messageText;
    }

    allChats[currentChatId].history.push({
      role: "user",
      content: contentStructure,
    });
    addUserActions(
      userMsgDiv,
      messageText || viewText,
      allChats[currentChatId].history.length - 1,
    );

    clearFile();
    document.getElementById("user-input").value = "";
    resetTextareaHeight();
  }

  allChats[currentChatId].updatedAt = Date.now();
  saveToStorage();
  renderSidebar();

  const botMessage = document.createElement("div");
  botMessage.className = "message bot-message";

  // MODIFICATION ICI : Remplacement de l'icône FontAwesome par la div .wave-spinner
  botMessage.innerHTML = `
    <div class="message-text-content">
      <i class="fas fa-robot me-1"></i><span class="render-zone"><div class="wave-spinner"></div> Axiom calcule la suite...</span>
    </div>
  `;
  chatContainer.appendChild(botMessage);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const renderZone = botMessage.querySelector(".render-zone");
  let fullResponseText = "";

  // Debounce du re-render pendant le streaming : on évite de tout reconstruire
  // à chaque token (lissage visuel + protection contre les états intermédiaires
  // de marked qui pourraient faire sortir un <pre> transitoire de la bulle).
  // ⚠️ Pendant le streaming on ne colorie PAS (applyHighlight=false) : c'est trop
  // coûteux de reparser tout le code via highlight.js à chaque token. La
  // coloration est appliquée UNE SEULE fois dans flushRender() à la fin.
  let renderTimer = null;
  const scheduleRender = () => {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      const contentEl = renderZone.querySelector(".bot-message-content");
      if (!contentEl) return;
      contentEl.innerHTML = marked.parse(fullResponseText);
      // Re-wrap en Snapcode SANS colorier (le code sera coloré en flushRender)
      enhanceCodeBlocks(contentEl, false);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 30);
  };
  // Flush immédiat : force un re-render sans attendre le debounce ET
  // applique la coloration syntaxique (on n'est plus en plein streaming,
  // le texte est complet → on peut payer le coût de highlight.js).
  const flushRender = () => {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }
    const contentEl = renderZone.querySelector(".bot-message-content");
    if (!contentEl) return;
    contentEl.innerHTML = marked.parse(fullResponseText);
    enhanceCodeBlocks(contentEl, true); // ⚡ coloration VSCode ici
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: allChats[currentChatId].history,
        options: { length: lengthOption, level: levelOption },
      }),
      signal: signal,
    });

    if (!response.ok) throw new Error("Erreur serveur");

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
        if (cleanedLine === "data: [DONE]") continue;

        if (cleanedLine.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(cleanedLine.replace(/^data: /, ""));

            if (parsed.error) {
              if (renderTimer) {
                clearTimeout(renderTimer);
                renderTimer = null;
              }
              renderZone.innerHTML = `<span style="color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> ${parsed.error}</span>`;
              botMessage.className = "message error-message";
              finalizeGenerationState();
              return;
            }

            if (parsed.content) {
              fullResponseText += parsed.content;
              // On (re)crée le wrapper .bot-message-content au tout premier token
              if (!renderZone.querySelector(".bot-message-content")) {
                renderZone.innerHTML = `<div class="bot-message-content"></div>`;
              }
              scheduleRender();
            }
          } catch (e) {}
        }
      }
    }
    // Dernier rendu garanti à la fin du flux (pour ne rien perdre du debounce)
    flushRender();
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Génération interrompue.");
      fullResponseText += " *[Réponse interrompue]*";
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      const contentEl = renderZone.querySelector(".bot-message-content");
      if (contentEl) {
        contentEl.innerHTML = marked.parse(fullResponseText);
        enhanceCodeBlocks(contentEl, true); // ⚡ coloration (le flux est terminé)
      } else {
        renderZone.innerHTML = `<div class="bot-message-content">${marked.parse(fullResponseText)}</div>`;
        enhanceCodeBlocks(
          renderZone.querySelector(".bot-message-content"),
          true,
        );
      }
    } else {
      console.error("Erreur de flux :", error);
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      renderZone.innerHTML = `<span style="color: var(--danger);"><i class="fas fa-wifi"></i> Erreur de flux.</span>`;
      botMessage.className = "message error-message";
    }
  } finally {
    if (fullResponseText.trim() !== "") {
      allChats[currentChatId].history.push({
        role: "assistant",
        content: fullResponseText,
        feedback: null,
      });
      const msgIndex = allChats[currentChatId].history.length - 1;
      allChats[currentChatId].updatedAt = Date.now();
      saveToStorage();
      addBotActions(botMessage, fullResponseText, msgIndex);
    }
    finalizeGenerationState();
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function finalizeGenerationState() {
  isGenerating = false;
  currentAbortController = null;
  document.getElementById("button-icon").className = "fas fa-paper-plane";
}
