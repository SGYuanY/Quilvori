/* Collection and editor controls. Authored work names are displayed verbatim. */
(function(root) {
  'use strict';
  const rows={
    '提示词预设字段格式无效':['Invalid prompt preset field','プロンプトプリセットの項目の形式が正しくありません','Недопустимый формат поля пресета промптов','프롬프트 프리셋 필드 형식이 올바르지 않습니다','รูปแบบฟิลด์ของพรีเซ็ตพรอมต์ไม่ถูกต้อง'],
    '预设里没有 prompts':['The preset has no prompts or blocks array.','プリセットに prompts または blocks 配列がありません。','В пресете нет массива prompts или blocks.','프리셋에 prompts 또는 blocks 배열이 없습니다.','พรีเซ็ตไม่มีอาร์เรย์ prompts หรือ blocks'],
    '预设内有重复的提示块标识':['Two prompt blocks have the same identifier.','同じ識別子のプロンプトブロックが複数あります。','У блоков промпта совпадают идентификаторы.','같은 식별자를 쓰는 프롬프트 블록이 있습니다.','บล็อกพรอมต์มีตัวระบุซ้ำกัน'],
    '提示块执行范围':['Prompt order scope','プロンプト順序の適用範囲','Область порядка промптов','프롬프트 순서 적용 범위','ขอบเขตลำดับพรอมต์'],
    '选择要编辑和导出的执行顺序。':['Choose the prompt order to edit and export.','編集して書き出す実行順序を選択してください。','Выберите порядок блоков для редактирования и экспорта.','편집하고 내보낼 실행 순서를 선택하세요.','เลือกลำดับพรอมต์ที่ต้องการแก้ไขและส่งออก'],
    '在书架置顶':['Pin to shelf','本棚の先頭に固定','Закрепить на полке','책장 맨 앞에 고정','ปักหมุดบนชั้นหนังสือ'],
    '取消书架置顶':['Unpin from shelf','本棚の固定を解除','Открепить от полки','책장 고정 해제','เลิกปักหมุดบนชั้นหนังสือ'],
    '当前角色':['Current character','現在のキャラクター','Текущий персонаж','현재 캐릭터','ตัวละครปัจจุบัน'],
    '请在画廊中选择角色卡。':['Choose a character in the gallery.','ギャラリーでキャラクターを選択してください。','Выберите персонажа в галерее.','갤러리에서 캐릭터를 선택하세요.','เลือกตัวละครในแกลเลอรี'],
    '切换角色':['Switch character','キャラクターを切り替え','Сменить персонажа','캐릭터 전환','เปลี่ยนตัวละคร'],
    '查找角色名或标签':['Search names or tags','名前・タグを検索','Поиск по имени или тегу','이름 또는 태그 검색','ค้นหาชื่อหรือแท็ก'],
    '当前世界书':['Current world book','現在のワールドブック','Текущая книга мира','현재 월드북','เวิลด์บุ๊กปัจจุบัน'],
    '更多世界书操作':['More world book actions','ワールドブックのその他の操作','Другие действия с книгой мира','월드북 추가 작업','ตัวเลือกเวิลด์บุ๊กเพิ่มเติม'],
  };
  root.TAI18n.add(Object.fromEntries(Object.entries(rows).map(([key,values])=>[
    key,Object.fromEntries(['en','ja','ru','ko','th'].map((lang,index)=>[lang,values[index]]))
  ])),{'prompt.scopeCount':{zh:'{count} 项',en:'{count} entries',ja:'{count} 件',ru:'Записей: {count}',ko:'{count}개',th:'{count} รายการ'}});
})(globalThis);
