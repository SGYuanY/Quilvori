/* Readable reports and verified addresses for both current and older results. */
(function (root) {
  "use strict";
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const tr=(value)=>root.TAI18n?root.TAI18n.t(value):value;
  const fields = () => root.NIJANAI.CARD_FIELDS;
  const entryFields = () => root.NIJANAI.ENTRY_FIELDS;
  function context(report, library) {
    try {
      const source = JSON.parse(report.source || "null");
      if (source && (source.card || source.book)) return source;
    } catch (_) {
      /* Older logs can still resolve against the current library. */
    }
    return {
      card:
        (library.characters || []).find((card) => card.id === report.cardId) ||
        null,
      book: root.NIJANAI.reviewBook(
        (library.worldBooks || []).find((book) => book.id === report.bookId) || null, report.entryIds),
    };
  }
  function candidates(report, library) {
    return root.NIJANAI.reviewPassages(context(report, library));
  }
  function key(source) {
    return JSON.stringify([
      source.target,
      source.bookId,
      source.id,
      source.field,
      source.arrayIndex,
    ]);
  }
  function address(source, quote, library) {
    const body = source.value,
      offset = quote ? body.indexOf(quote) : -1;
    const line = offset < 0 ? null : body.slice(0, offset).split("\n").length;
    const live =
      source.target === "character"
        ? (library.characters || []).find((card) => card.id === source.id)
        : (library.worldBooks || [])
            .find((book) => book.id === source.bookId)
            ?.entries.find((entry) => entry.id === source.id);
    const label =
      source.target === "character"
        ? `角色卡《${source.name}》 → ${fields()[source.field]}`
        : `世界书《${source.bookName}》 → 条目《${source.name}》 → ${entryFields()[source.field]}`;
    return {
      target: source.target,
      id: source.id,
      bookId: source.bookId,
      field: source.field,
      quote: quote || "",
      label:
        label +
        (source.arrayIndex === null
          ? line
            ? ` · 第 ${line} 行`
            : ""
          : ` · 第 ${source.arrayIndex + 1} 项`),
      exists: !!live,
      line,
      arrayIndex: source.arrayIndex,
    };
  }
  function resolve(quote, item, report, library, passages = candidates(report, library)) {
    const matches = root.NIJANAI.reviewMatches(passages, item, quote);
    const seen = new Set();
    return matches
      .filter((source) => {
        const id = key(source);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((source) => address(source, quote, library));
  }
  function readableText(value, report, library) {
    let text = String(value || "");
    const source = context(report, library);
    Object.entries(fields())
      .sort((a, b) => b[0].length - a[0].length)
      .forEach(([field, label]) => {
        text = text.split(`card.${field}`).join(`角色卡的“${label}”栏`);
        text = text.split(`character.${field}`).join(`角色卡的“${label}”栏`);
      });
    [...(source.book?.entries || [])]
      .sort((a, b) => String(b.id).length - String(a.id).length)
      .forEach((entry) => {
        text = text
          .split(`book.${entry.id}`)
          .join(`世界书条目《${entry.comment || "未命名"}》`);
        text = text
          .split(entry.id)
          .join(`条目《${entry.comment || "未命名"}》`);
      });
    return text
      .replace(/\bbook(?=[\u3400-\u9fff])/g, "世界书")
      .replace(/\bcard(?=[\u3400-\u9fff])/g, "角色卡")
      .replace(/\\"/g, '"')
      .replace(/；\s*/g, "；\n");
  }
  function quoteText(value) {
    const text = String(value || "");
    try {
      const parsed = JSON.parse(
        text.trim().startsWith("{") ? text : `{${text}}`,
      );
      if (parsed && !Array.isArray(parsed) && typeof parsed === "object")
        return Object.entries(parsed)
          .map(
            ([name, value]) =>
              `${name}：${typeof value === "object" ? JSON.stringify(value) : value}`,
          )
          .join("\n");
    } catch (_) {
      /* Preserve ordinary prose exactly. */
    }
    return text;
  }
  function readable(item, report, library, passages = candidates(report, library)) {
    const severity = root.NIJANAI.reviewSeverity(item, passages);
    const evidence = (item.evidence || []).map((quote) => ({
      quote,
      locations: resolve(quote, item, report, library, passages),
    }));
    const seen = new Set(),
      locations = evidence
        .flatMap((row) => row.locations)
        .filter((source) => {
          const id = key(source);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
    const first = evidence[0],
      firstSource = first?.locations[0];
    const other =
      evidence.find(
        (row) =>
          row !== first &&
          row.locations.some(
            (source) =>
              !firstSource ||
              source.target !== firstSource.target ||
              source.id !== firstSource.id,
          ),
      ) || evidence[1];
    const snippet = (row) => {
      const text = quoteText(row.quote).replace(/\s+/g, " ").trim();
      return text.length > 100 ? `${text.slice(0, 100)}…` : text;
    };
    const legacyConclusion =
      severity === "error" && first && other
        ? `模型把两处写法放在一起核对：\n一处写“${snippet(first)}”；\n另一处写“${snippet(other)}”。`
        : "模型认为这处设定需要核对，具体原因和原文见下方。";
    return {
      title: readableText(item.title, report, library),
      severity,
      kind: item.kind,
      conclusion: readableText(
        item.conclusion || legacyConclusion,
        report,
        library,
      ),
      reason: readableText(item.detail, report, library),
      suggestion: readableText(
        item.suggestion ||
          "先核对下方原文，确认是否为同一个人、同一时间或同一剧情分支，再决定需要修改哪一处。",
        report,
        library,
      ),
      locations,
      evidence,
    };
  }
  function sourceLink(source) {
    const payload = escape(JSON.stringify(source));
    return `<div class="review-address"><span>${escape(source.label)}</span><button type="button" class="btn btn-small" data-review-source="${payload}" aria-label="定位原文：${escape(source.label)}" ${source.exists ? "" : "disabled"}>${escape(tr(source.exists ? "定位原文" : "原条目已不存在"))}</button></div>`;
  }
  function gradedReport(report, library) {
    const passages = candidates(report, library);
    return {...report, items:(report.items || []).map(item =>
      ({...item, severity:root.NIJANAI.reviewSeverity(item, passages)}))};
  }
  function html(report, library) {
    const passages = candidates(report, library);
    const items = (report.items || []).map(item => readable(item, report, library, passages)),
      error = items.filter((item) => item.severity === "error").length,
      warn = items.filter((item) => item.severity === "warn").length;
    const summary = items.length
      ? (root.TAI18n?.t("review.counts", {total:items.length, error, warn, info:items.length-error-warn})
        ?? `共 ${items.length} 项，${error} 项模型判为冲突，${warn} 项需要确认，${items.length-error-warn} 项提示。`)
      : tr("这次检查未发现有原文证据支持的冲突。");
    return `<div class="review-readable"><p class="review-overview">${escape(summary)}</p>${items
      .map((view, index) => {
        const status =
            { error: "模型判为冲突", warn: "需要确认", info: "提示" }[
              view.severity
            ] || "需要确认";
        return `<article class="ai-finding review-card"><div class="review-heading"><span class="tag">${escape(tr(status))}</span><span class="help">${escape(tr(view.kind === "persona" ? "人物设定" : "设定逻辑"))}</span><h4>${index + 1}. ${escape(view.title)}</h4></div><div class="review-section"><strong>${escape(tr("简单说"))}</strong><p>${escape(view.conclusion)}</p></div>${view.reason ? `<div class="review-section"><strong>${escape(tr("为什么"))}</strong><p>${escape(view.reason)}</p></div>` : ""}<div class="review-section"><strong>${escape(tr("建议怎么处理"))}</strong><p>${escape(view.suggestion)}</p></div><div class="review-section"><strong>${escape(tr("涉及条目与地址"))}</strong>${view.locations.map(sourceLink).join("") || '<p class="help">未能从引用中核实具体栏位，暂不提供跳转，避免定位到错误条目。</p>'}</div><details class="review-evidence"><summary>对照原文（${view.evidence.length} 处引用）</summary>${view.evidence.map((row, i) => `<section class="review-quote"><b>原文 ${i + 1}</b>${row.locations.map(sourceLink).join("") || '<p class="help">这段引用的来源未能定位。</p>'}<blockquote>${escape(quoteText(row.quote))}</blockquote></section>`).join("")}</details></article>`;
      })
      .join("")}</div>`;
  }
  function bind(host, report) {
    if (!host) return;
    host.onclick = (event) => {
      const button = event.target.closest("[data-review-source]");
      if (!button || !host.contains(button)) return;
      try {
        root.NIJANStudio.openSource(
          JSON.parse(button.dataset.reviewSource),
          report,
        );
      } catch (error) {
        root.TAUI.toast(error.message);
      }
    };
  }
  function mount(host, report, library) {
    host.innerHTML = html(report, library);
    bind(host, report);
  }
  root.NIJANReview = {
    context,
    resolve,
    readable,
    gradedReport,
    quoteText,
    html,
    bind,
    mount,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
