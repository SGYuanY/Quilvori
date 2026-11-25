/* The workbench selects targets, requests proposals, and applies reviewed fields. */
(function (root) {
  "use strict";
  const KEY = "realmweave-studio.v2";
  const AI = () => root.NIJANAI,
    UI = () => root.TAUI,
    lib = () => UI().state.lib;
  let state = null,
    controller = null,
    revision = 0,
    taskRecordId = "";
  const fieldName = (key) =>
    AI().CARD_FIELDS[key] || AI().ENTRY_FIELDS[key] || key;
  const esc = (value) => UI().esc(value);
  function initial() {
    return {
      mode: "edit",
      kind: "world",
      cardId: "",
      bookId: "",
      entries: [],
      cardFields: ["description"],
      entryFields: ["content"],
      focus: "",
      focusField: "content",
      targetQuery: "",
      instruction: "",
      brief: "",
      modules: ["character", "world"],
      allowClear: false,
      selection: null,
      plans: [],
      history: [],
      questions: [],
      answers: [],
      ideas: [],
      receipt: null,
      status: "先选择内容，再写下要怎么改。",
      busy: false,
      review: null,
      reviewAll: false,
      sourceLocation: null,
      sourceReport: null,
      creationMessage: "",
      creationHistory: [],
      creationBatchId: "",
      draftRequests: {},
    };
  }
  function data() {
    if (!state) {
      let saved = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
      } catch (_) {}
      state = Object.assign(
        initial(),
        saved && typeof saved === "object" ? saved : {},
      );
      state.busy = false;
      if (root.TAStudioDrafts?.ready()) state.plans = root.TAStudioDrafts.rehydrate(state.plans);
      if (
        saved &&
        !Object.prototype.hasOwnProperty.call(saved, "creationBatchId")
      ) {
        state.creationBatchId =
          state.plans.findLast((plan) => plan.task.startsWith("create:"))
            ?.batchId || "";
      }
      if (!saved || !Object.prototype.hasOwnProperty.call(saved, "cardId"))
        state.cardId =
          UI().state.sel.character || (lib().characters[0] || {}).id || "";
      if (!saved || !Object.prototype.hasOwnProperty.call(saved, "bookId"))
        state.bookId =
          UI().state.sel.book || (lib().worldBooks[0] || {}).id || "";
    }
    return state;
  }
  async function migrateSessionDrafts(library) {
    try {
      const raw=sessionStorage.getItem(KEY);
      if(!raw)return;
      const saved=JSON.parse(raw);
      if(Array.isArray(saved?.plans) && await root.TAStudioDrafts.importSession(saved.plans,library) && sessionStorage.getItem(KEY)===raw){
        sessionStorage.setItem(KEY,JSON.stringify(saved));
      }
    }catch(_) { /* The durable library still opens when session storage is unavailable. */ }
  }
  function persist() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(data()));
    } catch (_) {
      /* Preview remains in memory if the tab quota is full. */
    }
  }
  function card() {
    return lib().characters.find((item) => item.id === data().cardId) || null;
  }
  function book() {
    return lib().worldBooks.find((item) => item.id === data().bookId) || null;
  }
  function cardContent(value) {
    if (!value) return null;
    return Object.assign(
      { id: value.id },
      Object.fromEntries(
        Object.keys(AI().CARD_FIELDS)
          .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
          .map((key) => [key, AI().copy(value[key])]),
      ),
    );
  }
  function bookContent(value) {
    return value
      ? {
          id: value.id,
          name: value.name,
          description: value.description || "",
          entries: AI().copy(value.entries || []),
        }
      : null;
  }
  function reference(usePageSelection = false) {
    const selected = UI().state.sel;
    return {
      card: cardContent(
        usePageSelection
          ? lib().characters.find((item) => item.id === selected.character)
          : card(),
      ),
      book: bookContent(
        usePageSelection
          ? lib().worldBooks.find((item) => item.id === selected.book)
          : book(),
      ),
    };
  }
  function legacyDraft() {
    try {
      const old = JSON.parse(
        sessionStorage.getItem("nijan-studio-draft") || "null",
      );
      return old && typeof old === "object" && JSON.stringify(old).length > 2
        ? old
        : null;
    } catch (_) {
      return null;
    }
  }
  function modelReference(query, targets = [], usePageSelection = false) {
    const value = reference(usePageSelection);
    value.book = AI().referenceBook(
      value.book,
      query,
      targets
        .filter((target) => target.target === "entry")
        .map((target) => target.id),
    );
    return value;
  }
  function reviewReference() {
    const value = reference(),
      s = data();
    value.book = AI().reviewBook(
      value.book,
      s.entries.length && !s.reviewAll ? s.entries : null,
    );
    return value;
  }
  function scopeKey() {
    const s = data();
    return JSON.stringify([
      s.kind,
      s.cardId,
      s.bookId,
      s.entries.slice().sort(),
      s.cardFields.slice().sort(),
      s.entryFields.slice().sort(),
      s.selection,
    ]);
  }
  function editContext(instruction) {
    const s = data(),
      targets = [];
    if (s.kind === "character" && card() && s.cardFields.length)
      targets.push({
        target: "character",
        id: card().id,
        name: card().name,
        fields: s.cardFields.slice(),
        value: cardContent(card()),
      });
    if (s.kind === "world" && book() && s.entryFields.length)
      (book().entries || [])
        .filter((entry) => s.entries.includes(entry.id))
        .forEach((entry) =>
          targets.push({
            target: "entry",
            id: entry.id,
            name: entry.comment,
            fields: s.entryFields.slice(),
            value: AI().copy(entry),
          }),
        );
    const key = scopeKey(),
      previous = s.plans.findLast(
        (plan) => plan.scope === key && plan.task === "edit",
      );
    return {
      instruction,
      targets,
      bookId: s.bookId,
      reference: modelReference(instruction, targets),
      allowClear: s.allowClear,
      selection: AI().copy(s.selection),
      history: s.history.filter((item) => item.scope === key).slice(-8),
      previousProposal: previous ? previous.result : null,
    };
  }
  function current() {
    const s = data();
    if (s.kind === "character") {
      const item = card();
      return item ? { item, target: "character", fields: s.cardFields } : null;
    }
    const b = book(),
      item =
        (b && (b.entries || []).find((entry) => entry.id === s.focus)) ||
        (b && (b.entries || []).find((entry) => s.entries.includes(entry.id)));
    return item ? { item, target: "entry", fields: s.entryFields } : null;
  }
  function display(value) {
    if (value === undefined || value === null || value === "")
      return "（留白）";
    if (Array.isArray(value))
      return value.length ? value.map(display).join("\n\n") : "（留白）";
    if (typeof value === "object") {
      const labels = {
        entries: "条目",
        blocks: "提示词块",
        name: "名称",
        content: "正文",
        comment: "条目名",
        replies: "快捷回复",
        message: "回复",
        mes: "消息",
        label: "名称",
        line: "台词",
        members: "成员",
        characterId: "角色",
        description: "描述",
        enabled: "启用",
        constant: "恒定启用",
        selective: "使用次关键词",
        position: "注入位置",
        depth: "深度",
        order: "顺序",
        outletName: "Outlet 名称",
        talkativeness: "话多程度",
        activation: "发言方式",
        speaker: "说话人",
        from: "起点",
        to: "终点",
        role: "消息角色",
        floor: "楼层",
        trigger: "触发词",
        scriptName: "脚本名",
        findRegex: "匹配表达式",
        replaceString: "替换内容",
        beats: "情节节拍",
        notes: "作者注",
        nodes: "人物",
        edges: "关系",
        scenario: "情景",
        body: "正文",
        summary: "情节",
        html: "HTML",
        note: "说明",
      };
      return Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "id",
              "createdAt",
              "updatedAt",
              "avatarAssetId",
              "expressionAssetIds",
              "workSource",
              "creationSource",
              "messageStamp",
              "x",
              "y",
            ].includes(key),
        )
        .map(([key, val]) => {
          let shown = display(val);
          if ((key === "characterId" || key === "speaker") && val) {
            const known =
              lib().characters.find((item) => item.id === val) ||
              data()
                .plans.flatMap((plan) => plan.operations)
                .find(
                  (op) =>
                    op.kind === "add" &&
                    op.path[0] === "characters" &&
                    op.value.id === val,
                )?.value;
            shown = known?.name || (val === "narrator" ? "旁白" : shown);
          }
          if (key === "position")
            shown =
              root.TAFormats.POSITIONS.find((item) => item.id === val)?.label ||
              shown;
          if (key === "activation" && val === "natural") shown = "自然发言";
          return `${labels[key] || fieldName(key)}：${shown}`;
        })
        .join("\n");
    }
    return typeof value === "boolean" ? (value ? "是" : "否") : String(value);
  }
  function refresh() {
    if (UI().state.route === "studio") {
      const stage = document.getElementById("stage");
      if (stage) {
        render(stage);
        if (root.TAI18n) root.TAI18n.localize(stage);
      }
    }
  }
  function status(message) {
    data().status = String(message || "模型没有返回有效答复。");
    persist();
    for (const node of document.querySelectorAll("#ai-status, #creation-feedback")) node.textContent = UI().t(message);
  }
  function cancel(message) {
    revision += 1;
    if (controller) controller.abort();
    controller = null;
    data().busy = false;
    if (message) status(message);
  }
  function changeScope() {
    data().selection = null;
    data().sourceLocation = null;
    if (!controller) status("选择已更新，请写下修改要求。");
    persist();
    refresh();
  }
  async function execute(label, operation) {
    if (!root.NIJANModel.configured()) {
      status("先在设置里连接模型，并选择一个。");
      UI().openSettings();
      return false;
    }
    if (controller) {UI().toast(UI().t('已有任务正在运行，可先打开其他栏目。'));return false;}
    const startMode=data().mode, startScope=scopeKey();
    const version = ++revision;
    controller = new AbortController();
    data().busy = true;
    status(label);
    refresh();
    const signal = controller.signal;
    try {
      await operation(signal, () => version === revision);
      return version === revision;
    } catch (error) {
      if (version === revision) {
        status(
          error.code === "needs-input"
            ? `模型需要补充：${error.message}`
            : error.message,
        );
        UI().toast(UI().t(data().status), {kind: "error"});
        if (error.code === "needs-input") {
          if (startMode === "create")
            rememberCreation("assistant", error.message);
          else
            data().history.push({
              role: "assistant",
              scope: startScope,
              text: error.message,
            });
        }
      }
    } finally {
      if (version === revision) {
        data().busy = false;
        controller = null;
        persist();
        refresh();
      }
    }
  }
  async function protectDraft(plan) {
    try {
      await root.TAStudioDrafts.keep(plan);
    } catch (error) {
      // Keep a usable model result in the preview even when this device is full.
      plan.draftSaveError=error.message;
      UI().toast(UI().t(error.message),{kind:"warning"});
    }
    persist();
  }
  function rememberPlan(plan, result, scope) {
    plan.result = AI().copy(result);
    plan.scope = scope;
    data().plans = data().plans.filter(
      (old) =>
        old.task !== "edit" ||
        old.scope !== scope ||
        old.operations.some((op) => op.applied),
    );
    data().plans.push(plan);
    const completed = data().plans.filter(
      (item) =>
        item.operations.length && item.operations.every((op) => op.applied),
    );
    data().plans = data().plans.filter(
      (item) => !completed.includes(item) || completed.slice(-8).includes(item),
    );
    persist();
  }
  async function revise() {
    const s = data(),
      instruction = s.instruction.trim(),
      context = editContext(instruction),
      scope = scopeKey();
    if (!instruction || !context.targets.length) {
      UI().toast("先勾选要修改的条目或栏位，并写下要求。");
      return;
    }
    await execute("正在阅读选中内容，生成修改建议…", async (signal, active) => {
      s.history.push({ role: "user", scope, text: instruction });
      s.history = s.history.slice(-16);
      const result = await root.NIJANModel.runTask("edit", context, {
        signal,
        label: "定向改稿",
      });
      if (!active()) return;
      const plan = AI().proposal(lib(), "edit", result, context);
      rememberPlan(plan, result, scope);
      s.history.push({
        role: "assistant",
        scope,
        text: plan.operations.length
          ? `生成了 ${plan.operations.length} 项修改建议，等待预览和应用。`
          : "没有产生实际改动，原稿保持原样。",
      });
      s.history = s.history.slice(-16);
      status(
        plan.operations.length
          ? `已生成 ${plan.operations.length} 项建议，原稿尚未修改。`
          : "模型未提出实际修改，原稿保持原样。",
      );
    });
  }
  async function create() {
    return generateCreation("");
  }
  function creationPlans() {
    const order = Object.keys(AI().MODULES);
    return data()
      .plans.filter(
        (plan) =>
          plan.batchId === data().creationBatchId &&
          plan.task.startsWith("create:"),
      )
      .sort(
        (a, b) =>
          order.indexOf(a.task.slice(7)) - order.indexOf(b.task.slice(7)),
      );
  }
  function creationDrafts() {
    return Object.fromEntries(
      creationPlans().map((plan) => [
        plan.task.slice(7),
        AI().copy(plan.result[plan.task.slice(7)]),
      ]),
    );
  }
  function syncCreationInputs() {
    const stage = document.getElementById("stage"),
      s = data();
    if (!stage) return;
    const brief = stage.querySelector("#ai-brief");
    if (brief) s.brief = brief.value;
    stage.querySelectorAll("[data-idea]").forEach((input) => {
      const idea = s.ideas[Number(input.dataset.idea)];
      if (idea) idea.accepted = input.checked;
    });
    stage.querySelectorAll("[data-answer]").forEach((input) => {
      const answer = s.answers[Number(input.dataset.answer)];
      if (answer) answer.answer = input.value;
    });
    if (stage.querySelector("[data-module]"))
      s.modules = [...stage.querySelectorAll("[data-module]:checked")].map(
        (input) => input.dataset.module,
      );
    const message = stage.querySelector("#ai-creation-message");
    if (message) s.creationMessage = message.value;
    persist();
  }
  function rememberCreation(role, text) {
    data().creationHistory.push({ role, text });
    data().creationHistory = data().creationHistory.slice(-16);
    persist();
  }
  async function generateCreation(instruction) {
    if(controller) return false;
    const s = data();
    syncCreationInputs();
    if (!s.brief.trim()) {
      UI().toast("先写下创作要求。");
      return false;
    }
    if (!root.NIJANModel.configured()) {
      status("先在设置里连接模型，并选择一个。");
      UI().openSettings();
      return false;
    }
    if (!s.modules.length) s.modules = ["character"];
    const reference = modelReference(s.brief);
    const existing = creationPlans();
    const locked = existing
      .filter((plan) => plan.operations.some((op) => op.applied))
      .map((plan) => plan.task.slice(7));
    const modules = Object.keys(AI().MODULES).filter(
      (module) => s.modules.includes(module) && !locked.includes(module),
    );
    if (!modules.length) {
      UI().toast("所选模块已应用。可到“修改已有”继续修改，或点击“另起一稿”。");
      return false;
    }
    // Freeze only the inputs for this request. The session can hold many previous full drafts.
    const snapshot = {brief:s.brief,modules:[...s.modules],answers:AI().copy(s.answers),ideas:AI().copy(s.ideas),creationHistory:AI().copy(s.creationHistory)},
      inputs = {brief:snapshot.brief,modules:snapshot.modules,questions:AI().copy(s.questions),answers:snapshot.answers,ideas:snapshot.ideas,cardId:s.cardId,bookId:s.bookId};
    const batchId = s.creationBatchId || root.TAStore.uid("batch");
    s.creationBatchId = batchId;
    if (instruction) {
      rememberCreation("user", instruction);
      s.creationMessage = "";
    }
    return execute("正在准备创作…", async (signal, active) => {
      const virtual = AI().copy(lib()),
        created = {};
      const previousDrafts = creationDrafts();
      // Stage pending results in a private library so references keep their IDs.
      for (const previous of existing) {
        const pending = previous.operations.filter((op) => !op.applied);
        if (pending.length)
          AI().commit(
            virtual,
            AI().copy(previous),
            pending.map((op) => op.key),
          );
        if (locked.includes(previous.task.slice(7)))
          created[previous.task.slice(7)] =
            previous.result[previous.task.slice(7)];
      }
      const previousFor=module=>existing.find(row=>row.task==='create:'+module);
      const contextFor=module=>{
        const context = root.NIJANCreation.context(snapshot, {
          instruction,
          previousDrafts,
          currentDraft: previousDrafts[module],
          created,
          reference,
          availableCharacters: virtual.characters.map(({ id, name }) => ({
            id,
            name,
          })),
        });
        if(module==='quick'){
          // In a joint commission, link replies to the works just written in this batch.
          const sourceId=(kind,collection,fallback)=>{
            if(!snapshot.modules.includes(kind))return fallback;
            const source=s.plans.find(row=>row.batchId===batchId && row.task==='create:'+kind);
            return source?.operations.find(op=>op.kind==='add' && op.path[0]===collection)?.value.id || fallback;
          };
          const refs=root.TACreationAssist.quickContext(virtual,{
            characterId:sourceId('character','characters',inputs.cardId),bookId:sourceId('world','worldBooks',inputs.bookId),scope:'relevant',
          },[snapshot.brief,instruction].filter(Boolean).join('\n'));
          context.reference=refs.reference;
          context.quickSource=refs.quickSource;
          delete context.availableCharacters;
        }
        context.history=AI().copy(s.creationHistory);
        return context;
      };
      const {delivered,issues}=await root.TACreativeBatch.run({
        modules,contextFor,active,
        request(module,context,offered){
          status(UI().t("creation.generating",{module:UI().t(AI().MODULES[module])}));
          return root.NIJANModel.runTask('create:'+module,context,{
            signal,label:'创作'+AI().MODULES[module],workKinds:offered,workBatch:batchId,
            collectWorks:root.TACreativeBatch.isWork(module),
          });
        },
        async deliver(module,result,context,sourceKey){
          const previous=previousFor(module);
          const plan=root.TACreativeBatch.plan(virtual,module,result,context,{previous,batchId,inputs,sourceKey});
          created[module]=plan.result[module];
          if(previous)s.plans=s.plans.filter(row=>row.id!==previous.id);
          rememberPlan(plan,plan.result,'create:'+batchId+':'+module);
          await protectDraft(plan);
        },
      });
      if(!active())return;
      const names=delivered.map(kind=>UI().t(AI().MODULES[kind]));
      const messages=issues.map(({kind,reason})=>UI().t(AI().MODULES[kind])+' · '+UI().t(reason || '没有有效内容，原稿保持原样。'));
      if(names.length)messages.unshift(UI().t('已生成草稿')+' · '+names.join(' / '));
      const message=messages.join('\n') || UI().t('没有有效内容，原稿保持原样。');
      rememberCreation('assistant',message);
      status(message);
      if(issues.length)UI().toast(message,{kind:delivered.length?'warning':'error'});
    });
  }
  function contextIdeas(s = data()) {
    return root.NIJANCreation.selectedIdeas(s.ideas);
  }
  async function sendCreation(adjust) {
    if (controller) return;
    const s = data();
    const dialogue = root.NIJANCreativeDialogue;
    syncCreationInputs();
    const note = s.creationMessage.trim();
    const instruction = adjust ? dialogue.revisionInstruction(note, s.creationHistory, s.status) : note;
    if (!instruction) {
      UI().toast(UI().t(adjust ? "请先输入修改意见，或聊一聊再改稿。" : "先写下要和 AI 沟通的建议。"));
      return;
    }
    if (!s.brief.trim()) {
      UI().toast("先写下创作目标。");
      return;
    }
    if (!root.NIJANModel.configured()) {
      UI().toast("先在设置里连接模型。");
      UI().openSettings();
      return;
    }
    if (adjust) {
      const started = await generateCreation(instruction);
      if (!started && note && !s.creationMessage) {
        s.creationMessage = note;
        persist();
        refresh();
      }
      return;
    }
    const context = root.NIJANCreation.context(s, {
      instruction: note,
      previousDrafts: creationDrafts(),
      reference: modelReference(s.brief),
      availableCharacters: lib().characters.map(({ id, name }) => ({ id, name })),
    });
    s.creationMessage = "";
    rememberCreation("user", note);
    const submitted = s.creationHistory.at(-1);
    const completed = await execute("正在阅读当前稿和你的建议…", async (signal, active) => {
      const result = await root.NIJANModel.runTask("discuss", context, { signal, label: "创作沟通" });
      if (!active()) return;
      rememberCreation("assistant", result.reply);
      s.creationHistory.at(-1).kind = "discussion";
      status("讨论已有答复。可以继续聊，也可以按最近讨论改稿。");
    });
    if (!completed && s.creationHistory.includes(submitted)) {
      s.creationHistory = s.creationHistory.filter(item => item !== submitted);
      if (!s.creationMessage && !controller) s.creationMessage = note;
      persist();
      refresh();
    }
  }
  async function questionsOrIdeas(task) {
    syncCreationInputs();
    const s = data();
    if (!s.brief.trim()) {
      UI().toast("先写下创作要求。");
      return;
    }
    const dialogue = root.NIJANCreativeDialogue;
    const inputs = root.NIJANCreation.context(s);
    const context = {
      brief: inputs.brief, modules: inputs.modules, answers: inputs.answers, ideas: inputs.ideas,
      reference: modelReference(inputs.brief),
    };
    const isQuestion = task === "questions";
    const lang = root.TAI18n?.prefs?.lang;
    await execute(
      isQuestion ? "正在梳理必要问题…" : "正在构思创作方向…",
      async (signal, active) => {
        let result, error;
        try {
          result = await root.NIJANModel.runTask(task, context, { signal, label: isQuestion ? "创作追问" : "创作灵感" });
        } catch (caught) {
          error = caught;
        }
        if (!active()) return;
        const { items, local } = dialogue.options(task, result, error, context, lang);
        if (isQuestion) {
          s.answers = dialogue.answeredQuestions(s.answers, items, local);
          s.questions = s.answers.map(row => row.question);
          status(local ? "模型没有给出可用问题。下面是本地生成的可选问题。" : "问题已列出。可以选答，也可以直接开始写。");
        } else {
          s.ideas = dialogue.availableIdeas(s.ideas, items, local);
          status(local ? "模型没有给出可用灵感。下面是本地提供的可选方向。" : "可以选择喜欢的方向，也可以直接生成。");
        }
      },
    );
  }
  async function review() {
    const context = reviewReference();
    if (!context.card && !context.book) {
      UI().toast("先选一张角色卡或一本世界书。");
      return;
    }
    await execute("正在对照原文检查…", async (signal, active) => {
      const result = await root.NIJANModel.runTask("review", context, {
        signal,
        label: "逻辑与人设检查",
      });
      if (!active()) return;
      const report = {
        id: root.TAStore.uid("review"),
        cardId: context.card && context.card.id,
        bookId: context.book && context.book.id,
        source: JSON.stringify(context),
        entryIds: context.book?.scope?.entryIds || null,
        createdAt: new Date().toISOString(),
        items: result.items,
      };
      data().review = report;
      const saved = lib().settings.aiReviews || [];
      lib().settings.aiReviews = saved.concat(report).slice(-10);
      UI().markDirty();
      status(
        result.items.length
          ? `检查完成，发现 ${result.items.length} 项问题；创作正文保持原样。`
          : "检查完成，未发现有原文证据支持的冲突。",
      );
    });
  }
  function trackSelection(operations, reverse = false) {
    const selection = data().selection;
    if (!selection) return;
    const op = operations.find(
      (item) =>
        item.kind === "set" &&
        (item.entryId || item.id) === selection.id &&
        item.field === selection.field,
    );
    if (!op) return;
    const before = reverse ? op.after : op.before,
      after = reverse ? op.before : op.after;
    if (typeof before !== "string" || typeof after !== "string") {
      data().selection = null;
      return;
    }
    const prefix = before.slice(0, selection.start),
      suffix = before.slice(selection.end);
    if (
      before.slice(selection.start, selection.end) !== selection.text ||
      !after.startsWith(prefix) ||
      !after.endsWith(suffix)
    ) {
      data().selection = null;
      return;
    }
    const end = after.length - suffix.length;
    data().selection =
      end > selection.start
        ? Object.assign({}, selection, {
            end,
            text: after.slice(selection.start, end),
          })
        : null;
  }
  async function apply(plan, keys, reason) {
    try {
      const selectedKeys = keys || plan.operations.filter((op) => !op.applied && !op.rejected).map((op) => op.key);
      const receipt=await root.TAHistory.apply(plan, selectedKeys, reason);
      data().receipt=receipt;
      const work=root.TAStudioDrafts.libraryItem(plan);
      if(work){
        // The preview may be dismissed before the author chooses Undo.
        const {operations,...draft}=plan;
        receipt.draft=draft;
      }
      trackSelection(receipt.operations);
      const adds = plan.operations.filter(
        (op) => op.applied && op.kind === "add",
      );
      adds.forEach((op) => {
        if (op.path[0] === "characters") UI().state.sel.character = op.value.id;
        if (op.path[0] === "worldBooks") UI().state.sel.book = op.value.id;
      });
      status(
        UI().state.save === "error"
          ? "内容已应用，但本地存储保存失败，请先导出备份。"
          : `已应用 ${data().receipt.operations.length} 项到对应栏位，可以撤销。`,
      );
      persist();
      refresh();
      if(work){
        UI().toast(work.name,{id:'ai-apply',kind:'success',title:UI().t('已收入作品库'),action:{label:UI().t('打开已收录作品'),onClick:()=>root.TAStudioDrafts.openWork(plan)}});
      }else UI().toast(UI().t('修改已写入对应栏位。'), { id: 'ai-apply', kind: 'success', title: UI().t('修改已保存'), action: { label: UI().t('撤销'), onClick: () => {
        if (data().receipt === receipt) undo();
        else UI().toast(UI().t('请使用当前预览中的撤销按钮。'));
      } } });
      return data().receipt;
    } catch (error) {
      UI().toast(error.message);
      return null;
    }
  }
  async function undo() {
    try {
      const s = data();
      const next = AI().copy(lib()), plan = s.plans.find(item=>item.id===s.receipt?.proposalId);
      const copy = plan ? AI().copy(plan) : s.receipt?.draft && {...s.receipt.draft,operations:AI().copy(s.receipt.operations)};
      AI().undo(next,s.receipt,copy);
      const draft=root.TAStudioDrafts.onUndo(copy);
      await UI().commitLibrary(next,[],false,draft);
      if (copy) {
        if(draft)copy.draftRevision=draft.row.revision;
        if(plan)Object.assign(plan,copy);
        else s.plans.push(copy);
      }
      trackSelection(s.receipt.operations, true);
      s.receipt = null;
      status("已撤销上一次应用。");
      persist();
      refresh();
    } catch (error) {
      UI().toast(error.message);
    }
  }
  function manualSave(stage) {
    const selected = current();
    if (!selected) return;
    try {
      const value = stage.querySelector("#ai-original").value;
      const field = data().focusField;
      const after = [
        "keys",
        "secondaryKeys",
        "tags",
        "alternate_greetings",
      ].includes(field)
        ? value
            .split(
              field === "alternate_greetings" ? /^\s*---\s*$/m : /[,，、\n]/,
            )
            .map((item) => item.trim())
            .filter(Boolean)
        : value;
      const context = {
        instruction: "手工编辑",
        bookId: data().bookId,
        allowClear: data().allowClear,
        targets: [
          {
            target: selected.target,
            id: selected.item.id,
            fields: [field],
            value: AI().copy(selected.item),
          },
        ],
      };
      const result = {
        changes: [
          {
            target: selected.target,
            id: selected.item.id,
            fields: { [field]: after },
          },
        ],
      };
      const plan = AI().proposal(lib(), "edit", result, context);
      if (!plan.operations.length) {
        UI().toast("内容没有变化。");
        return;
      }
      rememberPlan(plan, result, scopeKey());
      apply(plan, undefined, "手工改稿前");
    } catch (error) {
      UI().toast(error.message);
    }
  }
  async function importFile(kind) {
    const file = await UI().pickFile(
      kind === "character"
        ? ".json,.png,application/json,image/png"
        : ".json,application/json",
    );
    if (!file) return;
    try {
      const {card,book,avatarOmitted} = await root.TAFolderImport.importDocument(kind,file);
      if (card) {
        data().cardId = card.id; data().kind = "character"; data().focusField = "description";
        if (avatarOmitted) UI().toast(UI().t("PNG 太大，没有收进素材库，卡面文字已经导入"));
      }
      if (book) {
        data().bookId = book.id; data().entries = []; data().focus = "";
        if (!card) data().kind = "world";
      }
      status("已导入本地库，请选择要修改的内容。");
      changeScope();
    } catch (error) {
      UI().toast(error.message);
    }
  }
  function entryTitle(entry) {
    const name = String(
      (entry &&
        (entry["条目名"] || entry.comment || entry.name || entry.title)) ||
        "",
    ).trim();
    if (name && name !== "未命名") return name;
    const line =
      String((entry && (entry["正文"] || entry.content || entry.body)) || "")
        .trim()
        .split("\n")
        .find((line) => line.trim()) || "";
    return line.length > 18 ? `${line.slice(0, 18)}…` : line;
  }
  function choice(id, label, list, value) {
    return `<label class="field"><span class="field-label">${label}</span><select id="${id}"><option value="">不选用</option>${list.map((item) => `<option value="${esc(item.id)}"${item.id === value ? " selected" : ""}>${esc(item.name || "未命名")}</option>`).join("")}</select></label>`;
  }
  function preview(plan) {
    const pending = plan.operations.filter((op) => !op.applied && !op.rejected).length;
    const busy = data().busy;
    return `<section class="ai-plan paper" data-plan="${esc(plan.id)}"><div class="ai-panel-heading"><h3>${esc(plan.task === "edit" ? "修改预览" : AI().MODULES[plan.task.slice(7)] || "整理结果")}</h3><span class="help">${pending ? `${pending} 项待应用` : plan.operations.length ? UI().t('已处理') : "无实际修改"}</span></div><p class="help ai-plan-request">${esc(new Date(plan.createdAt).toLocaleTimeString())}${plan.request ? ` · ${esc(plan.request)}` : ""}</p>${plan.operations.map((op) => `<article class="ai-change${op.applied ? " applied" : ""}${op.rejected ? " rejected" : ""}"><div class="ws-change-heading"><label class="check"><input type="checkbox" data-operation="${esc(op.key)}" ${op.applied || op.rejected ? "disabled" : "checked"}><span data-no-translate>${esc(op.label)}</span>${op.applied ? ` · ${UI().t('已应用')}` : op.rejected ? ` · ${UI().t('已跳过')}` : ""}</label>${!op.applied ? `<div class="ws-change-actions">${!op.rejected ? `<button type="button" class="btn btn-primary" data-apply-one="${esc(plan.id)}" data-key="${esc(op.key)}" ${busy ? 'disabled' : ''}>${UI().t('采用这条')}</button>` : ''}<button type="button" class="btn" data-reject-one="${esc(plan.id)}" data-key="${esc(op.key)}" ${busy ? 'disabled' : ''}>${UI().t(op.rejected ? '再看看' : '先跳过')}</button></div>` : ''}</div><div class="ai-diff"><div><span class="help">${op.kind === "add" ? "目标" : "修改前"}</span><pre data-no-translate>${esc(op.kind === "add" ? "新建到对应模块" : display(op.before))}</pre></div><div><span class="help">${op.kind === "add" ? "生成内容" : "修改后"}</span><pre data-no-translate>${esc(display(op.kind === "add" ? op.value : op.after))}</pre></div></div></article>`).join("") || '<p class="help">没有实际修改。</p>'}<div class="row"><button class="btn btn-primary" type="button" data-apply="${esc(plan.id)}" ${!pending || busy ? "disabled" : ""}>${root.TAStudioDrafts.isWork(plan) ? UI().t("收入作品库") : UI().t("采用勾选的修改")}</button><button class="btn" type="button" data-discard="${esc(plan.id)}" ${busy ? "disabled" : ""}>关闭这份预览</button></div>${draftEditor(plan)}</section>`;
  }
  function draftRequest(plan) {
    return (
      data().draftRequests[plan.id] ||
      (data().draftRequests[plan.id] = {
        fields:
          plan.task === "create:character" ? ["description"] : ["content"],
        entries: [],
        instruction: "",
      })
    );
  }
  function draftEditor(plan) {
    if (
      !["create:character", "create:world"].includes(plan.task) ||
      plan.operations.some((op) => op.applied)
    )
      return "";
    const source = plan.operations.find((op) => op.kind === "add");
    if (!source) return "";
    const character = plan.task === "create:character",
      request = draftRequest(plan),
      dictionary = character ? AI().CARD_FIELDS : AI().ENTRY_FIELDS;
    return `<details class="ai-draft-editor" data-draft-editor="${esc(plan.id)}"><summary>${UI().t("只改这份样稿的部分内容")}</summary><p class="help">${UI().t("选择栏位或条目后提出要求，AI 只调整这些部分，其余样稿保留。")}</p>${character ? "" : `<fieldset><legend>${UI().t("允许修改的条目")}</legend>${source.value.entries.map((entry) => `<label class="check"><input type="checkbox" data-draft-entry="${esc(entry.id)}" ${request.entries.includes(entry.id) ? "checked" : ""}><span data-no-translate>${esc(entry.comment || "未命名")}</span></label>`).join("")}</fieldset>`}<fieldset><legend>${UI().t("允许修改的栏位")}</legend>${Object.entries(
      dictionary,
    )
      .map(
        ([field, label]) =>
          `<label class="check"><input type="checkbox" data-draft-field="${field}" ${request.fields.includes(field) ? "checked" : ""}>${esc(UI().t(label))}</label>`,
      )
      .join(
        "",
      )}</fieldset><label class="field"><span class="field-label">${UI().t("这份样稿怎么改")}</span><textarea rows="3" data-draft-instruction>${esc(request.instruction)}</textarea></label><button type="button" class="btn btn-primary" data-refine-draft="${esc(plan.id)}" ${data().busy ? "disabled" : ""}>${UI().t("只修改选中的部分")}</button>${(plan.draftDiff || []).map((op) => `<div class="ai-diff"><div><span class="help">${UI().t("修改前")}</span><pre data-no-translate>${esc(display(op.before))}</pre></div><div><span class="help">${UI().t("修改后")}</span><pre data-no-translate>${esc(display(op.after))}</pre></div></div>`).join("")}</details>`;
  }
  async function refineDraft(plan) {
    const request = draftRequest(plan),
      source = plan.operations.find((op) => op.kind === "add"),
      character = plan.task === "create:character";
    if (
      !request.instruction.trim() ||
      !request.fields.length ||
      (!character && !request.entries.length)
    ) {
      UI().toast("先选择要改的栏位或条目，并写下要求。");
      return;
    }
    const original = AI().copy(source.value),
      targets = character
        ? [
            {
              target: "character",
              id: original.id,
              name: original.name,
              fields: request.fields.slice(),
              value: original,
            },
          ]
        : original.entries
            .filter((entry) => request.entries.includes(entry.id))
            .map((entry) => ({
              target: "entry",
              id: entry.id,
              name: entry.comment,
              fields: request.fields.slice(),
              value: AI().copy(entry),
            }));
    const context = {
      instruction: request.instruction.trim(),
      targets,
      bookId: character ? undefined : original.id,
      allowClear: false,
      reference: {
        card: character ? cardContent(original) : cardContent(card()),
        book: character
          ? bookContent(book())
          : AI().referenceBook(
              bookContent(original),
              request.instruction,
              request.entries,
            ),
      },
      history: AI().copy(data().creationHistory),
    };
    await execute("正在调整选中的样稿内容…", async (signal, active) => {
      const result = await root.NIJANModel.runTask("edit", context, {
        signal,
        label: "样稿定向调整",
      });
      if (!active()) return;
      if (!data().plans.includes(plan) || !AI().same(source.value, original))
        throw new Error("样稿已变化，请重新提出修改要求。");
      const virtual = AI().copy(lib()),
        ordered = data()
          .plans.filter(
            (row) =>
              row.batchId === plan.batchId && row.task.startsWith("create:"),
          )
          .sort(
            (a, b) =>
              Object.keys(AI().MODULES).indexOf(a.task.slice(7)) -
              Object.keys(AI().MODULES).indexOf(b.task.slice(7)),
          );
      for (const row of ordered) {
        const keys = row.operations
          .filter((op) => !op.applied)
          .map((op) => op.key);
        if (keys.length) AI().commit(virtual, AI().copy(row), keys);
      }
      const refined = root.NIJANCreation.refinePlan(
        virtual,
        plan,
        result,
        context,
      );
      await protectDraft(refined.plan);
      if (!active()) return;
      data().plans = data().plans.map((row) =>
        row.id === plan.id ? refined.plan : row,
      );
      rememberCreation(
        "user",
        `仅调整${AI().MODULES[plan.task.slice(7)]}样稿：${context.instruction}`,
      );
      rememberCreation(
        "assistant",
        refined.count
          ? `已调整选中的 ${refined.count} 个栏位，其余样稿保留。请检查预览后应用。`
          : "没有实际变化，保留当前样稿。",
      );
      status(
        refined.count
          ? `已更新样稿的 ${refined.count} 个栏位，其他内容保留，尚未写入本地库。`
          : "没有实际变化，保留当前样稿。",
      );
    });
  }
  function previewPlans() {
    const batches = new Map();
    data().plans.forEach((plan) => {
      const key = plan.batchId || plan.id;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(plan);
    });
    return [...batches.values()].reverse().flat();
  }
  function findings() {
    const s = data();
    const report =
      (s.review && (s.review.cardId || "")===s.cardId && (s.review.bookId || "")===s.bookId ? s.review : null) ||
      (lib().settings.aiReviews || []).findLast(
        (item) =>
          (item.cardId || "") === s.cardId && (item.bookId || "") === s.bookId,
      );
    if (!report) return '<p class="help">检查只生成报告，原文保持原样。</p>';
    s.review = report;
    const changed = report.source !== JSON.stringify(reviewReference());
    return `${changed ? '<p class="banner">报告基于之前的稿件或检查范围，请重新检查。</p>' : ""}<div id="ai-review-report">${root.NIJANReview.html(report, lib())}</div>`;
  }
  function openSource(source, report) {
    const s = data();
    const target =
      source.target === "character"
        ? lib().characters.find((card) => card.id === source.id)
        : lib()
            .worldBooks.find((book) => book.id === source.bookId)
            ?.entries.find((entry) => entry.id === source.id);
    const dictionary =
      source.target === "character" ? AI().CARD_FIELDS : AI().ENTRY_FIELDS;
    if (
      !target ||
      !Object.prototype.hasOwnProperty.call(dictionary, source.field)
    ) {
      UI().toast("原条目或栏位已不存在，请重新检查。");
      return;
    }
    s.selection = null;
    s.mode = "edit";
    s.targetQuery = "";
    s.focusField = source.field;
    if (source.target === "character") {
      s.kind = "character";
      s.cardId = source.id;
      s.cardFields = [source.field];
    } else {
      s.kind = "world";
      s.bookId = source.bookId;
      s.entries = [source.id];
      s.focus = source.id;
      s.entryFields = [source.field];
    }
    s.sourceLocation = Object.assign({}, source, { pending: true });
    s.sourceReport = report ? AI().copy(report) : null;
    status(`已定位：${source.label}`);
    persist();
    if (UI().state.route === "studio") refresh();
    else UI().go("studio");
  }
  function returnToReview() {
    const s = data(),
      report = s.sourceReport;
    if (!report) return;
    s.cardId = report.cardId || "";
    s.bookId = report.bookId || "";
    s.entries = report.entryIds || [];
    s.reviewAll = !report.entryIds;
    s.review = report;
    s.mode = "review";
    s.sourceLocation = null;
    status("已返回检查报告。");
    persist();
    refresh();
  }
  function paintRecord() {
    const host = document.getElementById("ai-task-record");
    if (!host) return;
    const log=host.closest('.ai-task-log');
    if(log){
      log.ontoggle=()=>{if(log.open)paintRecord();};
      if(!log.open)return;
      const paste=log.querySelector('[data-task-paste]');
      if(paste && !paste.firstChild)root.TACreativeRecovery.mountPaste(paste);
    }
    const records = root.NIJANModel.history();
    const selected =
      records.find((record) => record.id === taskRecordId) ||
      records[records.length - 1];
    if (!selected) {
      if(!host.firstChild)host.innerHTML='<p class="help">'+esc(UI().t('本次打开还没有模型请求。'))+'</p>';
      return;
    }
    const statuses = {
      running: ({waiting: selected.httpStatus ? '已连接，正在等待首个数据包' : '等待接口响应', receiving:'正在接收接口数据', reasoning:'正在接收推理', writing:'正在接收正文'})[selected.phase] || "接收中",
      received: "正在校验",
      validated: "已校验",
      partial: "部分内容可用",
      received_raw: "已接收正文",
      needs_input: "等待补充",
      cancelled: "已停止",
      error: "未完成",
    };
    const select = host.querySelector("select");
    const recordKeys = records.map((record) => record.id).join(",");
    if (!select || host.dataset.recordKeys !== recordKeys) {
      host.dataset.recordKeys = recordKeys;
      host.innerHTML = `<label class="field"><span class="field-label">查看哪一次任务</span><select id="ai-task-select">${records.map((record) => `<option value="${esc(record.id)}">${esc(record.label)} · ${esc(new Date(record.startedAt).toLocaleTimeString())}</option>`).join("")}</select></label><p data-task-status class="help"></p><div data-task-readable></div><details><summary>本次输入范围</summary><pre class="ai-model-thought" data-task-scope></pre></details><details><summary>模型返回的思考</summary><pre class="ai-model-thought" data-task-thought data-no-translate></pre></details><details><summary>原始结果（排查用）</summary><pre class="ai-model-thought" data-task-output data-no-translate></pre></details>`;
      const recovery=document.createElement('div');recovery.dataset.taskRecovery='';host.append(recovery);
      host.querySelector("select").onchange = (event) => {
        taskRecordId = event.target.value;
        paintRecord();
      };
    }
    host.querySelector("select").value = selected.id;
    const received = selected.bytesReceived ? ' · '+UI().t('已接收')+' '+(selected.bytesReceived < 1024 ? selected.bytesReceived+' B' : (selected.bytesReceived/1024).toFixed(1)+' KiB') : '';
    host.querySelector("[data-task-status]").textContent =
      `${UI().t(statuses[selected.status] || selected.status)} · ${selected.model}${received}${selected.reasoningEffort && selected.reasoningEffort !== 'auto' ? ` · ${UI().t('推理强度')} ${selected.reasoningEffort}` : ''}${selected.transportNote ? ` · ${UI().t(selected.transportNote)}` : ""}${selected.error ? ` · ${UI().t(selected.error)}` : ""}`;
    host.querySelector("[data-task-thought]").textContent =
      selected.reasoning || UI().t(selected.reasoning===undefined ? '本机返回记录保存了当时收到的正文。' : '这个模型没有返回可显示的思考。');
    host.querySelector("[data-task-output]").textContent =
      selected.output || UI().t("尚未返回结果。");
    host.querySelector("[data-task-scope]").textContent =
      selected.scope || UI().t("旧记录没有保存输入范围。");
    if(selected.archiveWarning)host.querySelector('[data-task-status]').append(' · '+UI().t(selected.archiveWarning));
    root.TACreativeRecovery.mountRecord(host.querySelector('[data-task-recovery]'),selected);
    const readable = host.querySelector("[data-task-readable]");
    if (
      selected.task === "review" &&
      selected.status === "validated" &&
      selected.result?.items
    ) {
      const source = JSON.parse(selected.reviewSource || "{}");
      root.NIJANReview.mount(
        readable,
        {
          items: selected.result.items,
          source: selected.reviewSource,
          cardId: source.card?.id || null,
          bookId: source.book?.id || null,
          entryIds: source.book?.scope?.entryIds || null,
        },
        lib(),
      );
    } else readable.replaceChildren();
  }
  function render(stage) {
    const logWasOpen=stage.querySelector('.ai-task-log')?.open || false;
    const s = data(),
      currentItem = current(),
      allFields = s.kind === "character" ? AI().CARD_FIELDS : AI().ENTRY_FIELDS;
    if (!Object.prototype.hasOwnProperty.call(allFields, s.focusField))
      s.focusField = s.kind === "character" ? "description" : "content";
    const original = currentItem && currentItem.item[s.focusField];
    const list =
      s.kind === "world"
        ? (book() && book().entries) || []
        : Object.entries(AI().CARD_FIELDS).map(([key, label]) => ({
            id: key,
            comment: UI().t(label),
          }));
    const checked = s.kind === "world" ? s.entries : s.cardFields;
    const config = root.NIJANModel.load();
    const limits = root.NIJANModel.capabilities();
    const modelDetails = config.model ? [UI().t("上下文窗口") + " · " + (limits.manual || limits.context || UI().t("接口未提供")), UI().t("推荐推理强度") + " · " + (limits.recommended || UI().t("自动（由接口决定）"))].join("　|　") : "";
    const selectedTargets = list.filter((item) => checked.includes(item.id));
    const contextChips = `<div class="ws-context"><small>${UI().t('这次只改')}</small>${selectedTargets.slice(0, 6).map((item) => `<button type="button" class="ws-context-chip" data-context-remove="${esc(item.id)}" aria-label="${esc(UI().t('移出本次范围'))}: ${esc(item.comment)}"><span data-no-translate>${esc(item.comment)}</span>${root.TAWorkspace.icon('close')}</button>`).join('')}${selectedTargets.length > 6 ? `<span class="ws-context-empty">+${selectedTargets.length - 6}</span>` : ''}${!selectedTargets.length ? `<span class="ws-context-empty">${UI().t('先在左侧选择修改范围')}</span>` : ''}</div>`;
    stage.innerHTML = `<div class="ai-workbench mode-${s.mode}" data-busy="${s.busy}"><header class="ws-studio-heading"><div><h2>${UI().t(s.mode === 'create' ? '先写个大概 💭' : s.mode === 'review' ? '查查有没有矛盾 🔎' : '想改哪儿？')}</h2><p>${UI().t(s.mode === 'create' ? '人物、背景，或者一段还没成形的想法，都可以。' : s.mode === 'review' ? '对照你选的卡和世界书，把说不通的地方找出来。' : '左边选内容，右边说要求。改完先看稿，再决定用不用。')}</p></div></header>
      <div class="ai-panel-heading"><div class="ai-mode-tabs" role="tablist" aria-label="AI 工作模式">${[
        ["edit", "修改已有"],
        ["create", "新建创作"],
        ["review", "检查逻辑"],
      ]
        .map(
          ([mode, label]) =>
            `<button type="button" role="tab" class="btn ${s.mode === mode ? "btn-primary" : ""}" aria-selected="${s.mode === mode}" data-mode="${mode}">${label}</button>`,
        )
        .join(
          "",
        )}</div><button type="button" class="btn btn-small" id="ai-connection">${esc(config.model || "连接模型")}</button><label>${UI().t("模型配置")} <select id="studio-profile" data-no-translate ${s.busy ? "disabled" : ""}>${root.NIJANModel.profiles().map(row=>`<option value="${esc(row.id)}" ${row.active?"selected":""}>${esc(row.name)}</option>`).join("")}</select></label></div>
      ${modelDetails ? `<p class="help" data-no-translate>${esc(modelDetails)}</p>` : ""}
      <div class="ai-reference-grid">${choice("ai-card-pick", s.mode === "edit" && s.kind === "character" ? "正在修改的角色卡" : "参考角色卡", lib().characters, s.cardId)}${choice("ai-book-pick", s.mode === "edit" && s.kind === "world" ? "正在修改的世界书" : "参考世界书", lib().worldBooks, s.bookId)}<div class="ai-import-actions"><button type="button" class="btn btn-small" id="ai-import-card">导入角色卡文件</button><button type="button" class="btn btn-small" id="ai-import-world">导入世界书文件</button></div></div>
      ${book() && book().entries.length > 50 ? '<p class="help">大书按相关性提供参考，选中原文会完整发送；本次参考范围可在任务记录中查看。</p>' : ""}
      <p class="ai-task-status" role="status" id="ai-status">${esc(s.status)}</p>${s.sourceLocation ? `<div class="review-location-notice"><span>原文地址：${esc(s.sourceLocation.label)}</span>${s.sourceReport ? '<button type="button" class="btn btn-small" id="ai-return-review">返回检查报告</button>' : ""}</div>` : ""}
      ${legacyDraft() ? '<div class="row"><p class="help">上个版本的创作草稿已保留，可先导出备份。</p><button class="btn btn-small" type="button" id="ai-export-legacy">导出旧版草稿</button></div>' : ""}
      ${
        s.mode === "edit"
          ? `<div class="ai-editor-grid">
        <aside class="paper ai-target-panel"><div class="row"><button type="button" class="btn btn-small ${s.kind === "world" ? "btn-primary" : ""}" data-kind="world">世界书条目</button><button type="button" class="btn btn-small ${s.kind === "character" ? "btn-primary" : ""}" data-kind="character">角色卡栏位</button></div><label class="field"><span class="field-label">查找${s.kind === "world" ? "条目" : "栏位"}</span><input id="ai-target-search" type="search" value="${esc(s.targetQuery)}" placeholder="按名称或正文查找"></label><p class="help">已选 ${checked.length} ${s.kind === "world" ? "条" : "栏"}，可多选。</p><div class="ai-target-list">${list.map((item) => `<div class="ai-target-row" ${`${item.comment || ""} ${item.content || ""}`.toLowerCase().includes(s.targetQuery.toLowerCase()) ? "" : "hidden"} data-search="${esc(`${item.comment || ""} ${item.content || ""}`.toLowerCase())}"><label class="check"><input type="checkbox" data-target="${esc(item.id)}" ${checked.includes(item.id) ? "checked" : ""}><span>${esc(item.comment || "未命名")}</span></label><button type="button" class="ai-inspect" data-focus="${esc(item.id)}" aria-label="查看${esc(item.comment || "条目")}">查看</button></div>`).join("") || '<p class="help">先选择或导入一份内容。</p>'}</div></aside>
        <section class="paper ai-source-panel"><div class="ai-panel-heading"><h3>${esc(currentItem ? currentItem.item.name || currentItem.item.comment : "原文")}</h3><span class="tag">${s.kind === "world" ? "世界书" : "角色卡"}</span></div><label class="field"><span class="field-label">查看栏位</span><select id="ai-field-pick">${Object.entries(
          allFields,
        )
          .map(
            ([key, label]) =>
              `<option value="${key}"${key === s.focusField ? " selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select></label><label class="field ai-original-field"><span class="field-label">原文（可以手工编辑）</span><textarea id="ai-original" rows="12" ${currentItem ? "" : "disabled"}>${esc(Array.isArray(original) ? original.join(s.focusField === "alternate_greetings" ? "\n\n---\n\n" : "，") : original || "")}</textarea></label>${s.focusField === "alternate_greetings" ? '<p class="help">每条备用开场用单独一行 --- 分隔，正文中的换行会保留。</p>' : ""}<div class="row"><button type="button" class="btn btn-small" id="ai-save-manual" ${currentItem ? "" : "disabled"}>保存手工修改</button><button type="button" class="btn btn-small" id="ai-use-selection" ${currentItem && typeof original === "string" ? "" : "disabled"}>只改选中文字</button></div>${s.selection ? `<p class="help">已限定选区：${esc(s.selection.text)} <button type="button" class="btn btn-small" id="ai-clear-selection">解除选区</button></p>` : ""}${
          s.kind === "world"
            ? `<fieldset class="ai-field-scope"><legend>允许 AI 修改的栏位</legend>${Object.entries(
                AI().ENTRY_FIELDS,
              )
                .map(
                  ([key, label]) =>
                    `<label class="check"><input type="checkbox" data-entry-field="${key}" ${s.entryFields.includes(key) ? "checked" : ""}>${label}${key === "secondaryKeys" ? "（可留白）" : ""}</label>`,
                )
                .join("")}</fieldset>`
            : '<p class="help">左侧勾选的栏位允许修改；可选栏位可以留白。</p>'
        }</section>
        <section class="paper ai-chat-panel"><h3>${root.TAWorkspace.icon('studio')}和 AI 商量</h3>${contextChips}<p class="help">${s.kind === "world" ? `只改选中的 ${s.entries.length} 条世界书条目` : `只改选中的 ${s.cardFields.length} 个角色卡栏位`}。其他内容用于参考。</p><label class="field"><span class="field-label">这次怎么改</span><textarea id="ai-instruction" rows="5" placeholder="例如：把选中人物的年级改为大三，保留其余经历。">${esc(s.instruction)}</textarea></label><div class="ws-quick-instructions">${[['说自然点', '让表达更自然，保留原意。'], ['补点细节', '补充具体细节，保持设定一致。'], ['删掉重复', '精简重复内容，保留关键信息。']].map(([label, text]) => `<button type="button" data-quick-instruction="${esc(UI().t(text))}">${esc(UI().t(label))}</button>`).join('')}</div><label class="check"><input id="ai-allow-clear" type="checkbox" ${s.allowClear ? "checked" : ""}>允许按本次要求清空选中栏位</label><button type="button" class="btn btn-primary" id="ai-revise">${s.busy ? "按新要求再改" : "请 AI 改一版"}</button>${s.busy ? '<button class="btn" type="button" id="ai-stop">停止</button>' : ""}<div class="ai-conversation">${s.history
          .filter((item) => item.scope === scopeKey())
          .slice(-6)
          .map(
            (item) =>
              `<div class="ai-conversation-item"><b>${item.role === "user" ? "我的要求" : "任务反馈"}</b><p>${esc(item.text)}</p></div>`,
          )
          .join("")}</div></section>
      </div>`
          : ""
      }
      ${
        s.mode === "create"
          ? `<div class="ai-creation-grid"><section class="paper ai-create"><label class="field"><span class="field-label">想写什么？</span><textarea id="ai-brief" rows="5" placeholder="人物是谁，故事在哪儿发生？写几句就行，细节可以边聊边补。">${esc(s.brief)}</textarea></label><fieldset class="ai-module-choices"><legend>这次写哪些</legend>${Object.entries(
              AI().MODULES,
            )
              .map(
                ([key, label]) =>
                  `<label class="check"><input type="checkbox" data-module="${key}" ${s.modules.includes(key) ? "checked" : ""}>${label}</label>`,
              )
              .join(
                "",
              )}</fieldset><p class="help">勾上需要的就好。写完先看稿，喜欢了再收进资料库。</p><div class="row"><button type="button" class="btn" id="ai-questions" ${s.busy ? "disabled" : ""}>先问我几个问题</button><button type="button" class="btn" id="ai-ideas" ${s.busy ? "disabled" : ""}>来点灵感 💡</button><button type="button" class="btn btn-primary" id="ai-create" ${s.busy ? "disabled" : ""}>开始写</button>${s.busy ? '<button class="btn" type="button" id="ai-stop">停止</button>' : ""}</div><p id="creation-feedback" class="help" aria-live="polite">${esc(UI().t(s.status))}</p>${s.questions.map((question, index) => `<label class="field"><span class="field-label"><span data-no-translate>${esc(question)}</span>${s.answers[index]?.local ? ` <small class="muted">${esc(UI().t("本地提问"))}</small>` : ""}</span><input data-answer="${index}" value="${esc((s.answers[index] && s.answers[index].answer) || "")}"></label>`).join("")}<fieldset class="ai-idea-options"><legend>生成的灵感（勾选即采用）</legend>${s.ideas.map((idea, index) => `<label class="check"><input type="checkbox" data-idea="${index}" ${idea.accepted ? "checked" : ""}><span data-no-translate>${esc(idea.text)}</span>${idea.local ? ` <small class="muted">${esc(UI().t("本地灵感"))}</small>` : ""}</label>`).join("") || '<p class="help">没想好？点一下“来点灵感”，也许就有头绪了。</p>'}</fieldset><div class="ai-adopted-ideas" id="ai-adopted-ideas"><strong>${UI().t("creation.adopted", { count: contextIdeas(s).length })}</strong>${contextIdeas(
              s,
            )
              .map((idea) => `<p>${esc(idea)}</p>`)
              .join("")}</div></section>
        <section class="paper ai-create-dialog"><h3>边聊边改</h3><p class="help">${esc(UI().t(s.busy ? '可以先写下下一条想法，本轮完成后再发送。' : '讨论或修改时，会参考当前稿件和已选灵感。'))}</p><div class="ai-creation-conversation" aria-live="polite">${s.creationHistory.map((item) => `<article class="ai-conversation-item"><b>${item.role === "user" ? "我" : item.kind === "discussion" ? "AI" : "AI／任务反馈"}</b><p>${esc(item.text)}</p></article>`).join("") || '<p class="help">有想法就直接说，边聊边把稿子改顺。</p>'}</div><label class="field"><span class="field-label">还有什么想补充的？</span><textarea id="ai-creation-message" rows="3" placeholder="例如：人物不要一开始就认识主角，先从借书相识；先和我讨论这样安排是否合理。">${esc(s.creationMessage)}</textarea></label><div class="row"><button type="button" class="btn" id="ai-discuss" ${s.busy ? "disabled" : ""}>聊一聊</button><button type="button" class="btn btn-primary" id="ai-create-adjust" ${s.busy ? "disabled" : ""}>${esc(UI().t(!s.creationMessage.trim() && root.NIJANCreativeDialogue.lastDiscussion(s.creationHistory, s.status) ? "按最近讨论改稿" : "按输入改稿"))}</button>${s.busy ? '<button type="button" class="btn" id="ai-discuss-stop">停止</button>' : ""}<button type="button" class="btn btn-small" id="ai-create-new" ${s.busy ? "disabled" : ""}>另起一稿</button></div></section></div>`
          : ""
      }
      ${s.mode === "review" ? `<section class="paper ai-review"><div class="ai-panel-heading"><h3>逻辑与人设检查</h3><button class="btn btn-primary" id="ai-review" type="button" ${s.busy ? "disabled" : ""}>对照原文检查</button></div><p class="help">检查所选角色卡和世界书，展示原文证据、位置和原因。可选空栏不算错误。</p>${book() && s.entries.length ? `<label class="check"><input type="checkbox" id="ai-review-all" ${s.reviewAll ? "checked" : ""}>检查整本世界书（${book().entries.length} 条）</label><p class="help">${s.reviewAll ? "本次检查整本书。" : `本次只检查已选的 ${s.entries.length} 条，报告不会代表整本书。`}</p>` : '<p class="help">大书可以先在“修改已有”勾选条目，再回这里分批检查。</p>'}${s.busy ? '<button class="btn" type="button" id="ai-stop">停止</button>' : ""}${findings()}</section>` : ""}
      <section class="ai-previews"><div class="ai-panel-heading"><h3>看看这一版</h3><button class="btn btn-small" id="ai-undo" type="button" ${s.receipt && !s.busy ? "" : "disabled"}>撤销上一次应用</button></div>${previewPlans().map(plan => root.TAStudioDrafts.delivery(plan) + preview(plan)).join("") || '<p class="help">写好会放在这里。对照着看，合适的再留下。</p>'}</section>
      <details class="paper ai-task-log" ${logWasOpen ? 'open' : ''}><summary>任务记录与模型返回</summary><div id="ai-task-record"></div><div data-task-paste></div></details>
    </div>`;
    const bind = (selector, event, fn) => {
      const element = stage.querySelector(selector);
      if (element) element.addEventListener(event, fn);
    };
    stage.querySelectorAll("[data-mode]").forEach(
      (button) =>
        (button.onclick = () => {
          s.mode = button.dataset.mode;
          persist();
          refresh();
        }),
    );
    stage.querySelectorAll("[data-kind]").forEach(
      (button) =>
        (button.onclick = () => {
          s.kind = button.dataset.kind;
          s.targetQuery = "";
          s.focusField = s.kind === "world" ? "content" : "description";
          changeScope();
        }),
    );
    bind("#studio-profile", "change", event => { syncCreationInputs(); root.NIJANModel.selectProfile(event.target.value); refresh(); });
    bind("#ai-connection", "click", () =>
      document.querySelector('[data-shell="settings"]').click(),
    );
    bind("#ai-card-pick", "change", (event) => {
      s.cardId = event.target.value;
      changeScope();
    });
    bind("#ai-book-pick", "change", (event) => {
      s.bookId = event.target.value;
      s.targetQuery = "";
      s.entries = [];
      s.focus = "";
      changeScope();
    });
    bind("#ai-import-card", "click", () => importFile("character"));
    bind("#ai-import-world", "click", () => importFile("world"));
    bind("#ai-export-legacy", "click", () =>
      UI().downloadJson("创作台旧稿备份.json", legacyDraft()),
    );
    stage.querySelectorAll("[data-target]").forEach(
      (input) =>
        (input.onchange = () => {
          const values = s.kind === "world" ? s.entries : s.cardFields;
          if (input.checked) {
            if (!values.includes(input.dataset.target))
              values.push(input.dataset.target);
            s.focus = input.dataset.target;
            if (s.kind === "character") s.focusField = input.dataset.target;
          } else {
            const index = values.indexOf(input.dataset.target);
            if (index >= 0) values.splice(index, 1);
          }
          changeScope();
        }),
    );
    stage.querySelectorAll("[data-focus]").forEach(
      (button) =>
        (button.onclick = () => {
          s.focus = button.dataset.focus;
          if (s.kind === "character") s.focusField = button.dataset.focus;
          persist();
          refresh();
        }),
    );
    stage.querySelectorAll("[data-entry-field]").forEach(
      (input) =>
        (input.onchange = () => {
          s.entryFields = [
            ...stage.querySelectorAll("[data-entry-field]:checked"),
          ].map((box) => box.dataset.entryField);
          changeScope();
        }),
    );
    bind("#ai-target-search", "input", (event) => {
      const query = event.target.value.toLowerCase();
      s.targetQuery = event.target.value;
      persist();
      stage.querySelectorAll("[data-search]").forEach((row) => {
        row.hidden = !row.dataset.search.includes(query);
      });
    });
    bind("#ai-field-pick", "change", (event) => {
      s.focusField = event.target.value;
      persist();
      refresh();
    });
    bind("#ai-instruction", "input", (event) => {
      s.instruction = event.target.value;
      persist();
    });
    bind("#ai-allow-clear", "change", (event) => {
      s.allowClear = event.target.checked;
      persist();
      refresh();
    });
    bind("#ai-revise", "click", revise);
    bind("#ai-stop", "click", () => {
      cancel("已停止请求，原稿保持原样。");
      refresh();
    });
    bind("#ai-save-manual", "click", () => manualSave(stage));
    bind("#ai-use-selection", "click", () => {
      const area = stage.querySelector("#ai-original"),
        selected = current();
      if (!selected || area.selectionStart === area.selectionEnd) {
        UI().toast("先在原文中选中一段文字。");
        return;
      }
      if (area.value !== selected.item[s.focusField]) {
        UI().toast("先保存手工修改，再选择文字。");
        return;
      }
      const focusField = s.focusField;
      s.selection = {
        id: selected.item.id,
        field: focusField,
        start: area.selectionStart,
        end: area.selectionEnd,
        text: area.value.slice(area.selectionStart, area.selectionEnd),
      };
      if (s.kind === "world") {
        s.entries = [selected.item.id];
        s.entryFields = [focusField];
      } else s.cardFields = [focusField];
      persist();
      refresh();
    });
    bind("#ai-clear-selection", "click", () => {
      s.selection = null;
      persist();
      refresh();
    });
    bind("#ai-brief", "input", (event) => {
      s.brief = event.target.value;
      persist();
    });
    stage.querySelectorAll("[data-module]").forEach(
      (input) =>
        (input.onchange = () => {
          s.modules = [...stage.querySelectorAll("[data-module]:checked")].map(
            (box) => box.dataset.module,
          );
          persist();
        }),
    );
    stage.querySelectorAll("[data-answer]").forEach(
      (input) =>
        (input.oninput = () => {
          s.answers[Number(input.dataset.answer)].answer = input.value;
          persist();
        }),
    );
    stage.querySelectorAll("[data-idea]").forEach(
      (input) =>
        (input.onchange = () => {
          s.ideas[Number(input.dataset.idea)].accepted = input.checked;
          persist();
          const adopted = stage.querySelector("#ai-adopted-ideas");
          if (adopted)
            adopted.innerHTML = `<strong>${UI().t("creation.adopted", { count: contextIdeas(s).length })}</strong>${contextIdeas(
              s,
            )
              .map((idea) => `<p>${esc(idea)}</p>`)
              .join("")}`;
        }),
    );
    bind("#ai-create", "click", create);
    bind("#ai-creation-message", "input", (event) => {
      s.creationMessage = event.target.value;
      const button = stage.querySelector("#ai-create-adjust");
      const hasDiscussion = root.NIJANCreativeDialogue.lastDiscussion(s.creationHistory, s.status);
      if (button) button.textContent = UI().t(!s.creationMessage.trim() && hasDiscussion ? "按最近讨论改稿" : "按输入改稿");
      persist();
    });
    bind("#ai-discuss-stop", "click", () => stage.querySelector("#ai-stop")?.click());
    bind("#ai-discuss", "click", () => sendCreation(false));
    bind("#ai-create-adjust", "click", () => sendCreation(true));
    bind("#ai-create-new", "click", () => {
      s.creationBatchId = "";
      s.creationHistory = [];
      s.questions=[]; s.answers=[]; s.ideas=[];
      s.creationMessage = "";
      status("已另起一稿；之前的预览仍保留在下方。");
      persist();
      refresh();
    });
    bind("#ai-questions", "click", () => questionsOrIdeas("questions"));
    bind("#ai-ideas", "click", () => questionsOrIdeas("ideas"));
    bind("#ai-review", "click", review);
    root.NIJANReview.bind(stage.querySelector("#ai-review-report"), s.review);
    bind("#ai-return-review", "click", returnToReview);
    bind("#ai-review-all", "change", (event) => {
      s.reviewAll = event.target.checked;
      persist();
      refresh();
    });
    bind("#ai-undo", "click", undo);
    stage.querySelectorAll("[data-open-delivery]").forEach(btn => { btn.onclick=()=>root.TAStudioDrafts.openWork(s.plans.find(plan=>plan.id===btn.dataset.openDelivery)); });
    stage.querySelectorAll("[data-apply]").forEach(
      (button) =>
        (button.onclick = () => {
          const node = button.closest("[data-plan]");
          apply(
            s.plans.find((plan) => plan.id === button.dataset.apply),
            [...node.querySelectorAll("[data-operation]:checked")].map(
              (box) => box.dataset.operation,
            ),
          );
        }),
    );
    stage.querySelectorAll('[data-apply-one]').forEach((button) => {
      button.onclick = () => apply(s.plans.find((plan) => plan.id === button.dataset.applyOne), [button.dataset.key]);
    });
    stage.querySelectorAll('[data-reject-one]').forEach((button) => {
      button.onclick = () => {
        const plan = s.plans.find((item) => item.id === button.dataset.rejectOne);
        const op = plan?.operations.find((item) => item.key === button.dataset.key);
        if (!op || op.applied) return;
        op.rejected = !op.rejected;
        persist(); refresh();
        if (op.rejected) UI().toast(UI().t('这项建议已跳过，原文保持原样。'), { id: 'ai-suggestion', kind: 'info', action: { label: UI().t('恢复此项'), onClick: () => {
          if (s.plans.includes(plan) && !op.applied) { op.rejected = false; persist(); refresh(); }
        } } });
      };
    });
    stage.querySelectorAll("[data-discard]").forEach(
      (button) =>
        (button.onclick = async () => {
          const dropping=s.plans.find(row=>row.id===button.dataset.discard);
          try { await root.TAStudioDrafts.discard(dropping); } catch(error){ UI().toast(UI().t(error.message),{kind:"error"});return; }
          s.plans = s.plans.filter(
            (plan) => plan.id !== button.dataset.discard,
          );
          persist();
          refresh();
        }),
    );
    stage
      .querySelectorAll("#ai-card-pick,#ai-book-pick")
      .forEach((select) => UI().enhanceSelect(select));
    paintRecord();
    stage.querySelectorAll("[data-draft-editor]").forEach((editor) => {
      const plan = s.plans.find((row) => row.id === editor.dataset.draftEditor),
        request = draftRequest(plan);
      editor.querySelectorAll("[data-draft-field]").forEach(
        (input) =>
          (input.onchange = () => {
            request.fields = [
              ...editor.querySelectorAll("[data-draft-field]:checked"),
            ].map((node) => node.dataset.draftField);
            persist();
          }),
      );
      editor.querySelectorAll("[data-draft-entry]").forEach(
        (input) =>
          (input.onchange = () => {
            request.entries = [
              ...editor.querySelectorAll("[data-draft-entry]:checked"),
            ].map((node) => node.dataset.draftEntry);
            persist();
          }),
      );
      editor.querySelector("[data-draft-instruction]").oninput = (event) => {
        request.instruction = event.target.value;
        persist();
      };
      editor.querySelector("[data-refine-draft]").onclick = () =>
        refineDraft(plan);
    });
    if (root.TAWorkspace) root.TAWorkspace.enhance(stage);
    if (s.sourceLocation?.pending) {
      s.sourceLocation.pending = false;
      const area = stage.querySelector("#ai-original"),
        quote = s.sourceLocation.quote;
      if (area) {
        area.scrollIntoView({ block: "center" });
        area.focus({ preventScroll: true });
        const offset = quote ? area.value.indexOf(quote) : -1;
        if (offset >= 0) {
          area.setSelectionRange(offset, offset + quote.length);
          area.scrollTop =
            area.value.slice(0, offset).split("\n").length * 20 - 60;
        } else if (quote)
          UI().toast("当前原文已变化，已打开对应栏位；请重新检查。");
      }
    }
  }
  function openFor(options) {
    const s = data();
    const sameScope = options.kind === 'character'
      ? s.kind === 'character' && s.cardId === options.cardId
      : s.kind === 'world' && s.bookId === options.bookId && s.entries.length === 1 && s.entries[0] === options.entryId;
    if (!sameScope) s.instruction = '';
    s.mode = 'edit'; s.kind = options.kind === 'character' ? 'character' : 'world';
    s.selection = null; s.sourceLocation = null; s.sourceReport = null; s.targetQuery = '';
    if (s.kind === 'character') {
      s.cardId = options.cardId || '';
      s.cardFields = (options.fields || ['description']).filter((field) => Object.hasOwn(AI().CARD_FIELDS, field));
      s.focusField = s.cardFields[0] || 'description'; s.focus = s.focusField;
    } else {
      s.bookId = options.bookId || '';
      const entry = book()?.entries.find((item) => item.id === options.entryId);
      s.entries = entry ? [entry.id] : []; s.focus = entry?.id || '';
      s.entryFields = ['content']; s.focusField = 'content';
    }
    if(!controller)s.status = '已定位到原文，请写下本次修改要求。';
    persist(); UI().go('studio');
  }
  if (root.addEventListener) {
    root.addEventListener("pagehide", persist);
    root.addEventListener("nijan-task", () => paintRecord());
  }
  async function recoverWork(kind,result,sourceKey,record) {
    if(controller)throw new Error('已有任务正在运行，可先打开其他栏目。');
    const batchId=record?.workBatch || 'recovered_'+sourceKey;
    const inputs={brief:record?.workBrief || '',modules:record?.workKinds || [kind]};
    const plan=root.TACreativeBatch.plan(structuredClone(lib()),kind,result,{brief:inputs.brief},{batchId,inputs,sourceKey});
    await root.TAStudioDrafts.keep(plan);
    rememberPlan(plan,plan.result,'create:'+batchId+':'+kind);
    return plan;
  }
  async function openDraft(id) {
    const s=data();
    const saved=root.TAStudioDrafts.pending().find(row=>row.plan.id===id);
    if(!saved)return;
    let plan=s.plans.find(row=>row.id===id);
    if(!plan || plan.draftRevision!==saved.revision){
      plan=structuredClone(saved.plan);
      s.plans=s.plans.filter(row=>row.batchId!==plan.batchId || row.task!==plan.task).concat(plan);
    }
    if(!controller){
      if(s.creationBatchId!==plan.batchId || !s.brief){
        const input=plan.creationInput || {brief:plan.request,modules:s.plans.filter(row=>row.batchId===plan.batchId).map(row=>row.task.slice(7))};
        Object.assign(s,{brief:input.brief || '',modules:[...input.modules],questions:structuredClone(input.questions || []),
          answers:structuredClone(input.answers || []),ideas:structuredClone(input.ideas || []),cardId:input.cardId || '',bookId:input.bookId || '',
          creationHistory:[],creationMessage:''});
      }
      s.mode="create";s.creationBatchId=plan.batchId;
    }
    persist();
    await UI().go("studio");
    const node=document.querySelector('[data-plan="'+CSS.escape(plan.id)+'"]');
    node?.scrollIntoView({block:"start"});
    node?.querySelector("[data-apply]")?.focus({preventScroll:true});
  }
  root.NIJANStudio = {
    render, openFor, openDraft, recoverWork, migrateSessionDrafts,
    resetAfterClear:()=>{cancel();state=null;root.TACreativeRecovery?.clear();try{sessionStorage.removeItem(KEY);}catch(_){}}, running:()=>!!controller,
    entryTitle,
    cardContent,
    bookContent,
    reference,
    modelReference,
    openSource,
    editContext,
    formatValue: display,
    applyExternal: async (plan) => {
      data().plans.push(plan);
      const receipt = await apply(plan);
      if (!receipt) throw new Error("未应用，原稿发生了变化。");
      return receipt;
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
