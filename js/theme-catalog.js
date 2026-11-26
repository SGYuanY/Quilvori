/* Stable author posts. Original downloads are optional, local copies. */
(function(root){
  'use strict';
  const channel='https://discord.com/channels/1100685673633153084/';
  const entries=[
    {id:'lavender-blossoms',name:'Lavender Blossom Theme + Info Board',author:'Selenis',postUrl:channel+'1344396649245577307',fileUrl:channel+'1344396649245577307/1344396685983350884',localFile:'lavender-blossoms.json',sha256:'8a8a16f74fa49fb3aaab401fc10889a50fdf520a7885648f171f19fc6882f541'},
    {id:'inkflow-radiance',name:'Inkflow Radiance (PC)',author:'Dascard',postUrl:channel+'1432751944912601198',fileUrl:channel+'1432751944912601198/1432751944912601198',localFile:'inkflow-radiance-pc.json',sha256:'9bab793945db1882e5d1fef19fa057dbb6854fbc69b2b16ba57010bdd52eaf71'},
    {id:'solarized-light',name:'Solarized Light',author:'GrizzyBurr',postUrl:channel+'1418676156403683440',fileUrl:channel+'1418676156403683440/1418676347164692672',localFile:'solarized-light.json',sha256:'4dc962dc09f25703a507278bb4d848e5e79b3f8368a4369927d4e6ad66994d0f'},
  ];
  if(typeof module!=='undefined' && module.exports)module.exports=entries;else root.TAThemeCatalog=entries;
})(globalThis);
