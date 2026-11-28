/* Creation inputs and pending-draft revisions. These helpers never write storage. */
(function (root) {
  "use strict";
  const copy = (value) => root.NIJANAI.copy(value);
  const pathKey = (op) => JSON.stringify(op.path);
  const at = (lib, path) => path.reduce((value, key) => value?.[key], lib);
  function modulesForDraft(plan, plans) {
    const requested=plan.creationInput?.modules;
    if(Array.isArray(requested))return requested.slice();
    // Older drafts only captured the brief and sources. Recover the modules
    // actually present in this batch, in the same order as the creation UI.
    const present=new Set([plan.task]);
    for(const other of plans)if(other?.batchId===plan.batchId)present.add(other.task);
    return Object.keys(root.NIJANAI.MODULES).filter(kind=>present.has('create:'+kind));
  }
  function selectedIdeas(ideas) {
    return (ideas || [])
      .filter(
        (idea) =>
          idea.accepted === true &&
          typeof idea.text === "string" &&
          idea.text.trim(),
      )
      .map((idea) => idea.text);
  }
  function context(state, options = {}) {
    return {
      brief: state.brief,
      modules: copy(state.modules || []),
      answers: copy((state.answers || []).filter(item => typeof item.answer === 'string' && item.answer.trim())),
      ideas: selectedIdeas(state.ideas),
      history: copy(
        (state.creationHistory || []).map(({ role, text }) => ({ role, text })),
      ),
      instruction: options.instruction || "",
      previousDrafts: copy(options.previousDrafts || {}),
      currentDraft: copy(options.currentDraft || null),
      created: copy(options.created || {}),
      reference: copy(options.reference || {}),
      availableCharacters: copy(options.availableCharacters || []),
    };
  }
  function mergeResult(previous, next) {
    if (!previous) return copy(next);
    const result = copy(next);
    Object.keys(result).forEach((module) => {
      result[module] = Object.assign(
        {},
        copy(previous[module] || {}),
        result[module],
      );
      for (const field of ["entries", "blocks", "replies"]) {
        if (
          !Array.isArray(result[module][field]) ||
          !Array.isArray(previous[module]?.[field])
        )
          continue;
        const id =
          field === "entries"
            ? "comment"
            : field === "blocks"
              ? "name"
              : "label";
        result[module][field] = result[module][field].map((item) => {
          const matches = previous[module][field].filter(
            (old) => old[id] === item[id],
          );
          return matches.length === 1
            ? Object.assign({}, copy(matches[0]), item)
            : item;
        });
      }
    });
    return result;
  }
  function preserveIds(plan, previous) {
    if (!previous) return plan;
    const reused = new Set(),
      ids = new Map();
    plan.operations
      .filter((op) => op.kind === "add")
      .forEach((op) => {
        const candidates = previous.operations.filter(
          (old) =>
            old.kind === "add" &&
            pathKey(old) === pathKey(op) &&
            !reused.has(old.key),
        );
        const peers = plan.operations.filter(
          (row) => row.kind === "add" && pathKey(row) === pathKey(op),
        );
        const identity = (value) =>
          value.label || value.title || value.name || value.scriptName;
        const exact = candidates.filter(
          (old) =>
            identity(old.value) && identity(old.value) === identity(op.value),
        );
        const old =
          exact.length === 1
            ? exact[0]
            : peers.length === 1 && candidates.length === 1
              ? candidates[0]
              : null;
        if (!old) return;
        reused.add(old.key);
        ids.set(op.value.id, old.value.id);
        op.value.id = old.value.id;
        for (const [field, label] of [
          ["entries", "comment"],
          ["blocks", "name"],
          ["replies", "label"],
        ]) {
          (op.value[field] || []).forEach((item) => {
            const matches = (old.value[field] || []).filter(
              (row) => row[label] === item[label],
            );
            if (matches.length === 1 && matches[0].id) item.id = matches[0].id;
          });
        }
      });
    plan.operations
      .filter((op) => op.path[0] === "graph" && op.path[1] === "edges")
      .forEach((op) => {
        op.value.from = ids.get(op.value.from) || op.value.from;
        op.value.to = ids.get(op.value.to) || op.value.to;
      });
    return plan;
  }
  function withdraw(virtual, plan) {
    if (!plan) return;
    // Only call on the private virtual library used during generation.
    plan.operations
      .filter((op) => !op.applied)
      .slice()
      .reverse()
      .forEach((op) => {
        const collection = at(virtual, op.path);
        if (op.kind === "add") {
          const index = collection.findIndex((item) => item.id === op.value.id);
          if (index >= 0) collection.splice(index, 1);
        } else {
          const owner = op.id!=null
            ? (collection || []).find((item) => item.id === op.id)
            : collection;
          const dest = op.entryId!=null
            ? owner?.entries.find((entry) => entry.id === op.entryId)
            : owner;
          if (dest) {
            if (op.before === undefined) delete dest[op.field];
            else dest[op.field] = copy(op.before);
          }
        }
      });
  }
  function refinePlan(virtual, plan, result, context) {
    const AI = root.NIJANAI,
      module = plan.task.slice(7);
    if (
      !["character", "world"].includes(module) ||
      plan.operations.some((op) => op.applied)
    )
      throw new Error("只能在这里调整尚未应用的角色卡或世界书样稿。");
    const source = plan.operations.find(
      (op) =>
        op.kind === "add" &&
        op.path[0] === (module === "character" ? "characters" : "worldBooks"),
    );
    if (!source) throw new Error("没有找到可调整的样稿。");
    const changes = AI.proposal(virtual, "edit", result, context);
    if (!changes.operations.length) return { plan: copy(plan), count: 0 };
    AI.commit(virtual, changes);
    const updated = at(virtual, source.path).find(
        (item) => item.id === source.value.id,
      ),
      next = copy(plan);
    next.operations.find((op) => op.key === source.key).value = copy(updated);
    if (module === "character")
      next.result = {
        character: Object.fromEntries(
          Object.keys(AI.CARD_FIELDS)
            .filter((field) => Object.hasOwn(updated, field))
            .map((field) => [field, copy(updated[field])]),
        ),
      };
    else
      next.result = {
        world: {
          name: updated.name,
          entries: updated.entries.map((entry) =>
            Object.fromEntries(
              [
                ...Object.keys(AI.ENTRY_FIELDS),
                "constant",
                "enabled",
                "position",
                "depth",
                "order",
                "selective",
              ]
                .filter((field) => Object.hasOwn(entry, field))
                .map((field) => [field, copy(entry[field])]),
            ),
          ),
        },
      };
    next.draftDiff = copy(changes.operations);
    next.request = context.instruction;
    return { plan: next, count: changes.operations.length };
  }
  root.NIJANCreation = {
    selectedIdeas,
    context,
    mergeResult,
    preserveIds,
    modulesForDraft,
    withdraw,
    refinePlan,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
