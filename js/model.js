/* Model transport. Task prompts and write permissions live in ai-tasks.js. */
(function (root) {
  "use strict";
  const KEY = "nijan-model";
  const REASONING_EFFORTS = ['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  const records = [];
  let catalog = [],
    sequence = 0;
  function load() {
    try {
      return Object.assign(
        {
          baseUrl: "",
          model: "",
          key: "",
          profile: "default",
          temperature: 0.7,
          protocol: "auto",
          reasoningEffort: "auto",
        },
        JSON.parse(localStorage.getItem(KEY) || "{}"),
      );
    } catch (_) {
      return {
        baseUrl: "",
        model: "",
        key: "",
        profile: "default",
        temperature: 0.7,
        protocol: "auto",
        reasoningEffort: "auto",
      };
    }
  }
  function save(next) {
    const config = Object.assign(load(), next || {});
    config.protocol = ["auto", "chat", "responses"].includes(config.protocol)
      ? config.protocol
      : "auto";
    config.temperature = Number.isFinite(Number(config.temperature))
      ? Number(config.temperature)
      : 0.7;
    config.reasoningEffort = REASONING_EFFORTS.includes(config.reasoningEffort) ? config.reasoningEffort : 'auto';
    localStorage.setItem(
      KEY,
      JSON.stringify(
        Object.fromEntries(
          ["baseUrl", "model", "key", "profile", "temperature", "protocol", "reasoningEffort"].map(
            (key) => [key, config[key]],
          ),
        ),
      ),
    );
    return config;
  }
  function apiRoot(url) {
    return String(url || "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/(?:chat\/completions|responses|models)$/, "");
  }
  function configured() {
    const config = load();
    return !!(apiRoot(config.baseUrl) && config.model && config.key);
  }
  function modelsFromPayload(value) {
    const list = Array.isArray(value)
      ? value
      : (value && (value.data || value.models)) || [];
    if (!Array.isArray(list)) return [];
    return [
      ...new Set(
        list
          .map((item) =>
            typeof item === "string"
              ? item.trim()
              : String(
                  (item && (item.id || item.name || item.model)) || "",
                ).trim(),
          )
          .filter(Boolean),
      ),
    ];
  }
  function allowsAdult() {
    return load().profile !== "strict";
  }
  function jsonMode() {
    return !!(root.TAI18n && root.TAI18n.prefs.jsonMode);
  }
  function writingGuide() {
    const prefs = (root.TAI18n && root.TAI18n.prefs) || {};
    const group = (root.TAUI && root.TAUI.state.lib.sections.style) || {};
    const styles = {
      short: "句子短，叙述具体。",
      long: "允许展开环境、动作和细节。",
      talk: "用对白推进，叙述补动作。",
      spare: "保留余地，不把情绪说满。",
    };
    const count =
      prefs.replyLength === "short"
        ? 200
        : prefs.replyLength === "long"
          ? 1500
          : prefs.replyLength === "custom"
            ? Math.max(50, Math.min(8000, Number(prefs.replyChars) || 600))
            : 600;
    return {
      mode: prefs.replyLength || "medium",
      count,
      style: String(
        group.custom || group.text || styles[group.preset] || styles.short,
      ),
    };
  }
  function systemPrompt(task, mode) {
    let text = String(task || "");
    const language =
      {
        zh: "中文",
        en: "英语",
        ja: "日语",
        ru: "俄语",
        ko: "韩语",
        th: "泰语",
      }[root.TAI18n?.prefs?.lang || "zh"] || "中文";
    text += `\n默认用${language}填写新正文、沟通答复和检查报告；用户明确指定语言时以用户要求为准。引用原文保持原样，JSON 字段名保持任务规定的格式。`;
    if (mode && mode.startsWith("create:")) {
      const guide = writingGuide();
      if (!["create:regex", "create:backup", "create:graph"].includes(mode))
        text += `\n创作正文参考文风：${guide.style}。单段正文目标约 ${guide.count} 字，按该栏用途调整。可选栏位不必填满。`;
      const prefs = (root.TAI18n && root.TAI18n.prefs) || {};
      if (!allowsAdult() || !prefs.adult)
        text += "\n不生成色情或露骨的性内容。";
      else text += "\n亲密设定仅涉及成年人和明确同意，尊重用户指定的边界。";
    }
    return text;
  }
  function notify(record) {
    try {
      root.dispatchEvent(new CustomEvent("nijan-task", { detail: record }));
    } catch (_) {}
  }
  function piece(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(piece).join("");
    if (value && typeof value === "object")
      return piece(value.text || value.content || "");
    return "";
  }
  function extract(data, protocol) {
    if (protocol === "responses") {
      const output = Array.isArray(data.output) ? data.output : [];
      return {
        text:
          piece(data.output_text) ||
          output
            .filter((item) => item.type === "message")
            .map((item) =>
              piece(
                (item.content || []).filter(
                  (part) => part.type === "output_text" || part.type === "text",
                ),
              ),
            )
            .join("\n"),
        reasoning: output
          .filter((item) => item.type === "reasoning")
          .map((item) => piece(item.summary || item.content || ""))
          .filter(Boolean)
          .join("\n"),
      };
    }
    const message =
      (data.choices && data.choices[0] && data.choices[0].message) || {};
    return {
      text:
        typeof message.content === "string"
          ? message.content
          : piece(
              (message.content || []).filter(
                (part) => !String(part.type || "").startsWith("reasoning"),
              ),
            ),
      reasoning: piece(
        message.reasoning_content ||
          message.reasoning ||
          data.reasoning_content ||
          "",
      ),
    };
  }
  function cleanError(message, config) {
    return String(message || "请求失败")
      .split(config.key || "\0")
      .join("[密钥已隐藏]")
      .slice(0, 500);
  }
  function checkCompletion(data, protocol) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("接口返回了无效的响应。");
    if (data.error)
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : data.error.message || "接口未完成请求。",
      );
    if (protocol === "responses") {
      if (
        (data.status && data.status !== "completed") ||
        (data.output || []).some(
          (item) => item.status === "incomplete" || item.status === "failed",
        )
      )
        throw new Error("模型输出未完成，原稿已保留。");
    } else {
      const finish =
        data.choices && data.choices[0] && data.choices[0].finish_reason;
      if (finish && finish !== "stop")
        throw new Error(
          "模型输出被截断或未完成，原稿已保留。请缩小范围后重试。",
        );
    }
  }
  async function streamResult(response, protocol, record) {
    if (
      !String(response.headers.get("content-type") || "").includes(
        "text/event-stream",
      )
    ) {
      const data = await response.json();
      checkCompletion(data, protocol);
      record.usage = data.usage;
      return extract(data, protocol);
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "",
      eventData = [],
      text = "",
      reasoning = "",
      final = null,
      finished = false;
    const event = () => {
      if (!eventData.length) return;
      const raw = eventData.join("\n");
      eventData = [];
      if (raw === "[DONE]") {
        if (protocol === "chat") finished = true;
        return;
      }
      const value = JSON.parse(raw);
      if (
        value.error ||
        value.type === "error" ||
        value.type === "response.failed" ||
        value.type === "response.incomplete"
      )
        throw new Error(
          (value.error && value.error.message) ||
            (value.response &&
              value.response.error &&
              value.response.error.message) ||
            "模型输出未完成，原稿已保留。",
        );
      if (protocol === "chat") {
        const delta =
          (value.choices && value.choices[0] && value.choices[0].delta) || {};
        text += piece(delta.content);
        reasoning += piece(delta.reasoning_content || delta.reasoning);
        const finish =
          value.choices && value.choices[0] && value.choices[0].finish_reason;
        if (finish && finish !== "stop")
          throw new Error(
            "模型输出被截断或未完成，原稿已保留。请缩小范围后重试。",
          );
        if (finish) finished = true;
        if (value.usage) record.usage = value.usage;
      } else {
        if (value.type === "response.output_text.delta")
          text += value.delta || "";
        if (
          value.type === "response.reasoning_summary_text.delta" ||
          value.type === "response.reasoning_text.delta"
        )
          reasoning += value.delta || "";
        if (value.type === "response.completed") {
          final = value.response;
          checkCompletion(final, protocol);
          record.usage = final.usage;
          finished = true;
        }
      }
      record.reasoning = reasoning;
      record.output = text;
      notify(record);
    };
    const line = (value) => {
      if (value === "") event();
      else if (value.startsWith("data:"))
        eventData.push(value.slice(5).trimStart());
    };
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), {
          stream: !chunk.done,
        });
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          line(buffer.slice(0, index).replace(/\r$/, ""));
          buffer = buffer.slice(index + 1);
        }
        if (chunk.done) break;
      }
      if (buffer) line(buffer.replace(/\r$/, ""));
      event();
    } finally {
      reader.releaseLock();
    }
    if (!finished) throw new Error("连接在输出完成前中断，原稿已保留。");
    const extracted = final ? extract(final, protocol) : null;
    return {
      text: (extracted && extracted.text) || text,
      reasoning: (extracted && extracted.reasoning) || reasoning,
    };
  }
  async function complete(messages, options) {
    const config = load(),
      opts = options || {};
    if (!configured()) throw new Error("先在设置里连接，并选一个模型。");
    const base = apiRoot(config.baseUrl);
    if (!/^https?:\/\//i.test(base))
      throw new Error("接口地址需要以 http:// 或 https:// 开头。");
    const record = {
      id: `task_${++sequence}_${Date.now()}`,
      task: opts.task || "test",
      label: opts.label || "接口测试",
      status: "running",
      model: config.model,
      reasoningEffort: REASONING_EFFORTS.includes(config.reasoningEffort) ? config.reasoningEffort : 'auto',
      reasoning: "",
      output: "",
      scope: opts.scopeSummary || "连接测试，没有发送角色卡或世界书。",
      startedAt: new Date().toISOString(),
    };
    records.push(record);
    if (records.length > 24) records.shift();
    notify(record);
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", cancel, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs || 180000);
    try {
      const protocols =
        config.protocol === "chat"
          ? ["chat"]
          : config.protocol === "responses"
            ? ["responses"]
            : ["responses", "chat"];
      let result;
      for (let index = 0; index < protocols.length; index += 1) {
        const protocol = protocols[index];
        record.protocol = protocol;
        const body =
          protocol === "responses"
            ? {
                model: config.model,
                input: messages,
                stream: true,
                store: false,
              }
            : { model: config.model, messages, stream: true };
        if (protocol === "chat" && opts.creative)
          body.temperature = config.temperature;
        if (record.reasoningEffort !== 'auto') {
          if (protocol === 'responses') body.reasoning = { effort: record.reasoningEffort };
          else body.reasoning_effort = record.reasoningEffort;
        }
        const request = () =>
          fetch(
            `${base}/${protocol === "responses" ? "responses" : "chat/completions"}`,
            {
              method: "POST",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
                Accept: "text/event-stream, application/json",
              },
              body: JSON.stringify(body),
            },
          );
        let response = await request();
        if (
          response.status === 400 &&
          Object.prototype.hasOwnProperty.call(body, "temperature")
        ) {
          const detail = await response.clone().text();
          if (
            /temperature/i.test(detail) &&
            /unsupported|not supported|does not support|only.*default|不支持/i.test(
              detail,
            )
          ) {
            delete body.temperature;
            record.transportNote = "接口不支持温度参数，已使用模型默认值。";
            response = await request();
          }
        }
        if (!response.ok) {
          const detail = cleanError(await response.text(), config);
          if (response.status === 400 && record.reasoningEffort !== 'auto' && /reasoning|effort/i.test(detail)) {
            const message = '当前模型或接口不支持所选推理强度，请换一个档位或选择跟随模型。';
            throw new Error(`${root.TAI18n ? root.TAI18n.t(message) : message} ${detail}`);
          }
          if (
            index + 1 < protocols.length &&
            [404, 405, 501].includes(response.status)
          )
            continue;
          throw new Error(`接口返回 ${response.status}：${detail}`);
        }
        result = await streamResult(response, protocol, record);
        break;
      }
      if (!result || !result.text.trim())
        throw new Error("模型没有返回正文，原稿已保留。");
      record.output = result.text;
      record.reasoning = result.reasoning;
      record.status = "received";
      record.finishedAt = new Date().toISOString();
      notify(record);
      return { text: result.text, record };
    } catch (error) {
      record.status = timedOut
        ? "error"
        : controller.signal.aborted
          ? "cancelled"
          : "error";
      record.error = timedOut
        ? "请求超时，原稿已保留。"
        : controller.signal.aborted
          ? "已停止，原稿已保留。"
          : cleanError(error.message, config);
      record.finishedAt = new Date().toISOString();
      notify(record);
      const wrapped = new Error(record.error);
      wrapped.name = controller.signal.aborted ? "AbortError" : "Error";
      throw wrapped;
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (opts.signal) opts.signal.removeEventListener("abort", cancel);
    }
  }
  function parseJson(raw) {
    const trimmed = String(raw || "").trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    try {
      return JSON.parse(fenced ? fenced[1] : trimmed);
    } catch (_) {
      throw new Error(
        "模型返回的内容不是完整 JSON，原稿已保留。请重试或缩小范围。",
      );
    }
  }
  async function runTask(task, context, options) {
    const input = context || {};
    if (
      task === "edit" &&
      (!String(input.instruction || "").trim() || !(input.targets || []).length)
    )
      throw new Error("先选择要修改的对象、栏位，并写下要求。");
    if (task === "review" && !input.card && !input.book)
      throw new Error("先选择要检查的角色卡或世界书。");
    if (task === "discuss" && !String(input.instruction || "").trim())
      throw new Error("先写下要和 AI 沟通的内容。");
    if (
      task.startsWith("create:") &&
      !String(input.brief || input.instruction || "").trim()
    )
      throw new Error("先写下创作要求。");
    const serialized = JSON.stringify(input);
    if (serialized.length > 350000)
      throw new Error(
        "本次内容过多，请到 AI 创作台的“修改已有”减少勾选条目，再分批修改或检查。",
      );
    const instruction = systemPrompt(root.NIJANAI.prompt(task, input), task);
    const response = await complete(
      [
        { role: "system", content: instruction },
        { role: "user", content: serialized },
      ],
      Object.assign({}, options, {
        task,
        creative: task.startsWith("create:"),
        scopeSummary: [
          `任务：${options?.label || task}`,
          ...(input.ideas?.length
            ? [
                `已采用灵感：${input.ideas.map((idea, index) => `${index + 1}. ${idea}`).join("\n")}`,
              ]
            : []),
          ...(input.instruction ? [`本轮补充：${input.instruction}`] : []),
          ...(input.targets || []).map(
            (target) =>
              `可修改：${target.name || target.id} · ${target.fields.map((field) => root.NIJANAI.CARD_FIELDS[field] || root.NIJANAI.ENTRY_FIELDS[field] || field).join("、")}`,
          ),
          `参考角色卡：${(input.card || input.reference?.card)?.name || "未选用"}`,
          ...(input.book || input.reference?.book
            ? (() => {
                const book = input.book || input.reference.book;
                return [
                  `世界书：${book.name}，实际提供 ${book.entries.length} / ${book.scope?.totalEntries ?? book.entries.length} 条${book.scope?.mode === "reference" ? "参考条目（选中原文另外完整发送）" : book.scope?.mode === "selected_entries" ? "选中条目" : "条目"}`,
                  `提供的条目：${book.entries.map((entry) => entry.comment || entry.id).join("、") || "无"}`,
                ];
              })()
            : ["世界书：未选用"]),
        ].join("\n"),
      }),
    );
    try {
      const result = root.NIJANAI.validate(
        task,
        parseJson(response.text),
        input,
      );
      response.record.status = "validated";
      response.record.result = result;
      if (task === "review") response.record.reviewSource = serialized;
      notify(response.record);
      return result;
    } catch (error) {
      response.record.status =
        error.code === "needs-input" ? "needs_input" : "error";
      response.record.error = error.message;
      notify(response.record);
      throw error;
    }
  }
  async function listModels() {
    const config = load();
    if (!config.baseUrl || !config.key)
      throw new Error("先填写接口地址和密钥。");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${apiRoot(config.baseUrl)}/models`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.key}` },
      });
      if (!response.ok) throw new Error(`模型列表返回 ${response.status}`);
      catalog = modelsFromPayload(await response.json());
      return catalog.slice();
    } finally {
      clearTimeout(timer);
    }
  }
  async function askJson(task, user, signal) {
    const response = await complete(
      [
        { role: "system", content: systemPrompt(task) },
        {
          role: "user",
          content: typeof user === "string" ? user : JSON.stringify(user),
        },
      ],
      { signal, task: "utility", label: "辅助任务" },
    );
    const result = parseJson(response.text);
    if (result && result.unsure) {
      const error = new Error(result.question || "模型需要补充信息。");
      error.code = "needs-input";
      throw error;
    }
    return result;
  }
  async function testMessage(message) {
    return (
      await complete([{ role: "user", content: message || "请只回复：收到" }], {
        label: "连接测试",
      })
    ).text;
  }
  async function semanticFindings(character, book) {
    const result = await runTask(
      "review",
      { card: character, book: book || null },
      { label: "人设与设定检查" },
    );
    return result.items;
  }
  root.NIJANModel = {
    load,
    save,
    configured,
    allowsAdult,
    jsonMode,
    systemPrompt,
    writingGuide,
    modelsFromPayload,
    listModels,
    runTask,
    askJson,
    testMessage,
    semanticFindings,
    rememberedModels: () => catalog.slice(),
    history: () => records.slice(),
    lastReasoning: () =>
      records.length ? records[records.length - 1].reasoning : "",
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
