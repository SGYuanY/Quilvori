import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {MAX_BYTES, parse, edited, normalizeSettings, sanitizeAppearance, toSTColor} = require('../js/theme-format');
const theme = (object, filename) => parse(JSON.stringify(object),filename);
const errorCode = expected => error => error.code === expected;
const sample = {
  name:'海蓝 · Azure', main_text_color:'rgba(171, 198, 223, 1)', italics_text_color:'rgba(255, 255, 255, 1)',
  underline_text_color:'rgba(188, 231, 207, 1)', quote_text_color:'rgba(111, 133, 253, 1)',
  blur_tint_color:'rgba(23, 30, 33, 0.61)', chat_tint_color:'rgba(23, 23, 23, 0)',
  user_mes_blur_tint_color:'rgba(0, 28, 174, 0.2)', bot_mes_blur_tint_color:'rgba(0, 13, 57, 0.22)',
  shadow_color:'rgba(0, 0, 0, 1)', border_color:'rgba(0, 0, 0, 0.5)',
  blur_strength:11, shadow_width:5, font_scale:1, fast_ui_mode:false, noShadows:false, custom_css:'',
};

test('the stock ST fields map to independent surface, text, accent and message colors, including zero alpha', () => {
  const result = parse('\uFEFF'+JSON.stringify(sample),'ignored.json');
  assert.equal(result.name,'海蓝 · Azure');
  assert.deepEqual(result.vars,{bg:'#171717',lacquer:'#171e21',paper:'#171e21',ink:'#abc6df',accent:'#6f85fd',fontScale:1,radius:10});
  assert.deepEqual(result.appearance,{
    panelOpacity:.61,chatOpacity:0,blur:11,shadowWidth:5,shadowColor:'#000000',borderColor:'#00000080',
    userTint:'#001CAE33',botTint:'#000D3938',italicColor:'#FFFFFF',quoteColor:'#6F85FD',underlineColor:'#BCE7CF',
  });
  assert.deepEqual(result.raw,sample);
  assert.equal(result.skippedCSS,false);
  assert.deepEqual(sanitizeAppearance(result.appearance),result.appearance);
});

test('theme toggles and bounds survive zero and partial exports', () => {
  const t = theme({fast_ui_mode:true, noShadows:true, font_scale:12, shadow_width:5, blur_strength:20, bubble_radius:0});
  assert.equal(t.appearance.blur,0);
  assert.equal(t.appearance.shadowWidth,0);
  assert.equal(t.vars.fontScale,1.5);
  assert.equal(t.vars.radius,0);
  const partial=theme({font_scale:-5,blur_strength:500,shadow_width:-1,fast_ui_mode:'false',bubble_radius:900},'C:\\drafts\\Rain.JSON');
  assert.equal(partial.name,'Rain');
  assert.equal(partial.appearance.blur,30);
  assert.equal(partial.appearance.shadowWidth,0);
  assert.equal(partial.vars.fontScale,.5);
  assert.equal(partial.vars.radius,28);
  assert.equal(theme({fastui_bg_color:'#123'}).vars.paper,'#112233');
  assert.equal(theme({blur_tint_color:'#abc',fastui_bg_color:'#123'}).vars.paper,'#aabbcc');
});

test('static root and body CSS can supply an entire theme without running the stylesheet', () => {
  const css = [
    '/* :root { --SmartThemeBodyColor: red; } */',
    ':root, html { --SmartThemeBodyColor: rgb(10 20 30); --SmartThemeBlurTintColor: #4828;',
    '--SmartThemeChatTintColor: #7350; --SmartThemeUnderlineColor: hsl(120 100% 25% / 50%);',
    '--SmartThemeBlurStrength: 7px; --shadowWidth: 2; --fontScale: 1.2; --bubble-radius: 0px; }',
    'body { --SmartThemeQuoteColor: rgb(100% 0% 0% / .5); --SmartThemeBorderColor: transparent; }',
  ].join('\n');
  const t = theme({custom_css:css});
  assert.equal(t.skippedCSS,false);
  assert.equal(t.vars.ink,'#0a141e');
  assert.equal(t.vars.paper,'#448822');
  assert.equal(t.appearance.panelOpacity,136/255);
  assert.equal(t.appearance.chatOpacity,0);
  assert.equal(t.appearance.underlineColor,'#00800080');
  assert.equal(t.appearance.quoteColor,'#FF000080');
  assert.equal(t.appearance.borderColor,'#00000000');
  assert.equal(t.appearance.blur,7);
  assert.equal(t.appearance.shadowWidth,2);
  assert.equal(t.vars.fontScale,1.2);
  assert.equal(t.vars.radius,0);
  assert.equal(t.raw.custom_css,css);
});

