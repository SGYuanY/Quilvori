/* Disposable Workers keep a single slow match isolated, including on file: pages. */
(function (root) {
  'use strict';
  function workerMain(makeEngine, messages) {
    const engine = makeEngine((key, vars) => {
      const label = Object.hasOwn(messages, key) ? messages[key] : key;
      return vars ? label.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(vars,name) ? String(vars[name]) : match) : label;
    });
    self.onmessage = ({data}) => {
      const results = data.samples.map(sample => {
        const result = engine.regexTrial(data.pattern,sample,data.replacement);
        delete result.pattern;
        return result;
      });
      self.postMessage(results);
    };
  }

  let sourceUrl, sourceLanguage;
  function startWorker() {
    const lang = root.TAI18n?.prefs.lang || 'zh';
    if (!sourceUrl || sourceLanguage !== lang) {
      const messages = root.TAI18n?.workerMessages('rx.') || {};
      // Only shipped functions and interface strings enter the script. Authored text
      // travels separately through postMessage. Blob Workers also work offline.
      const source = '(' + workerMain.toString() + ')(' +
        root.TAFormats.createRegexEngine.toString() + ',' + JSON.stringify(messages) + ');';
      const next = URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      sourceUrl = next;
      sourceLanguage = lang;
    }
    return new Worker(sourceUrl);
  }
  const stopped = '正则试跑已取消。';
  const timedOut = '正则试跑已超时，请调整表达式或缩短样例。';
  const unavailable = '无法启动正则测试线程，请重新打开工作台。';

  function createRunner() {
    let pending;
    function cancel() { if (pending) pending(new Error(stopped)); }
    function run(pattern, samples, replacement) {
      cancel();
      return new Promise((resolve,reject) => {
        let worker, timer;
        function finish(error, value) {
          if (pending !== finish) return;
          pending = undefined;
          clearTimeout(timer);
          worker?.terminate();
          if (error) reject(error); else resolve(value);
        }
        pending = finish;
        try {
          worker = startWorker();
          worker.onmessage = event => finish(null,event.data);
          worker.onerror = worker.onmessageerror = () => finish(new Error('正则试跑失败，请检查表达式。'));
          timer = setTimeout(() => finish(new Error(timedOut)),1500);
          worker.postMessage({pattern,samples,replacement});
        } catch (_) { finish(new Error(unavailable)); }
      });
    }
    return {run,cancel};
  }
  root.TARegexRunner = {createRunner};
})(globalThis);
