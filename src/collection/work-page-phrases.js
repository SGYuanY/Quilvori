(function(root){
  if(!root.TAI18n)return;
  const langs=['zh','en','ja','ru','ko','th'];
  const lines={
    'workPage.libraryId':['库内编号 {id}','Library ID {id}','ライブラリ ID {id}','ID в библиотеке: {id}','라이브러리 ID {id}','รหัสในคลัง {id}'],
    'workPage.sharedImpact':['编辑这本共享世界书后，以下角色卡再次附带它导出时会使用新内容。','These cards share this book. Their next export with it will include your edits.','この本を共有するカードは、次に本を含めて書き出す際に変更内容を使用します。','Эти карточки используют общую книгу. При следующем экспорте с ней изменения попадут в карточку.','이 책을 공유하는 카드는 다음에 책을 포함해 내보낼 때 수정 내용을 사용합니다.','การ์ดเหล่านี้ใช้หนังสือเล่มเดียวกัน เมื่อส่งออกพร้อมหนังสืออีกครั้งจะใช้เนื้อหาที่แก้ไข'],
    'workPage.open':['查看作品','View work','作品を見る','Открыть произведение','작품 보기','ดูผลงาน'],
    'workPage.back':['返回收藏室','Back to collection','コレクションに戻る','Вернуться в коллекцию','컬렉션으로 돌아가기','กลับไปที่คลัง'],
    'workPage.missing':['作品已从资料库移除','This work is no longer in the library','この作品はライブラリにありません','Этого произведения больше нет в библиотеке','라이브러리에 이 작품이 없습니다','ผลงานนี้ถูกนำออกจากคลังแล้ว'],
    'workPage.usedBy':['使用这本书的角色','Characters using this book','この本を使うキャラクター','Персонажи с этой книгой','이 책을 사용하는 캐릭터','ตัวละครที่ใช้หนังสือนี้'],
    'workPage.readers':['使用这本世界书的角色卡（{count}）','Character cards using this world book ({count})','この本を使うカード（{count}）','Карточки с этой книгой ({count})','이 책을 사용하는 카드 ({count})','การ์ดที่ใช้หนังสือโลกเล่มนี้ ({count})'],
    'workPage.noReaders':['当前没有角色卡选用这本书。','No character cards currently use this book.','この本を使うカードはありません。','Эту книгу пока не использует ни одна карточка.','현재 이 책을 사용하는 카드가 없습니다.','ยังไม่มีการ์ดตัวละครใช้หนังสือเล่มนี้'],
    'workPage.changeBook':['选择内嵌世界书','Choose embedded book','内蔵する本を選ぶ','Выбрать встроенную книгу','내장할 책 선택','เลือกหนังสือที่ฝังในการ์ด'],
    'workPage.embeddedCopy':['导出时会把这本书复制进角色卡。改书后，重新导出或同步这张卡，即可更新卡内副本。','Exporting embeds a copy of this book in the card. After editing the book, export or sync the card again to update that copy.','書き出すと、この本のコピーがカードに入ります。本を編集した後は、カードを再度書き出すか同期してコピーを更新します。','При экспорте копия книги встраивается в карточку. После редактирования книги снова экспортируйте или синхронизируйте карточку, чтобы обновить копию.','내보낼 때 이 책의 사본이 카드에 들어갑니다. 책을 수정한 뒤 카드를 다시 내보내거나 동기화하면 사본도 갱신됩니다.','เมื่อส่งออก ระบบจะฝังสำเนาหนังสือไว้ในการ์ด หลังแก้ไขหนังสือ ให้ส่งออกหรือซิงก์การ์ดอีกครั้งเพื่ออัปเดตสำเนา'],
    'workPage.expressions':['表情与表情包','Expressions and packs','表情と表情パック','Эмоции и наборы','표정 및 표정 팩','ภาพแสดงอารมณ์และชุดภาพ'],
    'workPage.packImages':['查看包内图片（{count}）','View images in this pack ({count})','パックの画像を見る（{count}）','Посмотреть изображения набора ({count})','팩에 들어 있는 이미지 보기 ({count})','ดูภาพในชุดนี้ ({count})'],
    'workPage.noExpressions':['尚未关联表情。','No linked expressions.','表情は未登録です。','Привязанных эмоций пока нет.','연결된 표정이 없습니다.','ยังไม่มีภาพแสดงอารมณ์ที่เชื่อมไว้'],
    'workPage.noReplies':['尚无引用这件作品的快捷回复。','No Quick Replies reference this work.','この作品を参照するクイック返信はありません。','На это произведение ещё не ссылаются быстрые ответы.','이 작품을 참조하는 빠른 답장이 없습니다.','ยังไม่มีข้อความตอบด่วนที่อ้างอิงผลงานนี้'],
    'workPage.drafts':['关联 AI 草稿','Related AI drafts','関連する AI 下書き','Связанные черновики ИИ','연결된 AI 초안','ฉบับร่าง AI ที่เกี่ยวข้อง'],
    'workPage.noDrafts':['尚无关联的待收录草稿。','No pending drafts linked to this work.','関連する未登録の下書きはありません。','Нет связанных черновиков, ожидающих добавления.','이 작품에 연결된 대기 중인 초안이 없습니다.','ยังไม่มีฉบับร่างที่รอเก็บและเชื่อมกับผลงานนี้'],
    'workPage.cardFile':['酒馆角色卡文件','SillyTavern character file','酒館のキャラクターファイル','Файл персонажа SillyTavern','SillyTavern 캐릭터 파일','ไฟล์ตัวละคร SillyTavern'],
    'workPage.bookFile':['独立世界书文件','Standalone world book file','単独のワールドブックファイル','Отдельный файл книги мира','독립 세계서 파일','ไฟล์หนังสือโลกแยก'],
    'workPage.lastMatched':['上次核对时与文件一致','Matched the file at the last check','前回の確認時はファイルと一致','При последней проверке файл совпадал','마지막 확인 시 파일과 일치','ตรงกับไฟล์เมื่อครั้งที่ตรวจสอบล่าสุด'],
    'workPage.mainPrompt':['主要提示词／系统提示','Main prompt / System prompt','メインプロンプト／システムプロンプト','Основной / системный промпт','기본 프롬프트 / 시스템 프롬프트','พรอมป์หลัก / พรอมป์ระบบ'],
    'workPage.postHistory':['历史后置指令／历史后指令','Post-history instructions','履歴後の指示','Инструкции после истории','대화 기록 뒤 지침','คำสั่งหลังประวัติการสนทนา'],
    'workPage.personality':['角色设定摘要／性格','Personality summary / Personality','性格の要約／性格','Краткая характеристика / Личность','성격 요약 / 성격','สรุปบุคลิก / บุคลิก'],
    'workPage.promptHelp':['酒馆聊天的角色指令。保存后核对原卡文件，同步后重新打开酒馆角色即可查看。','Role instructions for chats in SillyTavern. Compare the original card after saving, then sync and reopen the character in SillyTavern.','酒館チャットで使う指示です。保存して元のカードと比較・同期し、酒館で開き直します。','Инструкции персонажа для чатов SillyTavern. Сохраните, сравните с исходной карточкой, синхронизируйте и откройте персонажа заново.','SillyTavern 채팅에서 사용할 지침입니다. 저장하고 원본 카드를 비교·동기화한 다음 캐릭터를 다시 여세요.','คำสั่งของตัวละครสำหรับแชตใน SillyTavern เมื่อบันทึกแล้วให้เทียบกับไฟล์เดิม ซิงก์และเปิดตัวละครอีกครั้ง'],
    'workPage.studioStyle':['设置工作台 AI 创作文风','Set the workshop AI writing style','作業場の AI 文体を設定','Задать стиль для ИИ в мастерской','작업실 AI 문체 설정','ตั้งสำนวนสำหรับ AI ในพื้นที่เขียน'],
  };
  root.TAI18n.add({},Object.fromEntries(Object.entries(lines).map(([k,row])=>[k,Object.fromEntries(langs.map((code,i)=>[code,row[i]]))])));
})(globalThis);
