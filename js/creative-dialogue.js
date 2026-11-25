/* Optional creative questions, inspiration, and conversation. No model calls or storage. */
(function (root) {
  "use strict";

  const lists = {
    questions: ["questions", "question", "clarifying_questions", "clarifyingQuestions"],
    ideas: ["ideas", "idea", "suggestions", "suggestion", "directions", "inspirations"],
  };
  const wrappers = ["result", "data", "output", "items", "reply", "message", "content", "text"];
  const draftKeys = new Set([
    "card", "cards", "character", "characters", "character_book", "characterbook", "world", "worldbook", "worldbooks", "world_books", "entries",
    "changes", "operations", "fields", "first_mes", "mes_example", "personality", "scenario", "spec",
    "graph", "timeline", "quick", "regex", "sections", "script", "memory", "backup", "blocks",
    "replies", "nodes", "edges", "findregex", "replacestring", "secondarykeys", "keys", "comment", "constant", "firstmes",
  ]);
  const listMarker = /^(?:[-*+•·]|\(?\d{1,2}[.)、．）]|[一二三四五六七八九十]+[、）])\s*/u;
  const numberedInline = /([^\n])\s+((?:\(?\d{1,2}[.)、．）]|[一二三四五六七八九十]+[、）])\s*)(?=\S)/gu;
  const questionForm = /[?？]|^(?:who|what|where|when|why|how|which|would|could|should|do|does|did|is|are|can|tell me|describe|choose|decide|specify|please (?:pick|tell|describe|choose))\b|^(?:како|что|кто|каки|где|когда|как|почему|выбер|укаж|опиши|приведите)|请(?:问|选择|指出|描述|说明)|能否|是否|什么|哪些|哪[种个位条些]|为何|如何|どう|どの|でしょうか|ますか|何を|무엇|어떻게|어느|나요|까요|อะไร|อย่างไร|ไหม|หรือไม่/iu;
  const noItems = /^(?:null|undefined|true|false|\d+|none|n\/a|ok(?:ay)?|no (?:further )?(?:questions?|ideas?|suggestions?)\b.*|(?:i )?(?:don't|do not) have (?:any )?(?:questions?|ideas?).*|here (?:are|is) (?:some|the|a few|three|two|my) (?:questions?|ideas?).*|没有(?:需要|更多|问题|灵感|建议).*|暂无.*|无需(?:追问|提问).*|问题如下|以下(?:是|为).{0,12}(?:问题|灵感|建议)|нет (?:вопросов|идей).*|質問はありません.*|질문이 없습니다.*|ไม่มีคำถาม.*)[.!。！:：\s]*$/iu;
  const fieldLine = /^\s*(?:#{1,6}\s*|\*{1,2})?(?:name|description|personality|scenario|first_mes|mes_example|entries|keys|角色名|姓名|性格|人物设定|条目名|关键词|常驻|条目正文)\s*(?:\*{1,2})?\s*[:：]/imu;
  const serialisedField = /["'](?:character|world|entries|changes|first_mes|personality|scenario|operations)["']\s*:/iu;

  function invalid(task) {
    const message = task === "discuss"
      ? "模型没有返回讨论答复。可以重试，也可以把你的想法直接用于改稿。"
      : "模型没有返回可用的提问或灵感。";
    return Object.assign(new Error(root.TAI18n?.t(message) || message), { code: "dialogue-shape" });
  }
  function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function draftObject(value) {
    return record(value) && (Object.keys(value).some(key => draftKeys.has(key.toLowerCase())) ||
      ("name" in value && "description" in value) ||
      (typeof value.type === "string" && ["character", "card", "world", "worldbook", "entry"].includes(value.type.toLowerCase())));
  }
  function containsDraft(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 6) return false;
    return draftObject(value) || Object.values(value).some(item => containsDraft(item, depth + 1));
  }
  function decode(task, raw) {
    if (typeof raw !== "string") return raw;
    const text = raw.trim();
    if (text.length > 48000) throw invalid(task);
    const fence = text.match(/^(?:[^{}\[\]\n]{0,100}\n\s*)?~~~(?:json|text|markdown)?[ \t]*\r?\n([\s\S]*?)\r?\n~~~$/i)
      || text.match(/^(?:[^{}\[\]\n]{0,100}\n\s*)?\x60{3}(?:json|text|markdown)?[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}$/i);
    const prefix = !fence && text.match(/^[^{}\[\]\n]{1,90}[:：]\s*([\[{][\s\S]*)$/u);
    const body = (fence ? fence[1] : prefix ? prefix[1] : text).trim();
    if (/^[{\["]/.test(body)) {
      try { return JSON.parse(body); }
      catch (_) {
        // Keep ordinary quotations and Markdown links usable, but never display broken structured output.
        if (/^\s*\{|^\s*\[\s*(?:[\[{"\]]|$)/.test(body)) throw invalid(task);
      }
    }
    if (serialisedField.test(body) || fieldLine.test(body)) throw invalid(task);
    return body;
  }
  function clean(value) {
    return value.trim().replace(/^\*\*([\s\S]*?)\*\*$/u, "$1").trim();
  }
  function usable(value, task) {
    return value && value.length <= 1800 && !noItems.test(value) && !fieldLine.test(value) &&
      !serialisedField.test(value) && !/^(?:[{\[]\s*["'{\]]|\x60{3}|~~~)/u.test(value) &&
      (task === "ideas" || questionForm.test(value));
  }
  function listText(value, task, labeled) {
    const lines = value.replace(numberedInline, "$1\n$2").split(/\r?\n/u).map(clean).filter(Boolean);
    const marked = lines.some(line => listMarker.test(line));
    const result = [];
    for (let line of lines) {
      const hasMarker = listMarker.test(line);
      if (hasMarker) line = clean(line.replace(listMarker, ""));
      // An introductory heading is common before either a numbered list or a bare question.
      if (!line || /[:：]\s*$/u.test(line) || noItems.test(line)) continue;
      if (marked && !hasMarker && !result.length) continue;
      const parts = task === "questions" ? line.split(/(?<=[?？])[\s]+(?=\S)/u) : [line];
      for (const part of parts) {
        if (task === "ideas" && !labeled && !marked && part.length > 550) continue;
        if (usable(part, task)) result.push(part);
      }
    }
    return result;
  }
  function suggestions(task, value, labeled = false, depth = 0) {
    if (depth > 6 || value === null || value === undefined) return [];
    if (Array.isArray(value))
      return value.slice(0, 20).flatMap(item => suggestions(task, item, labeled, depth + 1));
    if (typeof value === "string") {
      const decoded = decode(task, value);
      if (typeof decoded === "string" && decoded === value.trim()) return listText(decoded, task, labeled);
      return suggestions(task, decoded, labeled, depth + 1);
    }
    if (!record(value) || draftObject(value)) return [];
    const field = lists[task].find(key => Object.hasOwn(value, key));
    if (field) return suggestions(task, value[field], true, depth + 1);
    if (task === "ideas" && typeof value.title === "string") {
      const detail = [value.description, value.text, value.content].find(part => typeof part === "string" && part.trim());
      const idea = detail && detail.trim() !== value.title.trim() ? value.title.trim() + " — " + detail.trim() : value.title;
      return listText(idea, task, true);
    }
    const key = ["prompt", ...wrappers].find(k => Object.hasOwn(value, k));
    return key ? suggestions(task, value[key], labeled, depth + 1) : [];
  }
  function replyText(value, depth = 0) {
    if (depth > 6) throw invalid("discuss");
    if (typeof value === "string") {
      const parsed = decode("discuss", value);
      if (typeof parsed !== "string" || parsed !== value.trim()) return replyText(parsed, depth + 1);
      if (parsed && !/^\s*(?:\{\s*\}|null|\[\s*\])\s*$/i.test(parsed)) return parsed;
    }
    if (Array.isArray(value) && value.length && value.every(part => record(part) && ["text", "output_text"].includes(part.type)))
      return value.map(part => replyText(part.text, depth + 1)).join("\n");
    if (record(value) && !containsDraft(value)) {
      const key = ["reply", "message", "content", "text", "result", "data"].find(k => Object.hasOwn(value, k));
      if (key) return replyText(value[key], depth + 1);
    }
    throw invalid("discuss");
  }
  function normalize(task, value) {
    if (typeof value === "string") value = decode(task, value);
    if (record(value) && (value.error || value.status === "error")) {
      const message = typeof value.error === "string" ? value.error : "模型未完成任务。";
      throw Object.assign(new Error(message), { code: "invalid-result" });
    }
    if (task === "discuss" ? containsDraft(value) : draftObject(value)) throw invalid(task);
    if (record(value) && (value.unsure || value.status === "needs_input")) {
      const question = suggestions("questions", value)[0];
      if (!question) throw invalid(task);
      if (task === "discuss") return { reply: question };
      throw Object.assign(new Error(question), { code: "needs-input" });
    }
    if (task === "discuss") return { reply: replyText(value) };
    const items = [...new Set(suggestions(task, value))].slice(0, 12);
    // A correctly shaped empty list is a valid provider result. The studio can offer a local starting point.
    if (!items.length && !(Array.isArray(value) && !value.length) &&
      !(record(value) && Array.isArray(value[task]) && !value[task].length)) throw invalid(task);
    return { [task]: items };
  }

  function options(task, result, error, context, locale) {
    if (error && !["dialogue-shape", "empty-output", "needs-input"].includes(error.code)) throw error;
    if (task === "questions" && error?.code === "needs-input")
      return { items: [error.message], local: false };
    if (result?.[task]?.length) return { items: result[task], local: false };
    return { items: root.NIJANDialogueText.localOptions(task, context, locale), local: true };
  }
  function answeredQuestions(answers, items, local) {
    const previous = new Map(answers.map(row => [row.question, row]));
    const rows = items.map(question => {
      const row = { question, answer: previous.get(question)?.answer || "" };
      if (local) row.local = true;
      return row;
    });
    const keep = answers.filter(row => typeof row.answer === "string" && row.answer.trim() && !items.includes(row.question));
    return [...keep, ...rows];
  }
  function availableIdeas(ideas, items, local) {
    const accepted = ideas.filter(idea => idea.accepted);
    const selected = new Set(accepted.map(idea => idea.text));
    return accepted.concat(items.filter(text => !selected.has(text)).map(text => ({ text, accepted: false, local })));
  }
  function lastDiscussion(history, status) {
    const latest = history.findLast(item => item.kind === "discussion" && item.role === "assistant" && item.text?.trim());
    if (latest) return latest;
    // Older sessions recorded this status only after a successful discussion reply.
    const oldReply = history.at(-1);
    if (status === "AI 已回复。可以继续沟通，或点击“按沟通更新所选模块”。" && oldReply?.role === "assistant" && oldReply.text?.trim())
      return oldReply;
  }
  function revisionInstruction(text, history, status) {
    if (text.trim()) return text.trim();
    const latest = lastDiscussion(history, status);
    if (!latest) return "";
    const reply = Array.from(latest.text);
    const excerpt = reply.slice(0, 360).join("") + (reply.length > 360 ? "…" : "");
    return root.TAI18n.t("dialogue.useLastDiscussion", { reply: excerpt });
  }

  root.NIJANCreativeDialogue = { decode, normalize, options, answeredQuestions, availableIdeas, lastDiscussion, revisionInstruction };
})(typeof globalThis !== "undefined" ? globalThis : window);
