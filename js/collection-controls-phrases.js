/* Collection and editor controls. Authored work names are displayed verbatim. */
(function(root) {
  'use strict';
  const rows={
    '当前角色':['Current character','現在のキャラクター','Текущий персонаж','현재 캐릭터','ตัวละครปัจจุบัน'],
    '切换角色':['Switch character','キャラクターを切り替え','Сменить персонажа','캐릭터 전환','เปลี่ยนตัวละคร'],
    '查找角色名或标签':['Search names or tags','名前・タグを検索','Поиск по имени или тегу','이름 또는 태그 검색','ค้นหาชื่อหรือแท็ก'],
    '当前世界书':['Current world book','現在のワールドブック','Текущая книга мира','현재 월드북','เวิลด์บุ๊กปัจจุบัน'],
    '更多世界书操作':['More world book actions','ワールドブックのその他の操作','Другие действия с книгой мира','월드북 추가 작업','ตัวเลือกเวิลด์บุ๊กเพิ่มเติม'],
  };
  root.TAI18n.add(Object.fromEntries(Object.entries(rows).map(([key,values])=>[
    key,Object.fromEntries(['en','ja','ru','ko','th'].map((lang,index)=>[lang,values[index]]))
  ])));
})(globalThis);