test('only global static declarations participate, respecting inline, important and body inheritance', () => {
  const css = [
    '@import url("https://example.invalid/fonts.css");',
    '.panel { content:"} body { --SmartThemeBodyColor: red; }"; }',
    ':root { --SmartThemeBodyColor: #123; --SmartThemeQuoteColor: #fed !important; }',
    'body { --SmartThemeQuoteColor: #789; --SmartThemeBorderColor: var(--unknown); }',
    '@media (min-width: 1px) { body { --SmartThemeQuoteColor: #bad; } }',
    'body:hover { --SmartThemeBodyColor: red; }',
    'body { background-image:url("https://example.invalid/image"); --fontScale: calc(8); }',
  ].join('\n');
  const t = theme({...sample,custom_css:css});
  assert.equal(t.vars.ink,'#abc6df');
  assert.equal(t.vars.accent,'#778899');
  assert.equal(t.vars.fontScale,1);
  assert.equal(t.appearance.borderColor,'#00000080');
  assert.equal(t.skippedCSS,true);
  assert.ok(!JSON.stringify([t.vars,t.appearance]).includes('example.invalid'));
  const important=theme({...sample,custom_css:':root { --SmartThemeBodyColor:#fff !important; --SmartThemeBodyColor:#000; }'});
  assert.equal(important.vars.ink,'#ffffff');
});

test('invalid documents, unusable stylesheet-only presets, and invalid scalar values have distinct errors', () => {
  assert.throws(()=>parse('{bad json'),errorCode('theme-json'));
  for (const input of [
    [], null, {name:'unrelated'}, {entries:{0:{comment:'Book'}},main_text_color:'red'},
    {name:'Card',first_mes:'Hello',blur_strength:1}, {spec:'chara_card_v3',data:{name:'Card'},custom_css:'body{}'},
    {data:{entries:[]},font_scale:1}, {characters:[],worldBooks:[],font_scale:1},
  ]) assert.throws(()=>theme(input),errorCode('theme-format'));
  for (const css of [
    ':root { --SmartThemeBodyColor:url(https://example.invalid/a); }',
    '@media all { :root { --SmartThemeBodyColor:red; } }',
    '.panel { --fontScale:1.2; }', 'body { --SmartThemeQuoteColor:var(--quote); }',
  ]) assert.throws(()=>theme({name:'CSS',custom_css:css}),errorCode('theme-css'));
  for (const input of [{font_scale:null},{blur_tint_color:[]},{fast_ui_mode:'auto'},{custom_css:{line:'color'}}]) {
    assert.throws(()=>theme(input),errorCode('theme-value'));
  }
  assert.equal(theme({main_text_color:null,blur_tint_color:'#fff'}).vars.paper,'#ffffff');
});

test('the UTF-8 byte limit handles both ASCII and multibyte files', () => {
  assert.throws(()=>parse(' '.repeat(MAX_BYTES+1)),errorCode('theme-size'));
  assert.throws(()=>theme({blur_strength:1,notes:'界'.repeat(Math.ceil(MAX_BYTES/3))}),errorCode('theme-size'));
  assert.equal(theme({blur_strength:1,notes:'灯'.repeat(1000)}).appearance.blur,1);
});

test('explicit ST workshop mode preserves CSS-only presets for export without executing their selectors', () => {
  const raw={name:'Author CSS',custom_css:'.mes .mes_text { color:var(--author-color); }'};
  const opt={allowCssOnly:true};
  const result=parse(JSON.stringify(raw),'fixture.json',opt);
  assert.equal(result.cssOnly,true);
  assert.equal(result.skippedCSS,true);
  assert.deepEqual(result.raw,raw);
  assert.deepEqual(result.vars,theme({font_scale:1}).vars);
  assert.throws(()=>theme(raw),errorCode('theme-css'));
  for (const input of [{...raw,name:''},{...raw,custom_css:'plain text'},{...raw,custom_css:'body {'}]) {
    assert.throws(()=>parse(JSON.stringify(input),'fixture.json',opt),errorCode('theme-css'));
  }
  assert.throws(()=>parse(JSON.stringify({...raw,entries:[]}),'fixture.json',opt),errorCode('theme-format'));
  assert.equal(theme({name:'Native layout only',chat_width:60}).raw.chat_width,60);
});

test('reopened backup appearance is rebuilt from validated own fields only', () => {
  const raw=Object.assign(Object.create({botTint:'red'}),{
    panelOpacity:0,chatOpacity:15,blur:-2,shadowWidth:'1.25',userTint:'hsla(.5turn,100%,50%,.25)',borderColor:'#AbCd',
    quoteColor:'url(https://example.invalid)',italicColor:['red'],shadowColor:'var(--shadow)',stylesheet:'ignore',
  });
  Object.freeze(raw);
  assert.deepEqual(sanitizeAppearance(raw),{panelOpacity:0,chatOpacity:1,blur:0,shadowWidth:1.25,userTint:'#00FFFF40',borderColor:'#AABBCCDD'});
  for (const input of [null,[],undefined,true]) assert.deepEqual(sanitizeAppearance(input),{});
  assert.deepEqual(sanitizeAppearance({shadowWidth:Infinity,blur:'4px',panelOpacity:'',chatOpacity:false}),{});
});

