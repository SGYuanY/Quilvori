/* Display-only room palettes. Resolving a theme never changes saved preferences. */
(function (root) {
  'use strict';
  const palettes = {
    collection: ['#1b1a20','#19171f','#27232e','#302a37','#eee7e3','#c8b4da'],
    studio: ['#191c25','#161924','#232839','#2d3347','#e5e8f2','#b6b9e7'],
    portrait: ['#241c22','#1d171d','#30252f','#3c2e39','#f0e2e8','#d9aebf'],
    atlas: ['#1a2220','#151c1b','#26332e','#304039','#e3eee6','#abc9b2'],
    manuscript: ['#23211e','#1c1b19','#302c26','#3c362e','#eee7db','#d6c49e'],
    structure: ['#1b2228','#161c22','#26323c','#30414b','#e1eaf0','#a4c8d5'],
    reading: ['#24201d','#1c1a18','#312b26','#3d342d','#f1e6d7','#d1baa0'],
    narrative: ['#241d25','#1d171f','#332735','#403040','#f0e3ed','#ccaccc'],
    art: ['#252126','#1d191f','#332d36','#403743','#efe6ee','#d2bccf'],
    utility: ['#1d2025','#171a20','#292e36','#343b45','#e5e9ee','#b9c5d3'],
  };
  const rooms = {
    home:'collection',studio:'studio',characters:'portrait',lore:'atlas',
    sections:'manuscript',prompts:'manuscript',graph:'structure',regex:'structure',quick:'structure',
    chat:'reading',memory:'reading',tutorial:'reading',groups:'narrative',script:'narrative',timeline:'narrative',
    assets:'art',resources:'art',check:'utility',backup:'utility',
  };
  const legacy = [
    {bg:'#1c1c1c',lacquer:'#141414',paper:'#2e2e2e',ink:'#e8e8e8',accent:'#d0d0d0'},
    {bg:'#191b19',lacquer:'#151714',paper:'#212420',ink:'#e7e7dd',accent:'#d6b680'},
    {bg:'#121319',lacquer:'#15161d',paper:'#1d1f29',ink:'#e9e9f0',accent:'#b9a6ec'},
  ];
  const color = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  function isStock(stored = {}) {
    return legacy.some(palette => Object.keys(palette).every(key => !stored[key] || color(stored[key]) === palette[key]));
  }
  function contrastInk(hex) {
    const rgb=hex.slice(1).match(/../g).map(part=>{const n=parseInt(part,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
    const light=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    return (light+.05)/.05 >= 1.05/(light+.05) ? '#000000' : '#ffffff';
  }
  function resolve(route, stored = {}, preference) {
    const room=Object.hasOwn(rooms,route)?rooms[route]:'collection', [bg,lacquer,paper,raised,ink,accent]=palettes[room];
    const useRooms=preference === true || preference !== false && isStock(stored);
    const colors=useRooms ? {bg,lacquer,paper,ink,accent} : {
      bg:color(stored.bg)||bg,lacquer:color(stored.lacquer)||lacquer,paper:color(stored.paper)||paper,
      ink:color(stored.ink)||ink,accent:color(stored.accent)||accent,
    };
    return { room, useRooms, colors, raised:useRooms?raised:`color-mix(in srgb, ${colors.paper} 88%, ${colors.ink})`,
      onAccent:contrastInk(colors.accent),onSurface:contrastInk(colors.paper),
      fontScale:Number(stored.fontScale)||1,radius:Number.isFinite(Number(stored.radius)) && stored.radius != null ? Math.max(0,Number(stored.radius)) : 14 };
  }
  const api={resolve,isStock,rooms,palettes};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TARoomTheme=api;
})(typeof globalThis!=='undefined'?globalThis:window);
