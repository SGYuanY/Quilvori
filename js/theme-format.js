/* Read static SillyTavern theme values without applying the source stylesheet. */
(function (root) {
  'use strict';

  const MAX_BYTES = 2 * 1024 * 1024;
  const colorKeys = {
    main_text_color: 'ink', blur_tint_color: 'panel', chat_tint_color: 'chat',
    italics_text_color: 'italicColor', quote_text_color: 'quoteColor', underline_text_color: 'underlineColor',
    user_mes_blur_tint_color: 'userTint', bot_mes_blur_tint_color: 'botTint',
    border_color: 'borderColor', shadow_color: 'shadowColor', fastui_bg_color: 'legacyPanel',
  };
  const numericKeys = {font_scale:'fontScale', blur_strength:'blur', shadow_width:'shadowWidth', bubble_radius:'radius'};
  const ranges = {panelOpacity:[0,1], chatOpacity:[0,1], fontScale:[0.5,1.5], blur:[0,30], shadowWidth:[0,5], radius:[0,28]};
  const nativeFlags = new Set([
    'fast_ui_mode','noShadows','waifuMode','timer_enabled','timestamps_enabled','timestamp_model_icon',
    'mesIDDisplay_enabled','hideChatAvatars_enabled','message_token_count_enabled','expand_message_actions',
    'enableZenSliders','enableLabMode','hotswap_enabled','bogus_folders','zoomed_avatar_magnification',
    'reduced_motion','compact_input_area','show_swipe_num_all_messages','click_to_edit',
  ]);
  const nativeSelects = {
    avatar_style:[0,1,2,3], chat_display:[0,1,2], media_display:['list','gallery'],
    toastr_position:['toast-top-left','toast-top-center','toast-top-right','toast-bottom-left','toast-bottom-center','toast-bottom-right'],
  };
  const reserved = new Set(['__proto__','prototype','constructor']);
  const detailColors = ['shadowColor','borderColor','userTint','botTint','italicColor','quoteColor','underlineColor'];
  const cssKeys = {
    '--SmartThemeBodyColor':'main_text_color', '--SmartThemeBlurTintColor':'blur_tint_color',
    '--SmartThemeChatTintColor':'chat_tint_color', '--SmartThemeEmColor':'italics_text_color',
    '--SmartThemeQuoteColor':'quote_text_color', '--SmartThemeUnderlineColor':'underline_text_color',
    '--SmartThemeUserMesBlurTintColor':'user_mes_blur_tint_color', '--SmartThemeBotMesBlurTintColor':'bot_mes_blur_tint_color',
    '--SmartThemeShadowColor':'shadow_color', '--SmartThemeBorderColor':'border_color', '--SmartThemeFastUIBGColor':'fastui_bg_color',
    '--blurStrength':'blur_strength', '--SmartThemeBlurStrength':'blur_strength', '--shadowWidth':'shadow_width',
    '--fontScale':'font_scale', '--bubble-radius':'bubble_radius', '--bubbleRadius':'bubble_radius',
  };
  // Static defaults from ST's styles and appearance settings for partial exports.
  const defaults = {
    ink:'#dcdcd2', panel:'#171717', chat:'#171717', italicColor:'#919191', quoteColor:'#e18a24',
    underlineColor:'#bce7cf', userTint:'rgba(0,0,0,.3)', botTint:'rgba(60,60,60,.3)',
    shadowColor:'#00000080', borderColor:'#00000080',
  };
  const names = {
    transparent:'#00000000', black:'#000', silver:'#c0c0c0', gray:'#808080', grey:'#808080', white:'#fff',
    maroon:'#800000', red:'#f00', purple:'#800080', fuchsia:'#f0f', green:'#008000', lime:'#0f0',
    olive:'#808000', yellow:'#ff0', navy:'#000080', blue:'#00f', teal:'#008080', aqua:'#0ff',
    orange:'#ffa500', pink:'#ffc0cb', rebeccapurple:'#663399',
  };
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clip = (value, min, max) => Math.min(max, Math.max(min, value));
  const byte = value => Math.round(value).toString(16).padStart(2, '0');
  const fail = code => { throw Object.assign(new Error(code), {code}); };

  function plain(value) {
    if (!object(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  }

  function quantity(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? {n:value, unit:''} : null;
    if (typeof value !== 'string' || value.length > 48) return null;
    const match = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|px|deg|grad|rad|turn)?$/i);
    if (!match || !Number.isFinite(Number(match[1]))) return null;
    return {n:Number(match[1]), unit:(match[2] || '').toLowerCase()};
  }

  function bounded(key, value, allowPixels = false) {
    const part = quantity(value);
    if (!part || part.unit && !(allowPixels && part.unit === 'px')) return null;
    return clip(part.n, ...ranges[key]);
  }

  function channel(value, scale) {
    const part = quantity(value);
    if (!part || part.unit && part.unit !== '%') return null;
    const n = part.unit === '%' ? clip(part.n,0,100)*scale/100 : part.n;
    return clip(n,0,scale);
  }

  function hslChannels(parts) {
    const hue = quantity(parts[0]), saturation = quantity(parts[1]), lightness = quantity(parts[2]);
    const factors = {'':1, deg:1, grad:0.9, rad:180/Math.PI, turn:360};
    if (!hue || !Object.hasOwn(factors,hue.unit) || saturation?.unit !== '%' || lightness?.unit !== '%') return null;
    const h = ((hue.n % (360/factors[hue.unit])) * factors[hue.unit] % 360 + 360) % 360 / 30;
    const s = clip(saturation.n,0,100)/100, l = clip(lightness.n,0,100)/100;
    const a = s*Math.min(l,1-l);
    return [0,8,4].map(offset => {
      const k = (offset+h)%12;
      return (l-a*Math.max(-1,Math.min(k-3,9-k,1)))*255;
    });
  }

  function color(value) {
    if (typeof value !== 'string' || value.length > 160) return null;
    let text = value.trim().toLowerCase();
    if (Object.hasOwn(names,text)) text = names[text];
    let rgb, alpha = 1;
    if (text.startsWith('#')) {
      let digits = text.slice(1);
      if (!/^(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(digits)) return null;
      if (digits.length <= 4) digits = [...digits].map(c => c+c).join('');
      rgb = digits.slice(0,6).match(/../g).map(part => parseInt(part,16));
      if (digits.length === 8) alpha = parseInt(digits.slice(6),16)/255;
    } else {
      const fn = text.match(/^(rgba?|hsla?)\(([^()]*)\)$/);
      if (!fn) return null;
      const channels = fn[2].trim();
      let parts;
      if (channels.includes(',')) {
        parts = channels.split(',').map(x=>x.trim());
        if (parts.length === 4) alpha = channel(parts.pop(),1);
      } else {
        const split = channels.split('/');
        if (split.length > 2) return null;
        parts = split[0].trim().split(/\s+/);
        if (split.length === 2) alpha = channel(split[1],1);
      }
      if (parts.length !== 3 || alpha === null) return null;
      rgb = fn[1].startsWith('hsl') ? hslChannels(parts) : parts.map(part=>channel(part,255));
      if (!rgb || rgb.includes(null)) return null;
    }
    const hex = '#' + rgb.map(byte).join('');
    const alphaHex = byte(alpha*255);
    return {hex, alpha, full:(hex + (alphaHex === 'ff' ? '' : alphaHex)).toUpperCase()};
  }

  function opaqueText(foreground, surface) {
    if (foreground.alpha === 1) return foreground.hex;
    let result = '#';
    for (const i of [1,3,5]) {
      const fg = parseInt(foreground.hex.slice(i,i+2),16), bg = parseInt(surface.hex.slice(i,i+2),16);
      result += byte(fg*foreground.alpha + bg*(1-foreground.alpha));
    }
    return result;
  }

  // ST splits the main text color at commas to update its checkbox channels.
  function toSTColor(value) {
    const swatch = color(value);
    if (!swatch) return null;
    const channels = [1,3,5].map(i=>parseInt(swatch.hex.slice(i,i+2),16));
    return 'rgba(' + [...channels, Number(swatch.alpha.toFixed(6))].join(', ') + ')';
  }

  /** Strip unknown/invalid appearance values from a saved theme before they reach CSS. */
  function sanitizeAppearance(raw) {
    const result = {};
    if (!object(raw)) return result;
    for (const key of ['panelOpacity','chatOpacity','blur','shadowWidth']) {
      if (!Object.hasOwn(raw,key)) continue;
      const n = bounded(key, raw[key]);
      if (n !== null) result[key] = n;
    }
    for (const key of detailColors) {
      if (!Object.hasOwn(raw,key)) continue;
      const swatch = color(raw[key]);
      if (swatch) result[key] = swatch.full;
    }
    return result;
  }

  function setting(key, value, fromCSS) {
    if (Object.hasOwn(colorKeys,key)) return color(value);
    if (Object.hasOwn(numericKeys,key)) return bounded(numericKeys[key], value, fromCSS && key !== 'font_scale');
    if ([true,1,'true','1'].includes(value)) return true;
    if ([false,0,'false','0'].includes(value)) return false;
    return null;
  }

  function isNativeSetting(key) {
    return (Object.hasOwn(colorKeys,key) && key !== 'fastui_bg_color')
      || (Object.hasOwn(numericKeys,key) && key !== 'bubble_radius')
      || key === 'chat_width' || nativeFlags.has(key) || Object.hasOwn(nativeSelects,key);
  }

  function nativeValue(key, value) {
    if (Object.hasOwn(colorKeys,key) && key !== 'fastui_bg_color') return toSTColor(value);
    if (Object.hasOwn(numericKeys,key) && key !== 'bubble_radius') return bounded(numericKeys[key],value);
    if (key === 'chat_width') {
      const part = quantity(value);
      return part && !part.unit ? clip(Math.round(part.n),25,100) : null;
    }
    if (nativeFlags.has(key)) {
      // ST's stock Dark Lite preset uses an empty string for these two unchecked controls.
      if ((key === 'enableZenSliders' || key === 'enableLabMode') && value === '') return false;
      return setting(key,value,false);
    }
    if (Object.hasOwn(nativeSelects,key)) {
      const options = nativeSelects[key];
      const item = typeof options[0] === 'number' ? quantity(value) : null;
      const candidate = item && !item.unit ? item.n : value;
      if (options.includes(candidate)) return candidate;
    }
    return null;
  }

  /** Only ST's recognized scalar settings are eligible to update its running profile. */
  function normalizeSettings(raw) {
    const result = {};
    if (!plain(raw)) return result;
    for (const key of Object.keys(raw)) {
      const value = nativeValue(key,raw[key]);
      if (value !== null) result[key]=value;
    }
    return result;
  }

  // Walk top-level CSS delimiters, ignoring comments, quoted text, and function arguments.
  // No declaration text is returned to the app. Only static, allowlisted values are parsed.
  function cssTokens(css, visit) {
    let start = 0, prefix = '', quote = '', groups = 0;
    for (let i=0; i<css.length; i++) {
      const c = css[i];
      if (c === '\\') { i++; continue; }
      if (quote) { if (c === quote) quote=''; continue; }
      if (c === '"' || c === "'") { quote=c; continue; }
      if (c === '/' && css[i+1] === '*') {
        prefix += css.slice(start,i) + ' ';
        const end = css.indexOf('*/',i+2);
        if (end < 0) return false;
        i=end+1; start=i+1; continue;
      }
      if (c === '(' || c === '[') { groups++; continue; }
      if (c === ')' || c === ']') { if (!groups) return false; groups--; continue; }
      if (groups || !'{};'.includes(c)) continue;
      visit((prefix+css.slice(start,i)).trim(),c);
      start=i+1; prefix='';
    }
    visit((prefix+css.slice(start)).trim(),'');
    return !quote && !groups;
  }

  function readCSS(css, choose) {
    let depth = 0, priority = 0, skipped = false, hasRules = false;
    const scope = {'html':1, ':root':2, 'html:root':3, 'body':30, 'html body':31, ':root body':32};
    const complete = cssTokens(css,(segment, delimiter) => {
      if (delimiter === '{') {
        if (!depth) {
          priority=0;
          if (segment && !/[<>]/.test(segment)) hasRules=true;
          for (const selector of segment.split(',')) {
            const key = selector.trim().toLowerCase().replace(/\s+/g,' ');
            if (Object.hasOwn(scope,key)) priority=Math.max(priority,scope[key]);
            else skipped=true;
          }
        }
        if (depth || !priority) skipped=true;
        depth++;
        return;
      }
      if (segment && depth === 1 && priority) {
        const decl = segment.match(/^(--[\w-]+)\s*:\s*([\s\S]+)$/);
        if (decl && Object.hasOwn(cssKeys,decl[1])) {
          const important = /\s*!important\s*$/i;
          const value = decl[2].replace(important,'').trim();
          if (!choose(cssKeys[decl[1]],value,priority+(important.test(decl[2]) ? 10 : 0),true)) skipped=true;
        } else skipped=true;
      } else if (segment) skipped=true;
      if (delimiter === '}') {
        if (!depth) skipped=true;
        else depth--;
      }
    });
    return {skipped:skipped || !complete || depth !== 0, hasRules:hasRules && complete && !depth};
  }

  function foreignDocument(input) {
    const foreign = ['entries','world_info','character_book','first_mes','personality','mes_example','alternate_greetings',
      'worldBooks','characters','prompts','messages','quickReplySlots','qrList','findRegex'];
    return [input,input.data].some(part => object(part) && (foreign.some(key=>Object.hasOwn(part,key)) ||
      typeof part.spec === 'string' && /^chara_card/i.test(part.spec)));
  }

  function decode(text) {
    if (typeof text !== 'string') fail('theme-json');
    if (text.length > MAX_BYTES || new TextEncoder().encode(text).length > MAX_BYTES) fail('theme-size');
    try { return JSON.parse(text.replace(/^\uFEFF/,''),(key,value)=>reserved.has(key) ? undefined : value); }
    catch (_) { fail('theme-json'); }
  }

  function credit(raw) {
    const meta = object(raw.metadata) ? raw.metadata : {};
    const source = object(raw.source) ? raw.source : {};
    const author = [raw.author,raw.creator,raw.author_name,meta.author,meta.creator,source.author]
      .find(value=>typeof value === 'string' && value.trim());
    const info = author ? {author:author.trim()} : {};
    for (const input of [raw.sourceUrl,raw.source_url,raw.original_url,raw.source,source.url,meta.sourceUrl,meta.source_url]) {
      if (typeof input !== 'string') continue;
      try {
        const url = new URL(input);
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password) continue;
        info.sourceUrl=url.href;
        break;
      } catch (_) { /* A plain-text source can still round-trip in the original JSON. */ }
    }
    return info;
  }

  /** A new native preset with the requested edits, retaining source CSS and extension metadata as opaque JSON. */
  function edited(raw, changes = {}) {
    if (!plain(raw) || foreignDocument(raw) || !plain(changes)) fail('theme-format');
    let text;
    try { text = JSON.stringify(raw); } catch (_) { fail('theme-format'); }
    const result = decode(text);
    if (!plain(result)) fail('theme-format');
    for (const key of Object.keys(changes)) {
      const value = changes[key];
      if (key === 'name' && typeof value === 'string' && value.trim()) {
        result.name=value.trim();
      } else {
        const normalized = nativeValue(key,value);
        if (normalized === null) fail('theme-value');
        result[key]=normalized;
      }
    }
    if (Object.hasOwn(result,'main_text_color')) {
      const original = result.main_text_color;
      const rgba = toSTColor(original);
      if (rgba === null) delete result.main_text_color;
      else if (!/^\s*rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:\d+(?:\.\d*)?|\.\d+)\s*\)\s*$/i.test(original)) result.main_text_color=rgba;
    }
    return result;
  }

  function parse(text, filename = '', {allowCssOnly = false} = {}) {
    const raw = decode(text);
    if (!object(raw) || foreignDocument(raw)) fail('theme-format');

    const chosen = new Map();
    function choose(key, rawValue, rank, fromCSS) {
      const value = setting(key,rawValue,fromCSS);
      if (value === null) return false;
      if (!chosen.has(key) || rank >= chosen.get(key).rank) chosen.set(key,{value,rank});
      return true;
    }
    let known = false;
    for (const key of [...Object.keys(colorKeys),...Object.keys(numericKeys),'fast_ui_mode','noShadows']) {
      if (!Object.hasOwn(raw,key)) continue;
      known = true;
      // ST writes JSON values inline on :root. Global body variables and important declarations can override them.
      choose(key,raw[key],6,false);
    }
    const css = raw.custom_css;
    const stylesheet = typeof css === 'string' ? readCSS(css,choose) : {skipped:css != null,hasRules:false};
    const cssOnly = !chosen.size && allowCssOnly === true && stylesheet.hasRules && typeof raw.name === 'string' && !!raw.name.trim();
    if (!chosen.size) {
      if (typeof css === 'string' && css.trim() && !cssOnly) fail('theme-css');
      if (!cssOnly && !Object.keys(normalizeSettings(raw)).length) fail(known || css != null && typeof css !== 'string' ? 'theme-value' : 'theme-format');
    }

    const picked = key => chosen.get(key)?.value;
    const colors = Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,color(value)]));
    for (const [key,field] of Object.entries(colorKeys)) if (chosen.has(key)) colors[field]=picked(key);
    if (!chosen.has('blur_tint_color')) colors.panel=colors.legacyPanel || picked('chat_tint_color') || colors.panel;
    if (!chosen.has('chat_tint_color')) colors.chat=colors.panel;
    const vars = {
      bg:colors.chat.hex, lacquer:colors.panel.hex, paper:colors.panel.hex,
      ink:opaqueText(colors.ink,colors.panel), accent:opaqueText(colors.quoteColor,colors.panel),
      fontScale:picked('font_scale') ?? 1, radius:picked('bubble_radius') ?? 10,
    };
    const appearance = {
      panelOpacity:colors.panel.alpha, chatOpacity:colors.chat.alpha,
      blur:picked('fast_ui_mode') ? 0 : picked('blur_strength') ?? 10,
      shadowWidth:picked('noShadows') ? 0 : picked('shadow_width') ?? 2,
    };
    for (const key of detailColors) appearance[key]=colors[key].full;
    const authoredName = typeof raw.name === 'string' ? raw.name.trim() : '';
    const fileName = typeof filename === 'string' ? filename.split(/[\\/]/).pop().replace(/\.json$/i,'').trim() : '';
    return {name:authoredName || fileName || 'SillyTavern', vars, appearance, skippedCSS:cssOnly || stylesheet.skipped, ...(cssOnly ? {cssOnly:true} : {}), ...credit(raw), raw};
  }

  const api = {MAX_BYTES, parse, sanitizeAppearance, edited, normalizeSettings, isNativeSetting, toSTColor};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAThemeFormat = api;
})(globalThis);
