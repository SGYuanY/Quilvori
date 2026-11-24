/* Public-source browsing only. Imports are delegated to the catalog's existing workflow. */
(function (root) {
  'use strict';
  const UI = () => root.TAUI;
  const tr = key => UI().t(key);
  const esc = value => UI().esc(value);
  const icon = name => root.TAWorkspace?.icon(name) || '';
  const TYPE_LABEL = { character: '角色卡', world: '世界书', wallpaper: '壁纸' };
  const LICENSE_LABEL = { personal: '仅限个人使用', redistributable: '允许转载', unknown: '请查看原帖说明' };
  const preferences = { type: 'all', query: '' };

  const list = value => Array.isArray(value) ? value : [];
  function safeLink(value) {
    return root.TAResourceSource?.sourceUrl(value) || '';
  }
  function safeImage(value) {
    if (typeof value !== 'string') return '';
    const source = value.trim();
    if (/^data:image\/(?:png|jpeg|webp|avif|gif);base64,/i.test(source)) return source;
    if (!source || /[\u0000-\u0020\u007f\\]/.test(source)) return '';
    try {
      const base = new URL('.', location.href), url = new URL(source, base);
      // Bundled thumbnails must remain under this application directory, including file://.
      if (!/^[a-z][a-z0-9+.-]*:/i.test(source) && !source.startsWith('//')) {
        const path = decodeURIComponent(url.pathname), basePath = decodeURIComponent(base.pathname);
        if (path.includes('\\') || url.protocol !== base.protocol || url.host !== base.host || !path.startsWith(basePath) || path.slice(basePath.length).split('/').some(part => part === '..' || part === '.')) return '';
        return url.href;
      }
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (_) { return ''; }
  }
  function authorMarkup(entry) {
    const name = entry.author?.name || tr('未署名'), url = safeLink(entry.author?.profileUrl);
    return url ? `<a class="resource-author" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(tr('作者主页'))} · ${esc(name)}" data-no-translate>${esc(name)}</a>` : `<span class="resource-author" data-no-translate>${esc(name)}</span>`;
  }
  function imageMarkup(entry, className = '', eager = false) {
    const source = safeImage(entry.image?.src), title = entry.title || '';
    return `<span class="resource-image ${className}${source ? '' : ' is-unavailable'}" data-resource-image>${source ? `<img src="${esc(source)}" alt="${esc(title)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" data-no-translate>` : ''}<span class="resource-image-fallback">${icon('assets')}<span>${tr(source ? '原图暂未加载' : '尚未提供原图')}</span></span></span>`;
  }
  function wireImages(host) {
    host.querySelectorAll('[data-resource-image] img').forEach(image => {
      const failed = () => { image.closest('[data-resource-image]')?.classList.add('is-unavailable'); image.hidden = true; };
      image.addEventListener('error', failed, { once: true });
      if (image.complete && !image.naturalWidth) failed();
    });
  }
  function licenseMarkup(entry) {
    return `<span class="resource-license resource-license-${entry.license?.status === 'redistributable' ? 'permitted' : 'source'}">${icon(entry.license?.status === 'redistributable' ? 'checkmark' : 'lore')}${tr(LICENSE_LABEL[entry.license?.status] || LICENSE_LABEL.unknown)}</span>`;
  }

  function render(stage) {
    const entries = list(root.TAResourceCatalog?.entries).filter(entry => entry && Object.hasOwn(TYPE_LABEL, entry.type) && typeof entry.id === 'string' && entry.id);
    stage.innerHTML = `<section class="resource-directory" aria-labelledby="resource-heading">
      <header class="resource-heading"><div><span class="resource-imprint" aria-hidden="true">QUILVORI · SOURCES</span><h2 id="resource-heading">${tr('资源目录')}</h2><p>${tr('看看作者的作品，再带回你的收藏室。')}</p></div><span class="resource-heading-mark" aria-hidden="true">${icon('lore')}</span></header>
      <div class="resource-toolbar"><div class="resource-filters" role="group" aria-label="${esc(tr('资源目录'))}">${[['all','全部'],...Object.entries(TYPE_LABEL)].map(([type,label]) => `<button type="button" data-resource-filter="${type}" aria-pressed="${preferences.type === type}"><span>${tr(label)}</span><small>${type === 'all' ? entries.length : entries.filter(entry => entry.type === type).length}</small></button>`).join('')}</div><label class="resource-search">${icon('search')}<input type="search" data-resource-search aria-label="${esc(tr('搜索作品、作者、标签'))}" placeholder="${esc(tr('搜索作品、作者、标签'))}" value="${esc(preferences.query)}" autocomplete="off"></label></div>
      <div class="resource-grid" data-resource-grid></div><p class="resource-count" data-resource-count role="status" aria-live="polite"></p>
      <dialog class="resource-dialog" aria-labelledby="resource-detail-title" data-resource-dialog></dialog>
      <dialog class="resource-lightbox" aria-label="${esc(tr('放大原图'))}" data-resource-lightbox></dialog>
    </section>`;
    const host = stage.querySelector('.resource-directory'), grid = host.querySelector('[data-resource-grid]');
    const dialog = host.querySelector('[data-resource-dialog]'), lightbox = host.querySelector('[data-resource-lightbox]');
    let returnFocus = null, openEntry = null, importing = false;
    const find = id => entries.find(entry => String(entry.id) === String(id));
    const paint = () => {
      const query = preferences.query.trim().toLocaleLowerCase();
      const visible = entries.filter(entry => (preferences.type === 'all' || entry.type === preferences.type) && (!query || [entry.title,entry.description,entry.author?.name,...list(entry.tags)].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
      host.querySelectorAll('[data-resource-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.resourceFilter === preferences.type)));
      host.querySelector('[data-resource-count]').textContent = `${visible.length} ${tr('项资源')}`;
      grid.innerHTML = visible.map(entry => {
        const id = esc(entry.id), post = safeLink(entry.postUrl);
        return `<article class="resource-card resource-card-${entry.type}"><button type="button" class="resource-art" data-resource-open="${id}" aria-label="${esc(tr('查看详情'))} · ${esc(entry.title)}">${imageMarkup(entry)}<span class="resource-type">${tr(TYPE_LABEL[entry.type])}</span><span class="resource-art-action">${icon('eye')}${tr('查看详情')}</span></button>
          <div class="resource-card-body"><h3><button type="button" data-resource-open="${id}" data-no-translate>${esc(entry.title)}</button></h3><div class="resource-byline"><span>${tr('作者')}</span>${authorMarkup(entry)}</div><p class="resource-description" data-no-translate>${esc(entry.description || '')}</p><div class="resource-card-footer">${licenseMarkup(entry)}${post ? `<a href="${esc(post)}" target="_blank" rel="noopener noreferrer">${tr('打开原帖')}${icon('arrow')}</a>` : ''}</div></div></article>`;
      }).join('') || `<div class="resource-empty">${icon('lore')}<h3>${tr(entries.length ? '没有找到这件作品' : '还没有收录作品')}</h3>${entries.length ? `<p>${tr('换个关键词，或看看其他分类。')}</p><button type="button" class="btn" data-resource-reset>${tr('清除筛选')}</button>` : ''}</div>`;
      wireImages(grid);
    };
    const closeDetails = (restore = true) => {
      if (lightbox.open) lightbox.close();
      if (dialog.open) dialog.close();
      openEntry = null;
      if (restore && returnFocus?.isConnected) returnFocus.focus();
    };
    const showDetails = (entry, trigger) => {
      if (!entry) return;
      if (!dialog.open) returnFocus = trigger || document.activeElement;
      openEntry = entry;
      const post = safeLink(entry.postUrl), related = list(entry.relatedIds).map(find).filter(item => item && item.id !== entry.id).slice(0, 4);
      dialog.innerHTML = `<header class="resource-detail-heading"><span>${tr(TYPE_LABEL[entry.type])}</span><button type="button" class="resource-icon-button" data-resource-close aria-label="${esc(tr('关闭'))}">${icon('close')}</button></header><div class="resource-detail-body"><div class="resource-detail-visual"><button type="button" class="resource-detail-art" data-resource-zoom disabled aria-label="${esc(tr('放大原图'))}">${imageMarkup(entry,'resource-detail-image',true)}<span class="resource-zoom-hint">${icon('focus')}${tr('放大原图')}</span></button>${entry.image?.credit ? `<p class="resource-image-credit"><span>${tr('图片署名')}</span><span data-no-translate>${esc(entry.image.credit)}</span></p>` : ''}</div><div class="resource-detail-copy"><h2 id="resource-detail-title" data-no-translate>${esc(entry.title)}</h2><div class="resource-byline"><span>${tr('作者')}</span>${authorMarkup(entry)}</div>${list(entry.tags).length ? `<div class="resource-tags" data-no-translate>${list(entry.tags).map(tag => `<span>${esc(tag)}</span>`).join('')}</div>` : ''}<section class="resource-detail-section"><h3>${tr('作品简介')}</h3><p data-no-translate>${esc(entry.description || '')}</p></section><section class="resource-detail-section resource-use-note"><h3>${tr('使用说明')}</h3>${licenseMarkup(entry)}${entry.license?.note ? `<p data-no-translate>${esc(entry.license.note)}</p>` : ''}</section>${related.length ? `<section class="resource-detail-section"><h3>${tr('相关作品')}</h3><div class="resource-related">${related.map(item => `<button type="button" data-resource-related="${esc(item.id)}">${imageMarkup(item)}<span><strong data-no-translate>${esc(item.title)}</strong><small>${tr(TYPE_LABEL[item.type])}</small></span>${icon('chevron')}</button>`).join('')}</div></section>` : ''}<div class="resource-detail-actions"><button type="button" class="btn btn-primary" data-resource-import>${icon(entry.type === 'wallpaper' ? 'assets' : 'plus')}<span>${tr(entry.type === 'wallpaper' ? '获取壁纸' : '导入到本地')}</span></button>${post ? `<a class="btn" href="${esc(post)}" target="_blank" rel="noopener noreferrer">${tr('打开原帖')}${icon('arrow')}</a>` : ''}</div><p class="resource-author-support">${tr('请尽量支持原作者。喜欢这份作品的话，请到原帖评论区，毫不吝啬地留下您的赞赏。您的赞赏，才是他们最大的动力。')}</p>${!entry.files?.length && entry.type !== 'wallpaper' ? `<p class="resource-import-note">${tr('从原帖复制附件链接，再确认导入。')}</p>` : ''}</div></div>`;
      wireImages(dialog);
      const zoomButton = dialog.querySelector('[data-resource-zoom]'), detailImage = zoomButton.querySelector('img');
      const syncZoom = () => { zoomButton.disabled = !detailImage || detailImage.hidden || !detailImage.complete || !detailImage.naturalWidth; };
      detailImage?.addEventListener('load', syncZoom, { once: true });
      detailImage?.addEventListener('error', syncZoom, { once: true }); syncZoom();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('[data-resource-close]').focus();
    };
    const zoom = entry => {
      const image = dialog.querySelector('.resource-detail-image img');
      if (!entry || !image || image.hidden || !image.complete || !image.naturalWidth) return;
      lightbox.innerHTML = `<div class="resource-lightbox-bar"><span data-no-translate>${esc(entry.title)}</span><button type="button" class="resource-icon-button" data-resource-zoom-close aria-label="${esc(tr('关闭大图'))}">${icon('close')}</button></div>${imageMarkup(entry,'resource-full-image',true)}${entry.image?.credit ? `<p class="resource-lightbox-credit" data-no-translate>${esc(entry.image.credit)}</p>` : ''}`;
      wireImages(lightbox); lightbox.showModal(); lightbox.querySelector('button').focus();
    };
    const importEntry = async entry => {
      if (!entry || importing) return;
      importing = true;
      const button = dialog.querySelector('[data-resource-import]');
      if (button) { button.disabled = true; button.textContent = tr('正在打开导入…'); }
      // The importer owns preview, permission checks, actual writes, and result feedback.
      closeDetails(false);
      try {
        if (typeof root.TAResourceCatalog?.importResource !== 'function') throw new Error('missing-importer');
        await root.TAResourceCatalog.importResource(entry);
      } catch (_) { UI().toast(tr('暂时无法打开导入，请稍后再试。'), { kind: 'error' }); if (returnFocus?.isConnected) returnFocus.focus(); }
      finally { importing = false; }
    };
    host.querySelector('[data-resource-search]').oninput = event => { preferences.query = event.target.value; paint(); };
    host.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button || !host.contains(button)) return;
      if (button.hasAttribute('data-resource-filter')) { preferences.type = button.dataset.resourceFilter; paint(); }
      else if (button.hasAttribute('data-resource-reset')) { preferences.type = 'all'; preferences.query = ''; host.querySelector('[data-resource-search]').value = ''; paint(); }
      else if (button.hasAttribute('data-resource-open')) showDetails(find(button.dataset.resourceOpen), button);
      else if (button.hasAttribute('data-resource-related')) showDetails(find(button.dataset.resourceRelated));
      else if (button.hasAttribute('data-resource-close')) closeDetails();
      else if (button.hasAttribute('data-resource-zoom')) zoom(openEntry);
      else if (button.hasAttribute('data-resource-zoom-close')) { lightbox.close(); dialog.querySelector('[data-resource-zoom]')?.focus(); }
      else if (button.hasAttribute('data-resource-import')) importEntry(openEntry);
    });
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDetails(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDetails(); });
    lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
    lightbox.addEventListener('cancel', event => { event.preventDefault(); lightbox.close(); dialog.querySelector('[data-resource-zoom]')?.focus(); });
    // Stop page-level shortcuts from dismissing a different modal underneath this one.
    for (const modal of [dialog,lightbox]) modal.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    paint();
  }
  root.TAResourcePanel = { render };
})(typeof globalThis !== 'undefined' ? globalThis : window);
