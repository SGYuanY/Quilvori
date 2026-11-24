/* Curated public-source directory. Never built from a user's private collection. */
(function(root){
  'use strict';
  const base='https://discord.com/channels/1100685673633153084/';
  const mardenPost=base+'1100827734009188434/threads/1556083265209901137';
  const entries=[
    {id:'sane-mardenfen',type:'character',title:'Mardenfen, A 1500s Backwater Village',
      description:'A historical survival RPG set in a 1500s fen village. Use the three related lorebooks for its plot, events and gated cast.',
      author:{name:'Sane'},postUrl:mardenPost,license:{status:'unknown',note:'Shared by the author in the SillyTavern forum. No general redistribution license was found in the reviewed post.'},
      image:{src:'img/resources/mardenfen.webp',credit:'Sane · original Mardenfen cover'},tags:['Historical','Survival','RPG'],
      relatedIds:['sane-mardenfen-worlds'],files:[],expectedFilenames:['main_mardenfen-backwater-village-ec591fc11565_spec_v2.png']},
    {id:'sane-michael',type:'character',title:'Michael, The Tired Archangel',
      description:'A satirical archangel character with an embedded lorebook. The author also provides a legacy card and an expression reference in the original thread.',
      author:{name:'Sane'},postUrl:base+'1100827734009188434/threads/1553664479357706361',license:{status:'unknown',note:'Shared by the author. Please read the original post and its parody disclaimer before use.'},
      image:{src:'img/resources/michael.webp',credit:'Sane · original character cover'},tags:['OC','Male','Parody'],relatedIds:[],files:[],expectedFilenames:['michael_the_tired_archangel.png','1f6ii6.png']},
    {id:'sane-mardenfen-worlds',type:'world',title:'Mardenfen · Plot, Events & Gated Cast',
      description:'Three companion world books for Mardenfen. Import each JSON separately: Plot, Events and Gated Cast. The illustration is the author’s cover for the shared setting.',
      author:{name:'Sane'},postUrl:mardenPost,license:{status:'unknown',note:'Three original JSON attachments are available in the same author thread. No general redistribution license was found.'},
      image:{src:'img/resources/mardenfen.webp',credit:'Sane · Mardenfen setting cover'},tags:['World book','Bundle','Historical'],
      relatedIds:['sane-mardenfen'],files:[],expectedFilenames:['MARDENFEN_Gated_Cast_Lorebook.json','Mardenfen_Events_SillyTavern_Lorebook.json','Mardenfen_Plot_Lorebook_Clean.json']},
    {id:'theanointed-fantasy-backgrounds',type:'wallpaper',title:'4k Fantasy Backgrounds',
      description:'A set of fantasy backgrounds shared by their creator. The directory shows one of the original images; visit the thread to choose a full-resolution background.',
      author:{name:'theanointed_'},postUrl:base+'1116072225242628096/threads/1500781575196119117',license:{status:'unknown',note:'The author says these were made for personal use and shared with the community. Check the original post for current terms.'},
      image:{src:'img/resources/fantasy-backgrounds.webp',credit:'theanointed_ · original background'},tags:['Fantasy','Backgrounds','4K'],relatedIds:[],files:[]},
  ];
  function importResource(value){
    const entry=entries.find(item=>item.id===value?.id);if(!entry)throw new Error('Unknown resource');
    const attribution=root.TAResourceSource.clean({catalogId:entry.id,author:entry.author,postUrl:entry.postUrl,license:entry.license});
    if(!attribution)throw new Error('Invalid resource attribution');
    // Unknown-license records point to the author. Users supply their own original attachment URL.
    const url=entry.license.status==='redistributable' ? entry.files?.[0]?.url || '' : '';
    if(entry.type==='wallpaper')return root.TAWallpaperImport.open({title:entry.title,url,attribution});
    return root.TALinkImportPanel.open({kind:entry.type==='character'?'character':'world',url,attribution,expectedFilenames:entry.expectedFilenames || []});
  }
  const api={entries,importResource};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TAResourceCatalog=api;
})(typeof globalThis!=='undefined'?globalThis:window);
