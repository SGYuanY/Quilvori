// Compare only the records touched by an ordinary edit. A replacement or an
// unknown writer invalidates the database baseline before this code is called.
(() => {
  type Id = string | number;
  type Fields = Record<string, unknown>;
  interface Pair {
    collection: string;
    id: Id;
    saved: Fields;
    local: Fields;
    overlapping: boolean;
  }
  interface Change {
    key: string;
    collection: string;
    id: Id;
    field: string;
    name: string;
    saved: unknown;
    local: unknown;
    removed: boolean;
    review: boolean;
  }
  function compare(pairs: Pair[]): Change[] {
    const changes: Change[] = [];
    for (const {collection,id,saved,local,overlapping} of pairs) {
      for (const field of new Set([...Object.keys(saved),...Object.keys(local)])) {
        if (field === 'id' || (field === 'updatedAt' && overlapping)) continue;
        const hasLocal=Object.hasOwn(local,field), hasSaved=Object.hasOwn(saved,field);
        if (hasLocal===hasSaved && JSON.stringify(saved[field])===JSON.stringify(local[field])) continue;
        changes.push({key:JSON.stringify([collection,id,field]),collection,id,field,
          name:String(saved.name || saved.scriptName || id),saved:saved[field],local:local[field],
          removed:!hasLocal,review:overlapping});
      }
    }
    return changes;
  }
  function apply(target: Fields, change: Change) {
    if (change.removed) delete target[change.field];
    else Object.defineProperty(target,change.field,{value:change.local,enumerable:true,configurable:true,writable:true});
  }
  Object.assign(globalThis,{TARecordEdits:{compare,apply}});
})();
