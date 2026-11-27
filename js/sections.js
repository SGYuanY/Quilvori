/* Field-level synchronization for the workshop's writing sections. */
(function(root) {
  'use strict';
  const UI=root.TAUI;
  const messages={
    "sections.review":["核对作品差异","Review changes to works","作品との差分を確認","Проверить различия с работами","작품 변경 사항 검토","ตรวจสอบความต่างกับผลงาน"],
    "sections.reviewHelp":["逐项比较已保存的内容和此段落将生成的内容，再选择要应用的字段。","Compare the saved and proposed values, then choose which fields to update.","保存済みの値と生成候補を比較し、更新する項目を選んでください。","Сравните сохранённые и предлагаемые значения и выберите поля для обновления.","저장된 값과 제안된 값을 비교한 뒤 적용할 항목을 선택하세요.","เปรียบเทียบค่าที่บันทึกไว้กับค่าที่เสนอ แล้วเลือกช่องที่ต้องการอัปเดต"],
    "sections.current":["作品当前内容","Current work","作品の現在の値","Сейчас в работе","현재 작품 내용","ค่าปัจจุบันในผลงาน"],
    "sections.proposed":["段落建议内容","Proposed by section","段落の提案","Предложено разделом","단락 제안 내용","ค่าที่ส่วนงานเสนอ"],
    "sections.use":["采用段落值","Use section value","段落の値を採用","Использовать значение раздела","단락의 값 적용","ใช้ค่าจากส่วนงาน"],
    "sections.record":["完整记录","Entire record","レコード全体","Вся запись","전체 항목","ทั้งรายการ"],
    "sections.absent":["无此项","No entry","項目なし","Запись отсутствует","항목 없음","ไม่มีรายการ"],
    "sections.apply":["应用选择","Apply selections","選択を適用","Применить выбранное","선택 사항 적용","ใช้รายการที่เลือก"],
    "sections.inSync":["此段落与作品已同步。","This section matches its works.","この段落は作品に反映されています。","Раздел уже соответствует работам.","이 단락은 작품에 반영되어 있습니다.","ส่วนงานนี้ตรงกับผลงานแล้ว"],
    "sections.lore":["世界书条目","World-book entry","ワールドブック項目","Запись книги мира","월드북 항목","รายการเวิลด์บุ๊ก"],
    "sections.enabled":["启用","Enabled","有効","Включено","활성화","เปิดใช้งาน"],
    "sections.disabled":["停用","Disabled","無効","Отключено","비활성화","ปิดใช้งาน"],
    "sections.content":["正文","Content","本文","Текст","본문","เนื้อหา"],
    "sections.message":["回复内容","Reply text","返信テキスト","Текст ответа","답장 내용","ข้อความตอบกลับ"],
    "sections.keys":["主关键词","Primary keywords","主キーワード","Основные ключи","주요 키워드","คีย์เวิร์ดหลัก"],
    "sections.pattern":["查找表达式","Find pattern","検索パターン","Шаблон поиска","검색 패턴","รูปแบบการค้นหา"],
    "sections.replacement":["替换文本","Replacement text","置換テキスト","Текст замены","바꿀 텍스트","ข้อความแทนที่"],
    "blurb.sections":["把常用的文风、视角或格式写成可复用的指令。启用一组后，从该组打开本机生成的作品。","Turn a writing style, point of view, or format into reusable instructions. Enable a group to open its works in your library.","文体・視点・書式を繰り返し使える指示にします。グループを有効にすると、生成した作品をここから開けます。","Сохраняйте стиль, точку зрения и формат в виде инструкций. Включите группу, чтобы открыть её материалы в библиотеке.","문체, 시점, 형식을 재사용할 지침으로 만드세요. 그룹을 켜면 여기서 생성된 작품을 열 수 있습니다.","เก็บสำนวน มุมมอง หรือรูปแบบงานเขียนเป็นคำสั่งที่ใช้ซ้ำได้ เปิดกลุ่มแล้วเข้าดูผลงานในคลังจากกลุ่มนั้น"],
    "sections.styleHelp":["例如用短句写敲门：“雨停了。她收起伞，敲了两下门。”启用后，工作台的 AI 创作也会参考你的文风。","Try short sentences for a knock at the door: “The rain stopped. She folded her umbrella. Two knocks.” Enabling this group also applies your style to AI writing in the workshop.","短文の例「雨がやんだ。彼女は傘を畳んだ。戸を二度たたいた。」有効にすると作業台の AI 執筆にも文体が反映されます。","Пример короткой фразы: «Дождь стих. Она сложила зонт. Дважды постучала». Когда группа включена, ИИ мастерской тоже учитывает этот стиль.","짧은 문장으로 써 보세요. “비가 그쳤다. 그녀가 우산을 접었다. 문을 두 번 두드렸다.” 이 그룹을 켜면 작업실 AI도 이 문체를 참고합니다.","ลองใช้ประโยคสั้น เช่น “ฝนหยุด เธอหุบร่ม เคาะประตูสองครั้ง” เมื่อเปิดกลุ่มนี้ AI ในพื้นที่เขียนจะใช้สำนวนที่เลือกด้วย"],
    "sections.povHelp":["指定叙述者是“我”还是第三人称，以及能否写内心活动。","Choose who tells the story and whether their thoughts appear on the page.","語り手と、心の声を描くかを指定します。","Выберите лицо повествования и укажите, можно ли передавать мысли героя.","서술 시점과 인물의 속마음을 쓸지 정합니다.","เลือกผู้เล่าเรื่องและกำหนดว่าจะบรรยายความคิดในใจหรือไม่"],
    "sections.r18Name":["R18 · 亲密描写的界限","R18 · Intimacy boundaries","R18 · 親密描写の境界","R18 · Границы близости","R18 · 친밀한 묘사의 경계","R18 · ขอบเขตของฉากใกล้ชิด"],
    "sections.r18Help":["为成年角色设定同意、停止条件和描写尺度，保存为作者注。","Set consent, stopping conditions, and the level of detail for adult characters in an author note.","成人キャラクターの同意、中止条件、描写の範囲を作者メモにまとめます。","Задайте согласие, условия остановки и степень подробности для взрослых персонажей в авторской заметке.","성인 캐릭터의 동의, 중단 조건, 묘사 수위를 작가 노트에 담습니다.","กำหนดความยินยอม เงื่อนไขหยุด และระดับรายละเอียดสำหรับตัวละครผู้ใหญ่ไว้ในบันทึกผู้เขียน"],
    "sections.nsfwName":["NSFW · 亲密场景阶段","NSFW · Intimate scene stages","NSFW · 親密な場面の段階","NSFW · Этап интимной сцены","NSFW · 친밀한 장면의 단계","NSFW · ช่วงของฉากใกล้ชิด"],
    "sections.nsfwHelp":["选择当前场景的阶段，生成作者注及一条按关键词触发的世界书条目。此组可单独启用。","Choose the stage of a scene to create an author note and a keyword-triggered world-book entry. This group has its own switch.","場面の段階を選び、作者メモとキーワードで発動するワールドブック項目を作ります。個別に有効にできます。","Выберите этап сцены для авторской заметки и записи книги мира с ключевыми словами. У группы отдельный переключатель.","장면 단계를 선택해 작가 노트와 키워드로 활성화되는 월드북 항목을 만듭니다. 독립적으로 켤 수 있습니다.","เลือกช่วงของฉากเพื่อสร้างบันทึกผู้เขียนและรายการเวิลด์บุ๊กที่เรียกด้วยคีย์เวิร์ด กลุ่มนี้มีสวิตช์แยก"],
    "sections.offHelp":["已关闭。启用此组后可选择预设。","Off. Enable this group to choose a preset.","無効です。有効にするとプリセットを選べます。","Отключено. Включите группу, чтобы выбрать шаблон.","꺼져 있습니다. 그룹을 켜면 프리셋을 고를 수 있습니다.","ปิดอยู่ เปิดกลุ่มนี้เพื่อเลือกค่าตั้งต้น"],
    "sections.outputs":["本机作品","In your library","ライブラリ内の作品","В вашей библиотеке","내 라이브러리","ผลงานในคลัง"],
    "sections.missing":["尚未生成","Not created yet","未作成","Ещё не создано","아직 생성되지 않음","ยังไม่ได้สร้าง"],
    "sections.transfer":["如何在 SillyTavern 中使用","Use these works in SillyTavern","SillyTavern で使う方法","Как использовать в SillyTavern","SillyTavern에서 사용하는 방법","วิธีใช้ผลงานใน SillyTavern"],
    "sections.stPrompt":["提示词块：打开本机提示词预设，将需要的块复制到酒馆当前使用的预设。","Prompt blocks: open the local preset and copy the blocks you want into your active SillyTavern preset.","プロンプトブロック：ローカルのプリセットを開き、必要なブロックを酒場で使用中のプリセットにコピーします。","Блоки промпта: откройте локальный пресет и скопируйте нужные блоки в активный пресет SillyTavern.","프롬프트 블록: 로컬 프리셋을 열어 필요한 블록을 SillyTavern에서 사용 중인 프리셋에 복사하세요.","บล็อกพรอมต์: เปิดพรีเซ็ตในคลัง แล้วคัดลอกบล็อกที่ต้องการไปยังพรีเซ็ตที่ใช้ใน SillyTavern"],
    "sections.stWorld":["世界书：导出该书的 JSON，到酒馆「世界信息」导入并启用。","World books: export the book as JSON, then import and activate it in World Info.","ワールドブック：本を JSON で書き出し、酒場の「World Info」で読み込んで有効にします。","Книги мира: экспортируйте книгу в JSON, импортируйте и включите её в World Info.","월드북: 책을 JSON으로 내보낸 뒤 World Info에서 가져와 활성화하세요.","เวิลด์บุ๊ก: ส่งออกหนังสือเป็น JSON แล้วนำเข้าและเปิดใช้ใน World Info"],
    "sections.stRegex":["正则：导出当前脚本，在酒馆「扩展 → Regex」中导入其 JSON。","Regex: export the selected script and import its JSON under Extensions → Regex.","正規表現：対象スクリプトを書き出し、酒場の「拡張 → Regex」で JSON を読み込みます。","Регулярные выражения: экспортируйте скрипт и импортируйте его JSON в Расширения → Regex.","정규식: 선택한 스크립트를 내보낸 뒤 확장 → Regex에서 JSON을 가져오세요.","Regex: ส่งออกสคริปต์ที่เลือก แล้วนำเข้า JSON ในส่วนขยาย → Regex"],
    "sections.stQuick":["快捷回复：导出整套回复，将 JSON 导入酒馆的 Quick Reply 扩展并启用该套。","Quick replies: export the reply set, import its JSON in the Quick Reply extension, and enable the set.","クイック返信：セットを書き出し、Quick Reply 拡張で JSON を読み込んで有効にします。","Быстрые ответы: экспортируйте набор, импортируйте JSON в расширение Quick Reply и включите набор.","빠른 답장: 세트를 내보내고 Quick Reply 확장에서 JSON을 가져와 세트를 활성화하세요.","ข้อความตอบกลับด่วน: ส่งออกชุดข้อความ นำเข้า JSON ในส่วนขยาย Quick Reply แล้วเปิดใช้ชุดนั้น"],
    "sections.short":["句子短。少形容词。一句只做一件事。","Use short sentences and few adjectives. Give each sentence one action.","短い文を使い、形容詞を控える。一文につき一つの動作を書く。","Пишите короткими предложениями. Меньше прилагательных. Одно действие на предложение.","짧은 문장을 쓰고 형용사를 줄인다. 한 문장에 한 동작만 담는다.","ใช้ประโยคสั้น ลดคำคุณศัพท์ และเล่าหนึ่งการกระทำต่อหนึ่งประโยค"],
    "sections.long":["允许把环境、触觉和光线写长。句子可以慢慢收束。","Linger over the setting, textures, and light. Let longer sentences come to a gradual close.","環境、手触り、光をじっくり描く。長い文をゆっくり締めくくる。","Подробнее описывайте обстановку, ощущения и свет. Давайте длинной фразе плавно завершиться.","환경과 촉감, 빛을 길게 묘사한다. 문장을 서서히 마무리한다.","ขยายรายละเอียดของสถานที่ สัมผัส และแสง ให้ประโยคยาวค่อย ๆ จบลง"],
    "sections.talk":["多用对白推进。叙述只补动作和停顿。","Move the scene forward through dialogue. Use narration for gestures and pauses.","会話で場面を進め、地の文には動作や間を書く。","Продвигайте сцену диалогом. В авторской речи оставьте жесты и паузы.","대화로 장면을 이끌고 서술에는 동작과 침묵을 담는다.","ดำเนินฉากด้วยบทสนทนา ใช้คำบรรยายเสริมท่าทางและจังหวะเงียบ"],
    "sections.spare":["不把情绪说满。留下没写完的半句，让空白自己工作。","Leave some feelings unspoken. Let a sentence trail off when the silence says enough.","感情を言い尽くさず、言いさした言葉と沈黙に余韻を残す。","Оставляйте часть чувств невысказанной. Пусть пауза завершает оборванную фразу.","감정을 전부 설명하지 않는다. 끝맺지 않은 말과 침묵에 여운을 둔다.","ปล่อยบางความรู้สึกไว้โดยไม่พูดออกมา เว้นประโยคค้างเมื่อความเงียบสื่อได้เพียงพอ"]
  };
  const languages=['zh','en','ja','ru','ko','th'];
  root.TAI18n.add({},Object.fromEntries(Object.entries(messages).map(([key,row])=>[key,
    Object.fromEntries(languages.map((lang,i)=>[lang,row[i]]))])));
  const SECTION_PRESET = 'preset_sections';
  const SECTION_BOOK = 'book_sections';
  const R18_TEXT = {
    hint: '成人内容只可暗示。用停顿、光线、衣料和呼吸带过，不写具体性行为。双方都是成年人。谁迟疑，就停在暗示，并留出事后照料的位置。未成年、真实伤害、未经同意，这些硬界限不能越过。',
    explicit: '这是成年人之间的场面，可以写明确的成人亲密。每一步都要有清楚、而且可以撤回的同意。激烈之后写事后照料。硬界限一出现就停止，不劝，也不绕过。',
    consent: '同意比情节优先。拒绝、僵住，或说出停止，就立刻退出亲密场面。不用醉酒、胁迫或「停不下来」越过界限。结束后先照料，再决定要不要继续。硬界限始终有效。',
  };
  const NSFW_NOTE = {
    tease: '把张力留在将碰未碰：距离、呼吸、称呼的停顿。不进入明确的性行为。',
    explicit: '可以写明确的成人亲密，但同意必须清楚，而且随时能收回。不要把沉默当成答应。',
    after: '亲密已经过去。写体温退下去、水、毯子和确认对方还好。不再加新的性行为。',
  };
  const NSFW_LORE = {
    tease: { keys: ['靠近', '呼吸', '距离'], content: '两人之间是暧昧，还没有说破。可以写几乎碰到的手和变慢的呼吸。不要写明确的性行为。再往前就先停住。' },
    explicit: { keys: ['亲吻', '衣料', '床'], content: '这是成年人的亲密。可以明确，但每一步都要听得见同意。任何迟疑都先停。硬界限不能写成可以商量。' },
    after: { keys: ['事后', '毯子', '水'], content: '事情已经结束。这一段只写余韵和照料：水、毯子、安静，以及问对方还好不好。不要重新开始。' },
  };
  const STYLE_TEXT = {
    short: '句子短。少形容词。一句只做一件事。',
    long: '允许把环境、触觉和光线写长。句子可以慢慢收束。',
    talk: '多用对白推进。叙述只补动作和停顿。',
    spare: '不把情绪说满。留下没写完的半句，让空白自己工作。',
  };
  const BOND_TEXT = {
    stranger: '两人是陌生人。称呼用「你」或身份，不用爱称。没有默许的触碰。不能越过的线是身体距离和打探私事。',
    old: '两人是旧识。可以用名字和从前的称呼，默契可以有。新的越界仍要问。不能越过的线是把旧账当成现在的许可。',
    lover: '两人是恋人。可以用约定过的称呼。亲密是互相的，不是义务。不能越过的线是一方不想继续时仍往前。',
    foe: '两人敌对。称呼冷、短。敌意不是许可。不能越过的线是借冲突发生未经同意的亲密。',
  };
  const firstPerson='用第一人称「我」来写。',thirdPerson='用第三人称，写角色名或「她/他」，不要滑进「我」。';
  const withThoughts='可以写很短的内心一念，不要长篇独白。',withoutThoughts='不写内心独白，只写看得到的动作和对白。';
  const formatText='动作用星号包起来，说出的话用引号。段末另起一行写状态：地点、时间、两人距离。';
  const stopText='安全词是「{word}」。角色或用户一说出这个词，立刻停止当前亲密或冲突，回到普通对话，先确认对方还要不要继续。不要把这个词当成玩笑带过。';
  // These are starting manuscripts. Once the user configures a fresh group, its
  // language belongs to that group and no longer follows the interface language.
  const manuscripts={
    [STYLE_TEXT.short]:messages['sections.short'].slice(1),[STYLE_TEXT.long]:messages['sections.long'].slice(1),
    [STYLE_TEXT.talk]:messages['sections.talk'].slice(1),[STYLE_TEXT.spare]:messages['sections.spare'].slice(1),
    [firstPerson]:['Write in the first person, using “I”.','一人称の「私」で書く。','Пишите от первого лица, используя «я».','일인칭인 ‘나’로 쓴다.','เขียนด้วยสรรพนามบุรุษที่หนึ่ง'],
    [thirdPerson]:['Write in the third person, using the character’s name or pronoun.','登場人物の名前や代名詞を使って三人称で書く。','Пишите от третьего лица, используя имя или местоимение персонажа.','인물의 이름이나 대명사를 사용해 삼인칭으로 쓴다.','เขียนจากมุมมองบุรุษที่สาม โดยใช้ชื่อหรือสรรพนามของตัวละคร'],
    [withThoughts]:['Allow a passing thought and keep inner monologues brief.','短い心の声を入れてもよい。長い独白は避ける。','Допускайте мимолётные мысли и короткие внутренние монологи.','짧게 스치는 생각을 담고 긴 독백은 피한다.','ใส่ความคิดที่แวบขึ้นมาได้ ให้บทพูดในใจสั้นกระชับ'],
    [withoutThoughts]:['Describe visible actions and dialogue, leaving thoughts unstated.','内面の独白を入れず、見える動きと会話を描く。','Описывайте видимые действия и диалог, оставляя мысли невысказанными.','속마음 대신 보이는 행동과 대사를 묘사한다.','บรรยายการกระทำที่มองเห็นและบทสนทนา โดยไม่บอกความคิดในใจ'],
    [BOND_TEXT.stranger]:['They are strangers. Use names or titles, respect physical distance, and let personal matters stay private.','二人は初対面。名前や肩書で呼び、距離とプライバシーを尊重する。','Они незнакомы. Используйте имена или обращения, соблюдайте дистанцию и уважайте личную жизнь.','두 사람은 초면이다. 이름이나 호칭을 쓰며 신체적 거리와 사생활을 존중한다.','ทั้งคู่ยังเป็นคนแปลกหน้า ใช้ชื่อหรือตำแหน่ง ให้พื้นที่กันและเคารพความเป็นส่วนตัว'],
    [BOND_TEXT.old]:['They are old acquaintances and may use familiar names. Ask before crossing a new boundary. Their history grants no new permission.','二人は旧知の仲。昔の呼び名を使ってもよいが、新しい一線を越える前に確認する。','Они давно знакомы и могут использовать привычные обращения. Новые границы обсуждают отдельно. Прошлое не даёт разрешения.','두 사람은 오랜 지인이다. 익숙한 호칭을 쓸 수 있지만 새로운 경계는 먼저 확인한다.','ทั้งคู่รู้จักกันมานาน ใช้ชื่อที่คุ้นเคยได้ แต่ต้องถามก่อนก้าวข้ามขอบเขตใหม่'],
    [BOND_TEXT.lover]:['They are partners and use names both have agreed on. Intimacy is mutual and optional. Stop if either wants to stop.','二人は恋人で、互いに認めた呼び名を使う。親密さを義務にせず、どちらかが望めば止まる。','Они партнёры и используют согласованные обращения. Близость добровольна. Если один хочет остановиться, оба останавливаются.','두 사람은 연인이다. 합의한 호칭을 사용하고 친밀함을 강요하지 않는다. 한 사람이 그만하길 원하면 멈춘다.','ทั้งคู่เป็นคนรัก ใช้คำเรียกที่ตกลงกัน ความใกล้ชิดขึ้นกับความสมัครใจ หยุดเมื่อฝ่ายใดฝ่ายหนึ่งต้องการ'],
    [BOND_TEXT.foe]:['They are opponents. Keep their exchanges terse. Hostility does not grant permission for intimate contact.','二人は敵対している。会話は短く冷淡に。対立を親密な接触の許可とみなさない。','Они противники. Реплики коротки и холодны. Враждебность не означает согласия на близость.','두 사람은 적대 관계다. 짧고 냉담하게 말하며 갈등을 친밀한 접촉의 동의로 여기지 않는다.','ทั้งคู่เป็นคู่ปรับ ใช้ถ้อยคำห้วนเย็นชา ความเป็นศัตรูไม่ใช่ความยินยอมให้ใกล้ชิด'],
    [R18_TEXT.hint]:['For adult characters, suggest intimacy through pauses and atmosphere. Keep it implicit, stop at hesitation, and leave room for care afterward. Respect consent and hard limits.','成人同士の親密さを間や雰囲気で暗示する。ためらいがあれば止まり、同意や限界を尊重し、その後のケアを描く。','Близость взрослых персонажей передавайте намёками и паузами. При колебании остановитесь. Уважайте согласие и границы, оставьте место для заботы.','성인 인물의 친밀함은 여운과 분위기로 암시한다. 망설이면 멈추고 동의와 경계를 존중하며 이후의 돌봄을 담는다.','สื่อความใกล้ชิดของตัวละครผู้ใหญ่ผ่านบรรยากาศและจังหวะเงียบ หยุดเมื่อมีความลังเล เคารพความยินยอมและขอบเขต และใส่ใจดูแลกันหลังฉาก'],
    [R18_TEXT.explicit]:['For adult characters, set the level of intimacy by clear consent that either can withdraw. Respect hard limits immediately and include care afterward.','成人同士の場面では、いつでも撤回できる明確な同意に沿って描写する。限界に達したらすぐ止まり、その後のケアを書く。','Для взрослых персонажей степень близости определяется явным согласием, которое можно отозвать. Сразу соблюдайте границы и покажите последующую заботу.','성인 인물의 친밀한 장면은 철회할 수 있는 분명한 동의에 맞춘다. 경계에 이르면 즉시 멈추고 이후의 돌봄을 담는다.','สำหรับตัวละครผู้ใหญ่ ให้ระดับความใกล้ชิดเป็นไปตามความยินยอมที่ชัดเจนและถอนกลับได้ เคารพขีดจำกัดทันทีและเขียนถึงการดูแลกันภายหลัง'],
    [R18_TEXT.consent]:['Consent takes priority. Stop if anyone refuses, freezes, or asks to stop. Avoid pressure. Check in and care for each other before continuing.','同意を最優先にする。拒否、硬直、中止の合図があれば止まる。圧力をかけず、互いを気遣ってから次を決める。','Согласие важнее сюжета. При отказе, оцепенении или просьбе остановитесь. Не давите. Сначала проявите заботу и уточните пожелания.','동의를 우선한다. 거부하거나 굳어 버리거나 중단을 요청하면 멈춘다. 강요하지 말고 먼저 상태와 의사를 확인한다.','ให้ความยินยอมมาก่อน หยุดเมื่อมีใครปฏิเสธ นิ่งค้าง หรือขอให้หยุด อย่ากดดัน ดูแลและถามความต้องการก่อนดำเนินต่อ'],
    [NSFW_NOTE.tease]:['Build tension through distance, pauses, and forms of address. Keep the scene implicit.','距離、間、呼び名で緊張感を描き、関係は暗示にとどめる。','Передавайте напряжение через дистанцию, паузы и обращения. Оставьте близость намёком.','거리와 침묵, 호칭으로 긴장감을 만들고 암시에 머문다.','สร้างความรู้สึกผ่านระยะห่าง จังหวะเงียบ และคำเรียก โดยคงไว้แค่การบอกเป็นนัย'],
    [NSFW_NOTE.explicit]:['Adult intimacy requires clear, ongoing consent. Silence is not agreement.','成人同士の親密さには、明確でいつでも撤回できる同意が必要。沈黙を同意とみなさない。','Для близости взрослых необходимо ясное и продолжающееся согласие. Молчание не означает согласия.','성인 간의 친밀함에는 명확하고 지속적인 동의가 필요하다. 침묵을 동의로 여기지 않는다.','ความใกล้ชิดระหว่างผู้ใหญ่ต้องมีความยินยอมชัดเจนตลอดเวลา ความเงียบไม่ใช่การตกลง'],
    [NSFW_NOTE.after]:['The intimate scene has ended. Offer water, a blanket, and a quiet check-in. Let the scene settle.','親密な場面は終わった。水や毛布を渡し、静かに様子を確かめて余韻を描く。','Сцена близости закончилась. Предложите воду, плед и спокойно спросите о самочувствии.','친밀한 장면은 끝났다. 물과 담요를 건네고 조용히 상태를 확인하며 여운을 담는다.','ฉากใกล้ชิดจบแล้ว ให้ตัวละครยื่นน้ำหรือผ้าห่ม ถามไถ่กันเบา ๆ และปล่อยให้บรรยากาศสงบลง'],
    [NSFW_LORE.tease.content]:['Their feelings are unspoken. Describe a pause or a hand that almost meets another, then hold there.','思いはまだ言葉になっていない。間や触れそうな手を描き、そこで止める。','Чувства ещё не высказаны. Опишите паузу или руки, которые почти соприкоснулись, и остановитесь на этом.','마음은 아직 말로 드러나지 않았다. 머뭇거림이나 닿을 듯한 손을 그리고 거기에 머문다.','ทั้งคู่ยังไม่เอ่ยความรู้สึก บรรยายจังหวะพักหรือมือที่เกือบแตะกัน แล้วหยุดไว้ตรงนั้น'],
    [NSFW_LORE.explicit.content]:['These adult characters check for consent at every step. Pause at hesitation and respect each firm boundary.','成人同士がその都度同意を確かめる。ためらいがあれば止まり、明確な境界を守る。','Взрослые персонажи проверяют согласие на каждом шаге. При колебании делают паузу и уважают твёрдые границы.','성인 인물들이 매 단계에서 동의를 확인한다. 망설이면 멈추고 분명한 경계를 지킨다.','ตัวละครผู้ใหญ่ยืนยันความยินยอมในทุกขั้น หยุดเมื่อมีความลังเลและเคารพขอบเขตที่กำหนด'],
    [NSFW_LORE.after.content]:['The scene is over. Focus on water, warmth, quiet, and asking how the other person feels.','場面は終わった。水、ぬくもり、静けさ、相手への気遣いを中心に描く。','Сцена окончена. Сосредоточьтесь на воде, тепле, тишине и вопросе о самочувствии.','장면은 끝났다. 물과 온기, 고요함, 서로의 상태를 묻는 모습에 집중한다.','ฉากจบแล้ว เน้นน้ำดื่ม ความอบอุ่น ความเงียบ และการถามว่าสบายดีไหม'],
    [formatText]:['Wrap actions in asterisks and dialogue in quotation marks. End with a separate line for place, time, and the distance between the characters.','動作をアスタリスク、台詞を引用符で囲む。末尾に場所、時刻、人物間の距離を別行で記す。','Выделяйте действия звёздочками, а речь — кавычками. В конце укажите отдельной строкой место, время и расстояние между героями.','동작은 별표로, 대사는 따옴표로 감싼다. 끝에 장소, 시간, 인물 사이의 거리를 한 줄로 적는다.','คร่อมการกระทำด้วยดอกจันและบทพูดด้วยอัญประกาศ ขึ้นบรรทัดท้ายใหม่เพื่อระบุสถานที่ เวลา และระยะห่างระหว่างตัวละคร'],
    [stopText]:['The stop word is “{word}”. When anyone says it, end the current intimate or tense scene, return to ordinary dialogue, and check whether they want to continue.','停止の合図は「{word}」。誰かが言ったら親密な場面や対立を止め、普通の会話に戻って続けたいかを確認する。','Стоп-слово — «{word}». Услышав его, завершите сцену близости или конфликта, вернитесь к обычному разговору и уточните, хочет ли человек продолжить.','중단 단어는 ‘{word}’이다. 누군가 말하면 친밀한 장면이나 갈등을 즉시 멈추고 일상 대화로 돌아가 계속할 의사를 확인한다.','คำหยุดคือ “{word}” เมื่อใครพูดคำนี้ ให้หยุดฉากใกล้ชิดหรือความขัดแย้ง กลับสู่บทสนทนาปกติและถามว่าต้องการดำเนินต่อหรือไม่'],
    '文风':['Style','文体','Стиль','문체','สำนวน'], '人称':['Point of view','視点','Точка зрения','시점','มุมมอง'],
    '关系边界':['Relationship boundaries','関係の境界','Границы отношений','관계의 경계','ขอบเขตความสัมพันธ์'], '安全词':['Stop word','停止の合図','Стоп-слово','중단 단어','คำหยุด'],
    '输出格式':['Output format','出力書式','Формат вывода','출력 형식','รูปแบบผลลัพธ์'], '动作用星号，对白用引号':['Asterisks for actions, quotes for dialogue','動作にはアスタリスク、台詞には引用符','Звёздочки для действий, кавычки для реплик','동작에는 별표, 대사에는 따옴표','ดอกจันสำหรับการกระทำ อัญประกาศสำหรับบทพูด'],
    '叙翎集段落':['Quilvori sections','叙翎集の段落','Разделы Quilvori','Quilvori 단락','ส่วนงาน Quilvori'], '段落预设写入的条目':['Entries from section presets','段落プリセットから生成した項目','Записи из шаблонов разделов','단락 프리셋에서 생성한 항목','รายการจากค่าตั้งต้นของส่วนงาน'],
    '称呼':['address','呼び名','обращение','호칭','คำเรียก'],'你':['you','あなた','ты','너','คุณ'],
    '靠近':['closer','近づく','ближе','다가가','เข้าใกล้'],'呼吸':['breath','息','дыхание','숨','ลมหายใจ'],'距离':['distance','距離','расстояние','거리','ระยะห่าง'],
    '亲吻':['kiss','口づけ','поцелуй','입맞춤','จูบ'],'衣料':['fabric','布地','ткань','옷감','เนื้อผ้า'],'床':['bed','ベッド','кровать','침대','เตียง'],
    '事后':['afterward','その後','после','이후','หลังจากนั้น'],'毯子':['blanket','毛布','плед','담요','ผ้าห่ม'],'水':['water','水','вода','물','น้ำ'],
  };
  function manuscript(source,lang){
    return manuscripts[source]?.[languages.indexOf(lang)-1] || source;
  }

  function sectionText(group, fallback) {
    if (String(group.custom || '').trim()) return String(group.custom).trim();
    if (String(group.text || '').trim()) return String(group.text).trim();
    return fallback || '';
  }

  const definitions = {
    r18: {name:'R18', defaults:R18_TEXT}, nsfw:{name:'NSFW',defaults:NSFW_NOTE},
    style:{name:'文风',defaults:STYLE_TEXT}, pov:{name:'人称'}, bond:{name:'关系边界',defaults:BOND_TEXT},
    safe:{name:'安全词'}, format:{name:'输出格式'},
  };
  const containers={
    promptPresets:{id:SECTION_PRESET,children:'blocks',name:'叙翎集段落'},
    worldBooks:{id:SECTION_BOOK,children:'entries',name:'叙翎集段落',description:'段落预设写入的条目'},
    quickReplySets:{id:'sec_format_qr',children:'replies',name:'输出格式'},
  };
  const destinationNames={promptPresets:'提示词块',worldBooks:'sections.lore',regexScripts:'正则脚本',quickReplySets:'快捷回复'};
  const fieldNames={enabled:'sections.enabled',disabled:'sections.disabled',content:'sections.content',message:'sections.message',keys:'sections.keys',findRegex:'sections.pattern',replaceString:'sections.replacement'};
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const object=value=>value && typeof value==='object' && !Array.isArray(value);
  function safeText(word,lang) {
    return manuscript(stopText,lang).replace('{word}',()=>String(word || '').trim() || '停');
  }
  function template(key,s,lang=s.templateLanguage) {
    if(key==='safe')return safeText(s.word,lang);
    if(key==='pov')return [s.preset==='first'?firstPerson:thirdPerson,s.thoughts?withThoughts:withoutThoughts].map(line=>manuscript(line,lang)).join(lang && !['zh','ja'].includes(lang)?' ':'');
    if(key==='format')return manuscript(formatText,lang);
    const options=definitions[key].defaults;
    return manuscript(options[s.preset] || Object.values(options)[0],lang);
  }
  // Creation defaults apply once. Subsequent synchronization owns only the fields
  // driven by the corresponding section's controls.
  function targets(key,s) {
    const content=sectionText(s,template(key,s)), enabled=!!(s.on && content);
    const localized=source=>manuscript(source,s.templateLanguage);
    const results=[];
    if(['r18','nsfw','style','pov'].includes(key))results.push({
      bucket:'promptPresets',id:'sec_'+key,defaults:{name:localized(definitions[key].name),kind:'author_note',role:'system'},fields:{content,enabled},
    });
    if(['nsfw','bond','safe'].includes(key)) {
      const native=NSFW_LORE[s.preset] || NSFW_LORE.tease;
      const defaults={comment:localized(definitions[key].name),keys:['称呼','你'].map(localized),secondaryKeys:[],constant:key==='safe',selective:key!=='safe',
        order:{nsfw:30,bond:20,safe:1}[key],position:key==='nsfw'?'after_char':'before_char',depth:4,outletName:''};
      const fields={content,enabled:!!s.on};
      if(key==='safe')fields.keys=[String(s.word||'').trim() || '停'];
      if(key==='nsfw'){fields.keys=native.keys.map(localized);fields.content=String(s.custom||'').trim()?content:localized(native.content);}
      results.push({bucket:'worldBooks',id:key==='nsfw'?'sec_nsfw_lore':'sec_'+key,defaults,fields});
    }
    if(key==='format') {
      results.push({bucket:'regexScripts',id:'sec_format_rx',defaults:{scriptName:localized('输出格式'),trimStrings:[],placement:[2],markdownOnly:false,promptOnly:false,runOnEdit:false,substituteRegex:0,minDepth:null,maxDepth:null},
        fields:{findRegex:String(s.find || '').trim() || '/（([^）\\n]+)）/g',replaceString:s.replace || '*$1*',disabled:!s.on}});
      results.push({bucket:'quickReplySets',id:'sec_format_reply',defaults:{label:localized('输出格式'),color:'#d6ff3f',title:localized('动作用星号，对白用引号')},
        fields:{message:content},removeWhenOff:true});
    }
    return results.map(target=>({...target,language:s.templateLanguage}));
  }
  function rowsFor(lib,target,create=false) {
    const rows=lib[target.bucket], layout=containers[target.bucket];
    if(!layout)return rows;
    let parent=rows.find(row=>row.id===layout.id);
    if(!parent && create) {
      parent={id:layout.id,name:manuscript(layout.name,target.language),[layout.children]:[]};
      if(layout.description)parent.description=manuscript(layout.description,target.language);
      if(target.bucket==='worldBooks')rows.push(parent);else rows.unshift(parent);
    }
    return parent?.[layout.children];
  }
  const fullRow=(target,fields)=>({id:target.id,...target.defaults,...fields});
  function matchesGeneratedRow(row,target,baseline) {
    if(!object(baseline))return false;
    const generated=fullRow(target,baseline), keys=Object.keys(row);
    return keys.length===Object.keys(generated).length && keys.every(key=>
      Object.hasOwn(generated,key) && equal(row[key],generated[key]));
  }
  function differences(lib,key,previous) {
    const section=lib.sections[key],desired=targets(key,section);
    const old=previous && targets(key,previous);
    const ops=[];
    for(const [i,target] of desired.entries()) {
      const row=rowsFor(lib,target)?.find(r=>r.id===target.id);
      const previousFields=old?.[i].fields;
      const record=section.sync?.[target.id];
      const add=(field,before,after,automatic)=>ops.push({target,field,before,after,automatic});
      if(!row) {
        if(section.on && (!previous || previous.on!==section.on || !equal(previousFields,target.fields))) {
          // A previously known row that went missing may have been deliberately deleted.
          add('$row',null,fullRow(target,target.fields),!!record?.removed || (!record && previous?.on===false));
        }
      } else if(target.removeWhenOff && !section.on) {
        if(!previous || previous.on)add('$row',row,null,matchesGeneratedRow(row,target,record?.base));
      } else {
        for(const [field,after] of Object.entries(target.fields)) {
          if(equal(row[field],after) || (previousFields && equal(previousFields[field],after)))continue;
          add(field,row[field],after,!!record?.base && Object.hasOwn(record.base,field) && equal(row[field],record.base[field]));
        }
      }
    }
    return ops;
  }
  // Baselines contain only values actually applied to a work. Missing provenance
  // never grants permission to replace existing values in an older library.
  function syncRecord(section,id) {
    if(!object(section.sync))section.sync={};
    if(!object(section.sync[id]))section.sync[id]={};
    return section.sync[id];
  }
  function write(lib,key,op) {
    const {target,field,after}=op, record=syncRecord(lib.sections[key],target.id);
    const rows=rowsFor(lib,target,true), index=rows.findIndex(row=>row.id===target.id);
    if(field==='$row') {
      if(after===null){rows.splice(index,1);delete record.base;record.removed=true;}
      else {rows.push(structuredClone(after));record.base=structuredClone(target.fields);delete record.removed;}
    } else {
      rows[index][field]=structuredClone(after);
      if(!object(record.base))record.base={};
      record.base[field]=structuredClone(after);delete record.removed;
    }
  }
  function scopesFor(lib,ops) {
    const scopes=[['sections']],seen=new Set();
    for(const {target} of ops) {
      const {bucket,id}=target,ownerId=containers[bucket]?.id || id;
      if(!lib[bucket].some(row=>row.id===ownerId))return null;
      if(!seen.has(bucket)){scopes.push([bucket,ownerId]);seen.add(bucket);}
    }
    return scopes;
  }
  function change(lib,key,update) {
    const section=lib.sections[key], previous={...section};
    update(section);
    const changes=differences(lib,key,previous);
    const automatic=changes.filter(op=>op.automatic),scopes=scopesFor(lib,automatic);
    for(const op of automatic)write(lib,key,op);
    if(scopes)for(const scope of scopes)UI.markDirty(...scope);
    else UI.markDirty();
  }
  function reviewValue(value) {
    if(value==null)return UI.t('sections.absent');
    if(Array.isArray(value))return value.map(reviewValue).join(' · ') || '∅';
    if(object(value))return Object.entries(value).map(([key,item])=>
      UI.t(fieldNames[key] || key)+' · '+reviewValue(item)).join('\n');
    return String(value);
  }
  async function review(key) {
    try {
      const planned=differences(UI.state.lib,key);
      if(!planned.length){UI.toast(UI.t('sections.inSync'));return;}
      const signature=ops=>JSON.stringify(ops.map(({target,field,before,after})=>[target.id,field,before,after]));
      const revision=signature(planned);
      const content=document.createElement('div');content.className='integrity-content';
      const choices=planned.map(op=>{
        const row=document.createElement('article');row.className='paper stack';
        const heading=document.createElement('strong');
        const label=UI.t(destinationNames[op.target.bucket])+' · '+UI.t(op.field==='$row'?'sections.record':fieldNames[op.field]);
        heading.textContent=label;
        const columns=document.createElement('div');columns.className='integrity-diff';
        for(const [key,val] of [['sections.current',op.before],['sections.proposed',op.after]]) {
          const col=document.createElement('section'),title=document.createElement('b'),value=document.createElement('pre');
          title.textContent=UI.t(key);value.dataset.noTranslate='';value.textContent=reviewValue(val);
          col.append(title,value);columns.append(col);
        }
        const select=document.createElement('select');select.dataset.sectionChoice=op.field;select.setAttribute('aria-label',label);
        select.add(new Option(UI.t('保留当前'),'keep'));select.add(new Option(UI.t('sections.use'),'section'));
        row.append(heading,columns,select);content.append(row);return select;
      });
      const answer=await UI.ask({title:UI.t('sections.review'),body:UI.t('sections.reviewHelp'),content,
        actions:[{id:'cancel',label:UI.t('取消')},{id:'apply',label:UI.t('sections.apply'),kind:'btn-primary'}]});
      if(answer!=='apply')return;
      const live=UI.state.lib,now=differences(live,key);
      if(signature(now)!==revision)throw Error('资料库已变化，请重新打开。');
      const chosen=now.filter((_,i)=>choices[i].value==='section'),scopes=scopesFor(live,chosen);
      if(!chosen.length)return;
      const section=structuredClone(live.sections[key]), candidate={...live,sections:{...live.sections,[key]:section}};
      for(const {target} of chosen)if(candidate[target.bucket]===live[target.bucket]){
        const owner=containers[target.bucket]?.id || target.id;
        candidate[target.bucket]=live[target.bucket].map(row=>row.id===owner?structuredClone(row):row);
      }
      for(const op of chosen)write(candidate,key,op);
      const book=chosen.some(op=>op.target.bucket==='worldBooks') && live.worldBooks.find(row=>row.id===containers.worldBooks.id);
      await root.TAHistory.commitWorks(candidate,book ? [['worldBooks',book]] : [],{reason:'段落同步前',scopes});
      UI.renderStage();
    } catch(error) {UI.toast(UI.t(error.message),{kind:'error'});}
  }
  function openOutput(target) {
    const owner=containers[target.bucket];
    if(target.bucket==='promptPresets')return root.TASearch.open({kind:'block',parentId:owner.id,id:target.id,field:'content'});
    if(target.bucket==='worldBooks')return root.TASearch.open({kind:'entry',parentId:owner.id,id:target.id,field:'content'});
    if(target.bucket==='regexScripts')return root.TASearch.open({kind:'regex',id:target.id,field:'findRegex'});
    UI.state.sel.qr=owner.id;
    UI.go('quick');
    const reply=document.querySelector('#qr-list [data-id="'+CSS.escape(target.id)+'"] [data-k="message"]');
    if(reply){reply.focus({preventScroll:true});reply.scrollIntoView({block:'center'});}
  }
  function render(stage) {
    const lib=UI.state.lib,s=lib.sections;
    const label=key=>UI.esc(UI.t(key));
    const fresh=new Set(Object.keys(definitions).filter(key=>{
      const group=s[key];
      return !group.on && !group.sync && !group.templateLanguage && !group.text && !group.custom &&
        !targets(key,group).some(target=>rowsFor(lib,target)?.some(row=>row.id===target.id));
    }));
    function displayText(key){
      const group=s[key];
      if(String(group.custom || '').trim())return group.custom;
      if(String(group.text || '').trim())return group.text;
      return template(key,group,fresh.has(key)?root.TAI18n.prefs.lang:group.templateLanguage);
    }
    const groups={
      style:['文风','sections.styleHelp','填入的作者注',[['short','短句干脆'],['long','长描写'],['talk','对话为主'],['spare','冷一点的留白']]],
      pov:['人称和视角','sections.povHelp','填入的作者注'],
      bond:['关系边界','写成一条世界书：称呼，以及不能越过的那条线。','填入的世界书',[['stranger','陌生人'],['old','旧识'],['lover','恋人'],['foe','敌对']]],
      format:['输出格式','同时写入一条正则：把中文括号里的动作改成星号。可以在正则脚本里再改。','快捷回复'],
      safe:['安全词和停止条件','恒定条目。角色或用户说出这个词，就停止。','填入的恒定世界书'],
      r18:['sections.r18Name','sections.r18Help','填入的作者注',[['hint','只暗示'],['explicit','明确成人'],['consent','强制同意边界']]],
      nsfw:['sections.nsfwName','sections.nsfwHelp','填入的作者注',[['tease','暧昧拉扯'],['explicit','明确成人'],['after','事后余韵']]],
    };
    function buttons(key,options,attr='data-pick'){
      return options.map(([id,name])=>{
        const selected=s[key].preset===id;
        return `<button type="button" class="btn btn-small${selected?' btn-primary':''}" ${attr}="${id}" aria-pressed="${selected}">${label(name)}</button>`;
      }).join('');
    }
    function groupCard(key,[title,help,field,options]){
      const group=s[key],adult=key==='r18' || key==='nsfw';
      let controls='';
      if(adult && !group.on){
        controls=`<p class="section-off-note">${label('sections.offHelp')}</p>`;
      }else{
        if(options)controls=`<div class="row">${buttons(key,options)}</div>`;
        if(key==='pov')controls=`<div class="row">${buttons(key,[['first','第一人称'],['third','第三人称']],'data-pov')}
          <label class="check"><input type="checkbox" id="pov-thoughts" ${group.thoughts?'checked':''}>${label('写内心')}</label></div>`;
        if(key==='safe')controls=UI.field('安全词',`<input data-word type="text" value="${UI.esc(group.word ?? '停')}">`);
        controls+=UI.field(field,`<textarea data-live="${key}" rows="2">${UI.esc(displayText(key))}</textarea>`);
        const placeholder=key==='format'?'有字时盖过这条快捷回复':'有字时盖过预设';
        controls+=`<details class="section-custom" ${group.custom?'open':''}><summary>${label('自定义')}</summary>
          <textarea aria-label="${label('自定义')}" data-custom="${key}" rows="2" placeholder="${label(placeholder)}">${UI.esc(group.custom || '')}</textarea></details>`;
      }
      return `<section class="paper stack section-group" data-section-group="${key}"><header class="section-group-head">
        <h3><label class="check"><input type="checkbox" data-sec="${key}" ${group.on?'checked':''}>${label(title)}</label></h3>
        <span class="section-toggle-state">${label(group.on?'sections.enabled':'sections.disabled')}</span></header>
        <p class="help">${label(help)}</p>${controls}
        <footer class="section-outputs"><strong>${label('sections.outputs')}</strong><div class="row" data-section-outputs="${key}"></div>
        <button type="button" class="btn btn-small" data-review-section="${key}">${label('sections.review')}</button></footer></section>`;
    }
    stage.innerHTML=`<div class="stack section-workshop"><p class="section-intro">${label('blurb.sections')}</p><details class="section-transfer"><summary>${label('sections.transfer')}</summary>
      <ul>${['sections.stPrompt','sections.stWorld','sections.stRegex','sections.stQuick'].map(key=>'<li>'+label(key)+'</li>').join('')}</ul></details>
      ${Object.entries(groups).map(([key,definition])=>groupCard(key,definition)).join('')}</div>`;
    function outputs(key){
      const host=stage.querySelector('[data-section-outputs="'+key+'"]');
      host.replaceChildren(...targets(key,s[key]).map(target=>{
        const row=rowsFor(lib,target)?.find(item=>item.id===target.id),kind=UI.t(destinationNames[target.bucket]);
        const item=document.createElement(row?'button':'span');
        item.className=row?'btn btn-small section-output-link':'section-output-missing';
        item.append(document.createTextNode(kind+' · '));
        const name=document.createElement('span');
        if(row){
          name.dataset.noTranslate='';
          name.textContent=row.name || row.comment || row.scriptName || row.label || target.id;
          item.type='button';item.dataset.openSectionOutput=target.id;item.onclick=()=>openOutput(target);
          item.title=UI.t('打开')+' · '+kind+' · '+name.textContent;
        }else name.textContent=UI.t('sections.missing');
        item.append(name);return item;
      }));
    }
    function refresh(key) {
      const reviewButton=stage.querySelector('[data-review-section="'+key+'"]');
      reviewButton.hidden=differences(lib,key).length===0;
      const value=s[key];
      for(const [selector,text] of [['live',displayText(key)],['custom',value.custom || '']]) {
        const area=stage.querySelector('[data-'+selector+'="'+key+'"]');
        if(area && area!==document.activeElement && area.value!==text)area.value=text;
      }
    }
    function update(key,mutate,focusSelector) {
      if(UI.state.lib!==lib){UI.renderStage();return;}
      change(lib,key,group=>{
        if(fresh.has(key) && !group.templateLanguage)group.templateLanguage=root.TAI18n.prefs.lang;
        mutate(group);
      });
      if(focusSelector){
        UI.renderStage();
        stage.querySelector('[data-section-group="'+key+'"] '+focusSelector)?.focus({preventScroll:true});
      }else refresh(key);
    }
    stage.querySelectorAll('[data-sec]').forEach(box=>{
      const key=box.dataset.sec;
      stage.querySelector('[data-review-section="'+key+'"]').onclick=()=>review(key);
      outputs(key);refresh(key);
      box.onchange=()=>update(key,group=>{
        if(key==='style' && box.checked && group.templateLanguage && !group.custom && !group.text)group.text=template(key,group);
        group.on=box.checked;
      },'[data-sec]');
    });
    stage.querySelectorAll('[data-pick]').forEach(button=>{
      const key=button.closest('section').querySelector('[data-sec]').dataset.sec;
      button.onclick=()=>update(key,group=>{
        group.preset=button.dataset.pick;
        if(!String(group.custom || '').trim())group.text=template(key,group);
      },'[data-pick="'+button.dataset.pick+'"]');
    });
    stage.querySelectorAll('[data-pov]').forEach(button=>{
      button.onclick=()=>update('pov',group=>{
        group.preset=button.dataset.pov;if(!String(group.custom||'').trim())group.text='';
      },'[data-pov="'+button.dataset.pov+'"]');
    });
    const thoughts=stage.querySelector('#pov-thoughts');
    thoughts.onchange=()=>update('pov',group=>{
      group.thoughts=thoughts.checked;if(!String(group.custom||'').trim())group.text='';
    },'#pov-thoughts');
    const word=stage.querySelector('[data-word]');
    let composing=false;
    function changeWord() {
      if(!word.isConnected || word.value===s.safe.word)return;
      update('safe',group=>{
        if(group.text===safeText(group.word,group.templateLanguage))group.text='';
        group.word=word.value;
      });
    }
    word.addEventListener('compositionstart',()=>{composing=true;});
    word.addEventListener('compositionend',()=>{composing=false;queueMicrotask(changeWord);});
    word.oninput=event=>{if(!composing && !event.isComposing)changeWord();};
    stage.querySelectorAll('[data-live]').forEach(area=>{
      const key=area.dataset.live;
      area.oninput=()=>update(key,group=>{
        if(String(group.custom||'').trim())group.custom=area.value;else group.text=area.value;
      });
    });
    stage.querySelectorAll('[data-custom]').forEach(area=>{
      area.oninput=()=>update(area.dataset.custom,group=>{group.custom=area.value;});
    });
  }
  root.TASections={render};
})(globalThis);
