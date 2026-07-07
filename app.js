(function () {
  const config = window.LOGO_VOTE_CONFIG || {};
  const pollId = config.pollId || "zaopianju-logo";
  const storagePrefix = `zpj-logo-vote:${pollId}`;
  const defaultMeaning =
    config.meaning ||
    "我们希望这个 Logo 能代表「AI 生成影像」和「照片创作」的结合，也能承载 AI 写真、修图、课程、作品展示和视觉变现平台的长期品牌感。";
  const isAdminMode = new URLSearchParams(window.location.search).get("admin") === "1";

  const elements = {
    title: document.querySelector("#page-title"),
    subtitle: document.querySelector("#page-subtitle"),
    intro: document.querySelector("#page-intro"),
    meaning: document.querySelector("#page-meaning"),
    adminPanel: document.querySelector("#admin-panel"),
    adminMeaningInput: document.querySelector("#admin-meaning-input"),
    saveMeaningButton: document.querySelector("#save-meaning-button"),
    resetMeaningButton: document.querySelector("#reset-meaning-button"),
    adminOptionsEditor: document.querySelector("#admin-options-editor"),
    saveOptionsButton: document.querySelector("#save-options-button"),
    addOptionButton: document.querySelector("#add-option-button"),
    resetOptionsButton: document.querySelector("#reset-options-button"),
    adminStatus: document.querySelector("#admin-status"),
    footerNote: document.querySelector("#footer-note"),
    totalVotes: document.querySelector("#total-votes"),
    optionsGrid: document.querySelector("#options-grid"),
    resultsPanel: document.querySelector("#results-panel"),
    resultsTotal: document.querySelector("#results-total"),
    resultsList: document.querySelector("#results-list"),
    toast: document.querySelector("#toast"),
    imageModal: document.querySelector("#image-modal"),
    imageModalImg: document.querySelector("#image-modal-img"),
    imageModalTitle: document.querySelector("#image-modal-title"),
  };

  const storage = createStorage();
  const meaningKey = `${storagePrefix}:meaning`;
  const optionsKey = `${storagePrefix}:options`;
  const adminCodeKey = `${storagePrefix}:adminCode`;
  const defaultOptions = normalizeOptions(config.options);
  let options = normalizeOptions(storage.getJson(optionsKey, defaultOptions));
  let activeStore = null;
  let unsubscribeCloud = null;
  let cloudFallbackMessage = "";
  let state = {
    votes: normalizeVotes(config.initialVotes),
    votedOption: storage.get(`${storagePrefix}:votedOption`) || "",
    isSubmitting: false,
    meaning: storage.get(meaningKey) || defaultMeaning,
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    setupImageModal();
    await ensureSupabaseLoaded();
    activeStore = createStore();

    try {
      await hydrateCloudPoll();
    } catch (error) {
      cloudFallbackMessage =
        "云端表还没初始化或暂时不可用，当前是本地预览；执行 Supabase SQL 后会自动切到云端同步。";
      activeStore = createLocalStore();
      showToast("云端暂时不可用，已切回本地预览");
    }

    setStaticCopy();
    setupAdminPanel();

    try {
      state.votes = await activeStore.getVotes();
    } catch (error) {
      activeStore = createLocalStore();
      state.votes = await activeStore.getVotes();
    }

    render();
    setupRealtimeSync();
  }

  function setStaticCopy() {
    elements.title.textContent = config.title || "造片局 Logo 投票";
    elements.subtitle.textContent = config.subtitle || "帮我们选出最适合 AI 摄影小程序的 Logo";
    elements.intro.textContent =
      config.intro ||
      "我们正在为『造片局』选择最终 Logo。它未来会用于小程序头像、首页、课程、作品展示和品牌传播。请你根据第一眼感受，选出你觉得最有记忆点、最适合 AI 摄影平台的那一个。";
    elements.meaning.textContent = state.meaning || defaultMeaning;
    elements.footerNote.textContent = config.footerNote || "没有标准答案，第一眼喜欢哪个就选哪个～";
  }

  function setupAdminPanel() {
    if (!elements.adminPanel) {
      return;
    }

    if (!isAdminMode) {
      elements.adminPanel.hidden = true;
      return;
    }

    elements.adminPanel.hidden = false;
    elements.adminPanel.classList.remove("is-hidden");
    elements.adminMeaningInput.value = state.meaning || defaultMeaning;
    renderAdminOptionsEditor();

    if (activeStore.isCloud) {
      setAdminStatus("当前为云端同步模式。保存后手机和电脑会同步更新。", { persist: true });
    } else if (cloudFallbackMessage) {
      setAdminStatus(cloudFallbackMessage, { persist: true });
    }

    elements.saveMeaningButton.addEventListener("click", async () => {
      const nextMeaning = elements.adminMeaningInput.value.trim() || defaultMeaning;
      state.meaning = nextMeaning;
      storage.set(meaningKey, nextMeaning);
      setStaticCopy();
      await syncPollContent("已保存开头寓意");
    });

    elements.resetMeaningButton.addEventListener("click", async () => {
      state.meaning = defaultMeaning;
      elements.adminMeaningInput.value = defaultMeaning;
      storage.remove(meaningKey);
      setStaticCopy();
      await syncPollContent("已恢复默认寓意");
    });

    elements.saveOptionsButton.addEventListener("click", async () => {
      await saveOptionsFromEditor();
    });

    elements.addOptionButton.addEventListener("click", async () => {
      await saveOptionsFromEditor({ quiet: true, skipSync: true });
      options.push(createNewOption());
      persistOptions();
      state.votes = normalizeVotes(state.votes);
      renderAdminOptionsEditor();
      render();
      await syncPollContent("已新增一个投票方案");
    });

    elements.resetOptionsButton.addEventListener("click", async () => {
      options = cloneOptions(defaultOptions);
      storage.remove(optionsKey);
      state.votes = normalizeVotes(config.initialVotes);
      renderAdminOptionsEditor();
      render();
      await syncPollContent("已恢复默认方案");
    });

    elements.adminOptionsEditor.addEventListener("change", (event) => {
      const input = event.target;

      if (!input.matches("[data-image-upload]")) {
        return;
      }

      handleImageUpload(input);
    });

    elements.adminOptionsEditor.addEventListener("click", async (event) => {
      const zoomButton = event.target.closest("[data-zoom-image]");

      if (zoomButton) {
        openImageModal(zoomButton.dataset.zoomImage, zoomButton.dataset.zoomTitle);
        return;
      }

      const removeButton = event.target.closest("[data-remove-option]");

      if (!removeButton) {
        return;
      }

      const optionId = removeButton.dataset.removeOption;

      if (options.length <= 1) {
        setAdminStatus("至少保留一个方案");
        return;
      }

      await saveOptionsFromEditor({ quiet: true, skipSync: true });
      options = options.filter((option) => option.id !== optionId);
      persistOptions();
      state.votes = normalizeVotes(state.votes);
      renderAdminOptionsEditor();
      render();
      await syncPollContent("已删除该方案");
    });
  }

  async function hydrateCloudPoll() {
    if (!activeStore.getPoll) {
      return;
    }

    const poll = await activeStore.getPoll();

    if (!poll) {
      return;
    }

    applyPollContent(poll);
  }

  function setupRealtimeSync() {
    if (!activeStore.subscribe) {
      return;
    }

    unsubscribeCloud = activeStore.subscribe({
      onPoll: (content) => {
        applyPollContent(content);
        setStaticCopy();

        if (isAdminMode) {
          elements.adminMeaningInput.value = state.meaning || defaultMeaning;
          renderAdminOptionsEditor();
        }

        render();
      },
      onVotes: async () => {
        state.votes = await activeStore.getVotes();
        render();
      },
    });
  }

  function applyPollContent(content) {
    if (!content || typeof content !== "object") {
      return;
    }

    if (typeof content.meaning === "string") {
      state.meaning = content.meaning;
      storage.set(meaningKey, content.meaning);
    }

    if (Array.isArray(content.options) && content.options.length) {
      options = normalizeOptions(content.options);
      persistOptions();
      state.votes = normalizeVotes(state.votes);
    }
  }

  function getPollContent() {
    return {
      meaning: state.meaning || defaultMeaning,
      options,
    };
  }

  async function syncPollContent(message) {
    persistOptions();
    storage.set(meaningKey, state.meaning || defaultMeaning);

    if (!activeStore.savePoll) {
      setAdminStatus(message);
      return;
    }

    const adminCode = getAdminCode();

    if (!adminCode) {
      setAdminStatus("本地已保存；未填写云端编辑码，暂未同步云端");
      return;
    }

    try {
      await activeStore.savePoll(getPollContent(), adminCode);
      setAdminStatus(`${message}，已同步云端`);
    } catch (error) {
      storage.remove(adminCodeKey);
      setAdminStatus("本地已保存；云端同步失败，请检查编辑码或是否已执行 Supabase SQL");
    }
  }

  function getAdminCode() {
    const existing = storage.get(adminCodeKey);

    if (existing) {
      return existing;
    }

    const code = window.prompt("请输入发起方云端编辑码");

    if (!code) {
      return "";
    }

    storage.set(adminCodeKey, code.trim());
    return code.trim();
  }

  function setupImageModal() {
    elements.optionsGrid.addEventListener("click", (event) => {
      const zoomButton = event.target.closest("[data-zoom-image]");

      if (!zoomButton) {
        return;
      }

      openImageModal(zoomButton.dataset.zoomImage, zoomButton.dataset.zoomTitle);
    });

    elements.imageModal.addEventListener("click", (event) => {
      if (!event.target.closest("[data-close-zoom]")) {
        return;
      }

      closeImageModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || elements.imageModal.hidden) {
        return;
      }

      closeImageModal();
    });
  }

  function openImageModal(imageUrl, title) {
    if (!imageUrl) {
      return;
    }

    elements.imageModalImg.src = imageUrl;
    elements.imageModalImg.alt = `${title || "Logo"} 放大预览`;
    elements.imageModalTitle.textContent = title || "图片预览";
    elements.imageModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeImageModal() {
    elements.imageModal.hidden = true;
    elements.imageModalImg.removeAttribute("src");
    document.body.classList.remove("modal-open");
  }

  function render() {
    const total = sumVotes(state.votes);
    elements.totalVotes.textContent = String(total);
    elements.resultsTotal.textContent = `${total} 票`;
    renderCards(total);
    renderResults(total);
  }

  function renderCards(total) {
    elements.optionsGrid.innerHTML = options
      .map((option) => {
        const count = state.votes[option.id] || 0;
        const percent = getPercent(count, total);
        const isSelected = state.votedOption === option.id;
        const hasVoted = Boolean(state.votedOption);
        const buttonText = isSelected ? "已投票" : hasVoted ? "投票已完成" : "投它一票";
        const keywords = Array.isArray(option.keywords) ? option.keywords : [];

        return `
          <article class="option-card${isSelected ? " is-selected" : ""}">
            <div class="option-heading">
              <h2>${escapeHtml(option.name)}</h2>
              ${isSelected ? '<span class="selected-badge">你的选择</span>' : ""}
            </div>
            <figure class="logo-frame">
              <img src="${escapeAttribute(option.image)}" alt="${escapeAttribute(option.name)} Logo" loading="lazy" />
              <button class="zoom-button" type="button" data-zoom-image="${escapeAttribute(option.image)}" data-zoom-title="${escapeAttribute(
          option.name
        )}">点击放大</button>
            </figure>
            <div class="keyword-row" aria-label="${escapeAttribute(option.name)} 关键词">
              ${keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}
            </div>
            <div class="card-result${hasVoted ? "" : " is-hidden"}" aria-label="${escapeAttribute(option.name)} 当前结果">
              <div class="result-meta">
                <span>${count} 票</span>
                <strong>${percent}%</strong>
              </div>
              <div class="progress-track" aria-hidden="true">
                <span style="width: ${percent}%"></span>
              </div>
            </div>
            <button class="vote-button" type="button" data-option-id="${escapeAttribute(option.id)}" ${
          hasVoted || state.isSubmitting ? "disabled" : ""
        }>${buttonText}</button>
          </article>
        `;
      })
      .join("");

    elements.optionsGrid.querySelectorAll("[data-option-id]").forEach((button) => {
      button.addEventListener("click", () => submitVote(button.dataset.optionId));
    });
  }

  function renderResults(total) {
    elements.resultsList.innerHTML = options
      .map((option) => {
        const count = state.votes[option.id] || 0;
        const percent = getPercent(count, total);

        return `
          <div class="result-row">
            <div class="result-row-title">
              <span>${escapeHtml(option.name)}</span>
              <strong>${count} 票 · ${percent}%</strong>
            </div>
            <div class="progress-track" aria-hidden="true">
              <span style="width: ${percent}%"></span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderAdminOptionsEditor() {
    if (!elements.adminOptionsEditor) {
      return;
    }

    elements.adminOptionsEditor.innerHTML = options
      .map((option, index) => {
        return `
          <article class="admin-option-editor" data-option-editor="${escapeAttribute(option.id)}">
            <div class="admin-option-top">
              <div>
                <strong>${escapeHtml(option.name || `方案 ${index + 1}`)}</strong>
                <span>ID：${escapeHtml(option.id)}</span>
              </div>
              <button class="admin-remove-button" type="button" data-remove-option="${escapeAttribute(option.id)}">删除</button>
            </div>
            <div class="admin-option-body">
              <div class="admin-preview-wrap">
                <img class="admin-option-preview" src="${escapeAttribute(option.image)}" alt="${escapeAttribute(option.name)} 预览" />
                <button class="zoom-button admin-zoom-button" type="button" data-zoom-image="${escapeAttribute(
                  option.image
                )}" data-zoom-title="${escapeAttribute(option.name)}">点击放大</button>
              </div>
              <div class="admin-fields">
                <label>
                  方案名称
                  <input type="text" data-option-name="${escapeAttribute(option.id)}" value="${escapeAttribute(option.name)}" />
                </label>
                <label>
                  关键词，用顿号或逗号分隔
                  <input type="text" data-option-keywords="${escapeAttribute(option.id)}" value="${escapeAttribute(
          option.keywords.join("、")
        )}" />
                </label>
                <label>
                  Logo 图片
                  <input type="file" data-image-upload="${escapeAttribute(option.id)}" accept="image/*" />
                </label>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function saveOptionsFromEditor(settings) {
    const quiet = settings && settings.quiet;
    const skipSync = settings && settings.skipSync;

    if (!elements.adminOptionsEditor) {
      return;
    }

    const nextOptions = options.map((option, index) => {
      const nameInput = elements.adminOptionsEditor.querySelector(`[data-option-name="${cssEscape(option.id)}"]`);
      const keywordsInput = elements.adminOptionsEditor.querySelector(`[data-option-keywords="${cssEscape(option.id)}"]`);
      const name = nameInput ? nameInput.value.trim() : "";
      const keywords = keywordsInput ? parseKeywords(keywordsInput.value) : [];

      return {
        ...option,
        name: name || `方案 ${index + 1}`,
        keywords: keywords.length ? keywords : ["待填写"],
      };
    });

    options = normalizeOptions(nextOptions);
    persistOptions();
    state.votes = normalizeVotes(state.votes);
    renderAdminOptionsEditor();
    render();

    if (!skipSync) {
      await syncPollContent("已保存方案设置");
    } else if (!quiet) {
      setAdminStatus("已保存方案设置");
    }
  }

  async function handleImageUpload(input) {
    const optionId = input.dataset.imageUpload;
    const file = input.files && input.files[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAdminStatus("请选择图片文件");
      return;
    }

    await saveOptionsFromEditor({ quiet: true, skipSync: true });
    setAdminStatus(activeStore.uploadImage ? "正在上传图片到云端..." : "正在处理图片...");

    try {
      const imageUrl = activeStore.uploadImage
        ? await activeStore.uploadImage(file, optionId)
        : await fileToCompressedDataUrl(file);
      options = options.map((option) =>
        option.id === optionId
          ? {
              ...option,
              image: imageUrl,
            }
          : option
      );
      persistOptions();
      renderAdminOptionsEditor();
      render();
      await syncPollContent(activeStore.uploadImage ? "图片已上传并保存" : "图片已保存到当前浏览器预览");
    } catch (error) {
      setAdminStatus("图片处理失败，请换一张图片试试");
    }
  }

  async function submitVote(optionId) {
    if (!options.some((option) => option.id === optionId)) {
      return;
    }

    if (state.votedOption) {
      showToast("你已经投过票啦～");
      return;
    }

    state.isSubmitting = true;
    render();

    try {
      const nextVotes = await activeStore.submitVote(optionId);
      state.votes = normalizeVotes(nextVotes);
      state.votedOption = optionId;
      storage.set(`${storagePrefix}:votedOption`, optionId);
      elements.resultsPanel.open = true;
      showToast("投票成功，感谢你的建议～");
    } catch (error) {
      showToast("投票暂时没有成功，请稍后再试");
    } finally {
      state.isSubmitting = false;
      render();
    }
  }

  function createStore() {
    const supabaseStore = createSupabaseStore();

    if (supabaseStore) {
      return supabaseStore;
    }

    if (config.mode === "api" && config.apiBaseUrl) {
      return createApiStore();
    }

    return createLocalStore();
  }

  function createLocalStore() {
    const votesKey = `${storagePrefix}:votes`;

    return {
      async getVotes() {
        return normalizeVotes(storage.getJson(votesKey, config.initialVotes));
      },

      async submitVote(optionId) {
        const votedOption = storage.get(`${storagePrefix}:votedOption`);

        if (votedOption) {
          return normalizeVotes(storage.getJson(votesKey, config.initialVotes));
        }

        const votes = normalizeVotes(storage.getJson(votesKey, config.initialVotes));
        votes[optionId] = (votes[optionId] || 0) + 1;
        storage.setJson(votesKey, votes);
        return votes;
      },
    };
  }

  function createApiStore() {
    const baseUrl = config.apiBaseUrl.replace(/\/$/, "");
    const voterKey = getVoterKey();

    return {
      async getVotes() {
        const response = await fetch(`${baseUrl}/votes?pollId=${encodeURIComponent(pollId)}`, {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch votes");
        }

        const payload = await response.json();
        return normalizeVotes(payload.votes || payload);
      },

      async submitVote(optionId) {
        const response = await fetch(`${baseUrl}/votes`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pollId, optionId, voterKey }),
        });

        if (!response.ok) {
          throw new Error("Failed to submit vote");
        }

        const payload = await response.json();
        return normalizeVotes(payload.votes || payload);
      },
    };
  }

  function createSupabaseStore() {
    if (config.mode !== "supabase") {
      return null;
    }

    const cloudConfig = window.ZPJ_LOGO_SUPABASE || {
      url: "https://cxkvxfnfznmzbkhehoyn.supabase.co",
      publishableKey: "sb_publishable_0nFBoh5uxzExWPF3RmEUiA_jjggfYG6",
    };
    const publicKey = cloudConfig.publishableKey || cloudConfig.anonKey;

    if (!cloudConfig.url || !publicKey || cloudConfig.url.includes("YOUR_") || publicKey.includes("YOUR_")) {
      return null;
    }

    if (!window.supabase?.createClient) {
      return null;
    }

    const client = window.supabase.createClient(cloudConfig.url, publicKey);
    const voterKey = getVoterKey();
    const bucketName = cloudConfig.bucket || "logo-vote-images";

    return {
      isCloud: true,

      async getPoll() {
        const { data, error } = await client
          .from("logo_vote_polls")
          .select("content")
          .eq("id", pollId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        return data?.content || null;
      },

      async savePoll(content, adminCode) {
        const { data, error } = await client.rpc("save_logo_vote_poll", {
          p_poll_id: pollId,
          p_admin_code: adminCode,
          p_content: content,
        });

        if (error) {
          throw error;
        }

        return data;
      },

      async getVotes() {
        const { data, error } = await client
          .from("logo_vote_votes")
          .select("option_id")
          .eq("poll_id", pollId);

        if (error) {
          throw error;
        }

        const votes = {};

        (data || []).forEach((row) => {
          votes[row.option_id] = (votes[row.option_id] || 0) + 1;
        });

        return normalizeVotes(votes);
      },

      async submitVote(optionId) {
        const { data, error } = await client.rpc("submit_logo_vote", {
          p_poll_id: pollId,
          p_option_id: optionId,
          p_voter_key: voterKey,
        });

        if (error) {
          throw error;
        }

        return normalizeVotes(data?.votes || {});
      },

      async uploadImage(file, optionId) {
        const prepared = await fileToUploadableImage(file);
        const extension = getFileExtension(prepared.blob.type, file.name);
        const filePath = `${pollId}/${sanitizeId(optionId)}-${Date.now()}.${extension}`;
        const { error } = await client.storage.from(bucketName).upload(filePath, prepared.blob, {
          contentType: prepared.blob.type,
          upsert: true,
        });

        if (error) {
          throw error;
        }

        const { data } = client.storage.from(bucketName).getPublicUrl(filePath);
        return `${data.publicUrl}?v=${Date.now()}`;
      },

      subscribe(handlers) {
        const channel = client
          .channel(`logo-vote-${pollId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "logo_vote_polls",
              filter: `id=eq.${pollId}`,
            },
            (payload) => {
              if (payload.new?.content) {
                handlers.onPoll(payload.new.content);
              }
            }
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "logo_vote_votes",
              filter: `poll_id=eq.${pollId}`,
            },
            () => {
              handlers.onVotes();
            }
          )
          .subscribe();

        return () => {
          client.removeChannel(channel);
        };
      },
    };
  }

  function ensureSupabaseLoaded() {
    attachSupabaseGlobal();

    if (config.mode !== "supabase" || window.supabase?.createClient) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "./vendor/supabase.js?v=cloud-sync-7";
      script.onload = () => {
        attachSupabaseGlobal();
        resolve();
      };
      script.onerror = () => resolve();
      document.head.appendChild(script);
      window.setTimeout(resolve, 6000);
    });
  }

  function attachSupabaseGlobal() {
    if (window.supabase?.createClient) {
      return;
    }

    try {
      if (typeof supabase !== "undefined" && supabase.createClient) {
        window.supabase = supabase;
      }
    } catch (error) {
      // Ignore missing UMD global and fall back to local mode.
    }
  }

  function normalizeOptions(source) {
    const safeOptions = Array.isArray(source) && source.length ? source : [];

    return safeOptions.map((option, index) => {
      const id = sanitizeId(option.id) || createOptionId(index);
      const keywords = Array.isArray(option.keywords) ? option.keywords : parseKeywords(option.keywords);

      return {
        id,
        name: String(option.name || `方案 ${index + 1}`),
        image: String(option.image || "./assets/logos/logo-a.svg"),
        keywords: keywords.length ? keywords.map((keyword) => String(keyword)) : ["待填写"],
      };
    });
  }

  function cloneOptions(source) {
    return normalizeOptions(JSON.parse(JSON.stringify(source || [])));
  }

  function persistOptions() {
    storage.setJson(optionsKey, options);
  }

  function createNewOption() {
    const index = options.length;
    const id = getNextOptionId();
    const letter = getOptionLetter(index);

    return {
      id,
      name: `方案 ${letter}`,
      image: "./assets/logos/logo-a.svg",
      keywords: ["待填写"],
    };
  }

  function getNextOptionId() {
    for (let index = 0; index < 26; index += 1) {
      const id = `option${getOptionLetter(index)}`;

      if (!options.some((option) => option.id === id)) {
        return id;
      }
    }

    return `option${Date.now()}`;
  }

  function getOptionLetter(index) {
    return String.fromCharCode(65 + (index % 26));
  }

  function createOptionId(index) {
    return `option${getOptionLetter(index)}`;
  }

  function sanitizeId(value) {
    return String(value || "")
      .replace(/[^\w-]/g, "")
      .slice(0, 80);
  }

  function parseKeywords(value) {
    return String(value || "")
      .split(/[、,，/|]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);
  }

  function normalizeVotes(source) {
    const votes = {};
    const safeSource = source && typeof source === "object" ? source : {};

    options.forEach((option) => {
      const value = Number(safeSource[option.id]);
      votes[option.id] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    });

    return votes;
  }

  function sumVotes(votes) {
    return Object.values(votes).reduce((total, value) => total + value, 0);
  }

  function getPercent(count, total) {
    if (!total) {
      return 0;
    }

    return Math.round((count / total) * 100);
  }

  function getVoterKey() {
    const key = `${storagePrefix}:voterKey`;
    const existing = storage.get(key);

    if (existing) {
      return existing;
    }

    const generated =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    storage.set(key, generated);
    return generated;
  }

  function fileToCompressedDataUrl(file) {
    return fileToUploadableImage(file).then((prepared) => blobToDataUrl(prepared.blob));
  }

  function fileToUploadableImage(file) {
    if (file.type === "image/svg+xml") {
      return Promise.resolve({ blob: file });
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const maxSize = 1400;
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));

          const context = canvas.getContext("2d");
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Image compression failed"));
                return;
              }

              resolve({ blob });
            },
            "image/webp",
            0.88
          );
        };

        image.onerror = reject;
        image.src = reader.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function getFileExtension(mimeType, fallbackName) {
    if (mimeType === "image/webp") {
      return "webp";
    }

    if (mimeType === "image/png") {
      return "png";
    }

    if (mimeType === "image/svg+xml") {
      return "svg";
    }

    if (mimeType === "image/jpeg") {
      return "jpg";
    }

    const fallback = String(fallbackName || "").split(".").pop();
    return fallback && fallback.length <= 5 ? fallback : "webp";
  }

  function setAdminStatus(message, settings) {
    elements.adminStatus.textContent = message;

    if (settings && settings.persist) {
      return;
    }

    window.clearTimeout(setAdminStatus.timer);
    setAdminStatus.timer = window.setTimeout(() => {
      elements.adminStatus.textContent = "";
    }, 3200);
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2400);
  }

  function createStorage() {
    let memory = {};
    let enabled = false;

    try {
      const testKey = "__zpj_vote_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      enabled = true;
    } catch (error) {
      enabled = false;
    }

    return {
      get(key) {
        if (!enabled) {
          return memory[key] || "";
        }

        return window.localStorage.getItem(key) || "";
      },
      set(key, value) {
        if (!enabled) {
          memory[key] = value;
          return;
        }

        window.localStorage.setItem(key, value);
      },
      remove(key) {
        if (!enabled) {
          delete memory[key];
          return;
        }

        window.localStorage.removeItem(key);
      },
      getJson(key, fallback) {
        const raw = this.get(key);

        if (!raw) {
          return fallback || {};
        }

        try {
          return JSON.parse(raw);
        } catch (error) {
          return fallback || {};
        }
      },
      setJson(key, value) {
        this.set(key, JSON.stringify(value));
      },
    };
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) {
      return window.CSS.escape(value);
    }

    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