test('authored credit stays distinct from the theme name and only explicit web sources become links', () => {
  const preset = {name:'A 作者 · 秋',author:'甲 & 乙',source_url:'https://example.org/themes/1',border_color:'#abc'};
  const t = theme(preset,'another.json');
  assert.equal(t.name,preset.name);
  assert.equal(t.author,preset.author);
  assert.equal(t.sourceUrl,preset.source_url);
  assert.equal(theme({metadata:{creator:'海'},source:{url:'https://example.org/credit'},font_scale:1}).author,'海');
  for (const url of ['file:///tmp/credit','data:text/plain,hello','https://name:password@example.org/']) {
    assert.equal(theme({...preset,source_url:url}).sourceUrl,undefined);
  }
  assert.equal(theme({name:'by Somebody',custom_css:'/* https://example.org/ */ :root{--fontScale:1;}'}).author,undefined);
});

test('the ST settings projection keeps only validated native values, including legacy unchecked flags', () => {
  const raw = {
    ...sample, main_text_color:'#09Fc',chat_width:'120',avatar_style:'3',chat_display:9,
    media_display:'gallery',toastr_position:'toast-top-left',timer_enabled:'true',enableZenSliders:'',
    bogus_folders:'sometimes',custom_css:':root{}',extensions:{special:true},bubble_radius:11,nested:{key:'raw'},
  };
  const n=normalizeSettings(raw);
  assert.equal(n.main_text_color,'rgba(0, 153, 255, 0.8)');
  assert.equal(n.chat_width,100);
  assert.equal(n.avatar_style,3);
  assert.equal(n.timer_enabled,true);
  assert.equal(n.enableZenSliders,false);
  assert.equal(n.media_display,'gallery');
  assert.equal(n.toastr_position,'toast-top-left');
  for (const key of ['name','chat_display','custom_css','extensions','nested','bubble_radius','bogus_folders']) assert.ok(!Object.hasOwn(n,key),key);
  for (const [input,expected] of [['#F0A','rgba(255, 0, 170, 1)'],['rgb(120% -4 0 / 200%)','rgba(255, 0, 0, 1)'],['hsl(240 100% 50%)','rgba(0, 0, 255, 1)'],['currentColor',null],['var(--test)',null],['#abcd000',null],['rgb(1,,2)',null]]) {
    assert.equal(toSTColor(input),expected);
  }
});

test('a native preset round-trips and edited copies preserve CSS and extension metadata', () => {
  const original={...sample,description:'Written by the theme author.',author:'秋',custom_css:'.link { text-decoration: underline; }',extensionData:{credit:['A'],extra:7}};
  const t=theme(original);
  assert.deepEqual(edited(t.raw,{}),original);
  const next=edited(t.raw,{name:'秋 · Draft',font_scale:'1.3',noShadows:true,main_text_color:'#1020ff80',underline_text_color:'rgba(2, 4, 6, .37)'});
  assert.equal(next.main_text_color,'rgba(16, 32, 255, 0.501961)');
  assert.equal(next.underline_text_color,'rgba(2, 4, 6, 0.37)');
  assert.equal(next.noShadows,true);
  assert.equal(next.font_scale,1.3);
  assert.equal(next.custom_css,original.custom_css);
  assert.deepEqual(next.extensionData,original.extensionData);
  assert.notEqual(next.extensionData,t.raw.extensionData);
  assert.deepEqual(t.raw,original);
  const again=theme(next);
  assert.equal(again.name,'秋 · Draft');
  assert.equal(again.appearance.shadowWidth,0);
  assert.equal(again.appearance.underlineColor,'#0204065E');
  assert.equal(again.author,'秋');
  const legacy=theme({...sample,main_text_color:'white'});
  assert.equal(edited(legacy.raw).main_text_color,'rgba(255, 255, 255, 1)');
  assert.equal(legacy.raw.main_text_color,'white');
});

test('reserved property names are stripped deeply and edits cannot update arbitrary source keys', () => {
  const text='{"font_scale":1,"__proto__":{"x":1},"extra":[{"prototype":{"x":2},"constructor":3,"credit":"Original"}]}';
  const raw=parse(text).raw;
  assert.equal(Object.hasOwn(raw,'__proto__'),false);
  assert.deepEqual(raw.extra,[{credit:'Original'}]);
  for (const patch of [JSON.parse('{"__proto__":{"x":4}}'),{constructor:1},{prototype:0},{custom_css:'body{}'},{extensionData:{}},{noShadows:null},{name:' '},{chat_display:'bad'}]) {
    assert.throws(()=>edited(raw,patch),errorCode('theme-value'));
  }
  assert.equal(Object.prototype.x,undefined);
  assert.deepEqual(raw,{font_scale:1,extra:[{credit:'Original'}]});
});
