/* Apply only the display settings supported by Quilvori. The saved theme is never changed here. */
(function (root) {
  'use strict';
  const cachedWallpapers = new WeakMap();
  const propertyPrefix = '--st-';
  let applied = new Map();

  function wallpaperUrl(asset) {
    if (!asset || asset.kind !== 'background' || typeof asset.dataUrl !== 'string') return '';
    const url = asset.dataUrl, parser = root.TAWallpaperImport;
    if (!parser?.inspect) return '';
    const cached = cachedWallpapers.get(asset);
    if (cached && cached.url === url && cached.mime === asset.mime) return cached.result;
    let result = '';
    // Check the encoded length before decoding. Never construct CSS from a filename or an unvalidated URL.
    if (url.length <= Math.ceil(parser.MAX_BYTES / 3) * 4 + 32) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
      if (match && match[2].length % 4 === 0 && (!asset.mime || asset.mime === match[1])) {
        try {
          const decoded = root.atob(match[2]);
          const bytes = new Uint8Array(decoded.length);
          for (let i=0; i<bytes.length; i++) bytes[i]=decoded.charCodeAt(i);
          if (parser.inspect(bytes).mime === match[1]) result = url;
        } catch (_) { /* Damaged images remain available for recovery in the library. */ }
      }
    }
    cachedWallpapers.set(asset,{url,mime:asset.mime,result});
    return result;
  }

  const color = (value,fallback) => typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback;
  const bounded = (value,fallback,max) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max,Math.max(0,value)) : fallback;
  const channels = hex => [1,3,5].map(at => parseInt(hex.slice(at,at+2),16));
  function blend(fg,bg,amount) {
    const rgb = channels(fg), backdrop = channels(bg);
    const opacity = amount ?? (fg.length === 9 ? parseInt(fg.slice(7),16)/255 : 1);
    return '#' + rgb.map((n,i) => Math.round(n*opacity+backdrop[i]*(1-opacity)).toString(16).padStart(2,'0')).join('');
  }
  function contrast(fg,bg) {
    function luminance(hex) {
      const [r,g,b] = channels(hex).map(c => c/255).map(c => c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
      return .2126*r+.7152*g+.0722*b;
    }
    const a=luminance(fg), b=luminance(bg);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }
  function readable(preferred,backgrounds) {
    const ratio = tint => Math.min(...backgrounds.map(surface => contrast(tint,surface)));
    const original = blend(preferred,backgrounds[0]);
    if (ratio(original) >= 4.5) return original;
    const target = ratio('#ffffff') >= ratio('#000000') ? '#ffffff' : '#000000';
    for (let i=1; i<20; i++) {
      const adjusted = blend(target,original,i/20);
      if (ratio(adjusted)>=4.5) return adjusted;
    }
    return target;
  }

  function apply(theme, library, resolved) {
    const body = root.document?.body;
    if (!body) return;
    const active = theme?.kind === 'sillytavern' && resolved?.useRooms === false;
    const values = new Map();
    let image = '';
    if (active) {
      const appearance = root.TAThemeFormat?.sanitizeAppearance(theme.appearance) || {};
      const palette = resolved.colors;
      const bg = color(palette.bg,'#20232b').slice(0,7), paper = color(palette.paper,bg).slice(0,7);
      const rail = color(palette.lacquer,bg).slice(0,7), ink = color(palette.ink,'#eeeeee');
      const accent = color(palette.accent,ink).slice(0,7);
      if (theme.backgroundAssetId) image = wallpaperUrl(library?.assets?.find(asset => asset.id === theme.backgroundAssetId));
      const panelOpacity = bounded(appearance.panelOpacity,.93,1);
      const chatOpacity = bounded(appearance.chatOpacity,.86,1);
      // The wallpaper sits beneath one continuous ink wash. Both extremes bound every possible picture pixel.
      const canvases = image ? ['#ffffff','#000000'].map(end => blend(bg,end,.80)) : [bg];
      const panelSurfaces = canvases.map(canvas => blend(paper,canvas,panelOpacity));
      const navSurfaces = canvases.map(canvas => blend(rail,canvas,panelOpacity));
      const chatSurfaces = canvases.map(canvas => blend(paper,canvas,chatOpacity));
      const control = blend(paper,bg,.85);
      const entryInk = readable(ink,[control]);
      const inkOnPanel = readable(ink,[paper,...panelSurfaces]);
      const accentOnPanel = readable(accent,[paper,...panelSurfaces]);
      const user = color(appearance.userTint,blend(accent,paper,.20));
      const bot = color(appearance.botTint,blend(ink,paper,.07));
      const blur = bounded(appearance.blur,0,30), shadowWidth = bounded(appearance.shadowWidth,2,16);
      for (const [key,value] of Object.entries({
        canvas:bg, panel:paper, rail, accent, 'canvas-ink':readable(ink,canvases),
        'canvas-muted':readable(blend(ink,bg,.74),canvases), 'canvas-accent':readable(accent,canvases),
        'panel-ink':inkOnPanel, 'panel-muted':readable(blend(ink,paper,.75),[paper,...panelSurfaces]),
        'panel-accent':accentOnPanel,'nav-ink':readable(ink,navSurfaces),
        'nav-muted':readable(blend(ink,rail,.75),navSurfaces),'nav-accent':readable(accent,navSurfaces),
        control,'control-ink':entryInk,'control-muted':readable(blend(ink,control,.70),[control]),
        danger:readable('#cc5558',[control]),'on-accent':readable(ink,[accent]),
        'font-scale':String(Math.max(.5,bounded(resolved.fontScale,1,2))),
        'panel-alpha':panelOpacity*100+'%','chat-alpha':chatOpacity*100+'%',blur:blur+'px',
        border:color(appearance.borderColor,blend(ink,paper,.22)),
        shadow:'0 '+(shadowWidth/2)+'px '+(shadowWidth*2)+'px '+color(appearance.shadowColor,'#00000038'),
        user,bot,'user-ink':readable(ink,chatSurfaces.map(bg => blend(user,bg))),
        'bot-ink':readable(ink,chatSurfaces.map(bg => blend(bot,bg))),
        italic:readable(color(appearance.italicColor,ink),[paper,...panelSurfaces]),
        quote:readable(color(appearance.quoteColor,accent),[paper,...panelSurfaces]),
        underline:readable(color(appearance.underlineColor,accent),[paper,...panelSurfaces]),
        scheme:contrast(paper,'#ffffff') > contrast(paper,'#000000') ? 'dark' : 'light',
      })) values.set(propertyPrefix+key,value);
      if (image) values.set(propertyPrefix+'wallpaper','url("'+image+'")');
    }
    for (const key of applied.keys()) if (!values.has(key)) body.style.removeProperty(key);
    for (const [key,value] of values) if (applied.get(key) !== value) body.style.setProperty(key,value);
    applied=values;
    body.toggleAttribute('data-imported-theme',active);
    body.classList.toggle('st-imported-theme',active);
    body.classList.toggle('st-theme-wallpaper',!!image);
  }

  const api={apply,wallpaperUrl};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.TAThemeAppearance=api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
