// @ts-check
/* Classic browser script. formats.js exposes these conversions through TAFormats. */
var TAPromptPresets = (() => {
  'use strict';

  /** @typedef {string | number} PromptId */
  /**
   * @typedef {object} PromptBlock
   * @property {PromptId} [id] Local library ID, assigned when the import is accepted.
   * @property {PromptId} [stIdentifier] Native identifier used in prompt_order.
   * @property {boolean} [stOrderOmitted]
   * @property {string} name
   * @property {string} role
   * @property {string} kind
   * @property {string} content
   * @property {boolean} enabled
   */
  /** @typedef {{id?: PromptId, name: string, blocks: PromptBlock[], stOrderCharacterId?: PromptId}} PromptPreset */
  /**
   * @typedef {object} NativePrompt
   * @property {PromptId} identifier
   * @property {string} name
   * @property {string} role
   * @property {string} content
   * @property {boolean} system_prompt
   * @property {boolean} enabled
   * @property {boolean} marker
   * @property {boolean} forbid_overrides
   * @property {number} injection_position
   * @property {number} injection_depth
   * @property {string} atelier_kind
   */
  /** @typedef {{character_id: PromptId, order: {identifier: PromptId, enabled: boolean}[]}} NativeOrder */
  /** @typedef {{format: 'tavern-atelier.prompt.v1', name: string, note: string, prompts: NativePrompt[], prompt_order: NativeOrder[]}} ExportedPreset */

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /** @param {string} field */
  function invalid(field) {
    return Object.assign(new Error('提示词预设字段格式无效'), {presetField: field});
  }

  /** @param {unknown} value @param {string} field @returns {unknown[]} */
  function list(value, field) {
    if (!Array.isArray(value)) throw invalid(field);
    return value;
  }

  /** @param {unknown} value @param {string} field */
  function text(value, field) {
    if (value == null) return undefined;
    if (typeof value !== 'string') throw invalid(field);
    return value;
  }

  /** @param {unknown} value @param {string} field */
  function flag(value, field) {
    if (value == null) return undefined;
    if (typeof value !== 'boolean') throw invalid(field);
    return value;
  }

  /** @param {unknown} value @param {string} field @returns {PromptId | undefined} */
  function identifier(value, field) {
    if (value == null || value === '') return undefined;
    if (typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))) return value;
    throw invalid(field);
  }

  /** @param {string} name */
  function kindFromName(name) {
    const lower = name.toLowerCase();
    if (lower.includes('author') || name.includes('作者')) return 'author_note';
    if (lower.includes('jail')) return 'jailbreak';
    if (lower.includes('style') || name.includes('文风')) return 'style';
    return 'system';
  }

  /** @param {unknown} json @returns {{character_id?: PromptId, order: unknown[], sourceIndex: number}[]} */
  function presetOrderScopes(json) {
    if (!record(json) || json.prompt_order == null) return [];
    const scopes = [];
    for (const [i, scope] of list(json.prompt_order, 'prompt_order').entries()) {
      const path = `prompt_order[${i}]`;
      if (scope == null) continue;
      if (!record(scope)) throw invalid(path);
      if (scope.order == null) continue;
      scopes.push({
        sourceIndex: i, character_id: identifier(scope.character_id, path + '.character_id'),
        order: list(scope.order, path + '.order'),
      });
    }
    return scopes;
  }

  /** @param {unknown} json @param {number} [scopeIndex] @returns {PromptPreset} */
  function presetFromImport(json, scopeIndex) {
    if (!record(json) || (json.prompts == null && json.blocks == null)) throw new Error('预设里没有 prompts');
    const key = json.prompts == null ? 'blocks' : 'prompts';
    const rows = list(json[key], key);
    /** @type {PromptPreset} */
    const preset = {name: text(json.name, 'name') || '导入的预设', blocks: []};
    /** @type {Map<string, PromptBlock>} */
    const byIdentifier = new Map();
    for (const [i, row] of rows.entries()) {
      const path = `${key}[${i}]`;
      if (row == null) continue;
      if (!record(row)) throw invalid(path);
      if (flag(row.marker, path + '.marker')) continue;
      const name = text(row.name, path + '.name') || '未命名块';
      let content = text(row.content, path + '.content');
      if (content === undefined) {
        // Some older files store text in system_prompt. Native ST uses it as a flag.
        content = typeof row.system_prompt === 'boolean' ? '' : text(row.system_prompt, path + '.system_prompt') ?? '';
      }
      /** @type {PromptBlock} */
      const block = {
        name, content, role: text(row.role, path + '.role') || 'system',
        kind: text(row.atelier_kind, path + '.atelier_kind') || kindFromName(name),
        enabled: flag(row.enabled, path + '.enabled') ?? true,
      };
      const idKey = row.identifier == null ? 'id' : 'identifier';
      const id = identifier(row[idKey], path + '.' + idKey);
      if (id !== undefined) {
        if (byIdentifier.has(String(id))) throw Object.assign(new Error('预设内有重复的提示块标识'), {presetField: path + '.' + idKey});
        block.stIdentifier = id;
        byIdentifier.set(String(id), block);
      }
      preset.blocks.push(block);
    }

    const scopes = presetOrderScopes(json);
    if (!scopes.length && scopeIndex === undefined) return preset;
    const index = scopeIndex ?? Math.max(0, scopes.findIndex(item => String(item.character_id) === '100001'));
    const scope = scopes[index];
    if (!scope) throw invalid(`prompt_order[${index}]`);
    /** @type {Set<PromptBlock>} */
    const ordered = new Set();
    for (const [i, row] of scope.order.entries()) {
      const path = `prompt_order[${scope.sourceIndex}].order[${i}]`;
      if (row == null) continue;
      if (!record(row)) throw invalid(path);
      const id = identifier(row.identifier, path + '.identifier');
      if (id === undefined) continue;
      const block = byIdentifier.get(String(id));
      if (!block || ordered.has(block)) continue;
      block.enabled = flag(row.enabled, path + '.enabled') ?? block.enabled;
      ordered.add(block);
    }
    const omitted = preset.blocks.filter(block => !ordered.has(block));
    for (const block of omitted) {
      block.enabled = false;
      block.stOrderOmitted = true;
    }
    preset.blocks = [...ordered, ...omitted];
    preset.stOrderCharacterId = scope.character_id ?? 100001;
    return preset;
  }

  /**
   * Older library records may omit optional block fields.
   * @param {{name?: string, blocks?: Partial<PromptBlock>[], stOrderCharacterId?: PromptId}} preset
   * @returns {ExportedPreset}
   */
  function presetToExport(preset) {
    /** @type {NativePrompt[]} */
    const prompts = [];
    /** @type {NativeOrder} */
    const scope = {character_id: preset.stOrderCharacterId ?? 100001, order: []};
    for (const [i, block] of (preset.blocks ?? []).entries()) {
      const id = block.stIdentifier ?? String(block.id ?? `atelier_${i}`);
      const role = block.role || 'system', enabled = block.enabled !== false;
      prompts.push({
        identifier: id, name: block.name || '未命名块', role, content: block.content ?? '',
        system_prompt: role === 'system', marker: false, enabled,
        injection_position: block.kind === 'author_note' ? 1 : 0,
        injection_depth: block.kind === 'author_note' ? 4 : 0,
        forbid_overrides: false, atelier_kind: block.kind || 'custom',
      });
      if (!block.stOrderOmitted || enabled) scope.order.push({identifier: id, enabled});
    }
    return {
      format: 'tavern-atelier.prompt.v1', name: preset.name || '提示词预设',
      note: '这是可抄进 SillyTavern 预设编辑器的块，不是整份 API 预设。不要用它覆盖温度和模型。',
      prompts, prompt_order: [scope],
    };
  }

  return {presetToExport, presetFromImport, presetOrderScopes};
})();
