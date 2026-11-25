/* Language used by the studio's optional creative conversation and its local prompts. */
(function (root) {
  "use strict";
  const languages = ["zh", "en", "ja", "ru", "ko", "th"];
  function translations(rows) {
    return Object.fromEntries(Object.entries(rows).map(([key, row]) =>
      [key, Object.fromEntries(languages.map((lang, i) => [lang, row[i]]))]));
  }

  const labels = [
    ["本地提问", "Local question", "ローカルの質問", "Локальный вопрос", "기기에서 만든 질문", "คำถามจากแอป"],
    ["本地灵感", "Local idea", "ローカルのアイデア", "Локальная идея", "기기에서 만든 아이디어", "ไอเดียจากแอป"],
    ["模型没有返回可用的提问或灵感。", "The model provided no usable questions or ideas.", "モデルから使える質問や案が返りませんでした。", "Модель не предложила подходящих вопросов или идей.", "모델이 사용할 수 있는 질문이나 아이디어를 주지 않았습니다.", "โมเดลไม่ได้ส่งคำถามหรือไอเดียที่ใช้ได้"],
    ["模型没有返回讨论答复。可以重试，也可以把你的想法直接用于改稿。", "The model gave no discussion reply. Try again, or revise using your own note.", "モデルから相談への返答がありません。もう一度試すか、入力した意見を直接改稿に使えます。", "Модель не ответила на обсуждение. Попробуйте снова или доработайте черновик по своей заметке.", "모델이 대화에 답하지 않았습니다. 다시 시도하거나 입력한 의견으로 바로 수정하세요.", "โมเดลไม่ได้ตอบการสนทนา ลองอีกครั้งหรือใช้ความเห็นที่พิมพ์ไว้แก้ร่างได้เลย"],
    ["模型没有给出可用问题。下面是本地生成的可选问题。", "The model gave no usable questions. The app has supplied optional questions below.", "モデルから使える質問が返らなかったため、アプリが任意の質問を用意しました。", "Модель не предложила подходящих вопросов. Ниже — необязательные вопросы от приложения.", "모델이 쓸 만한 질문을 주지 않아 앱에서 선택 질문을 준비했습니다.", "โมเดลไม่ได้ให้คำถามที่ใช้ได้ แอปจึงเตรียมคำถามให้เลือกตอบด้านล่าง"],
    ["模型没有给出可用灵感。下面是本地提供的可选方向。", "The model gave no usable ideas. The app has supplied optional directions below.", "モデルから使える案が返らなかったため、アプリが方向性の候補を用意しました。", "Модель не предложила подходящих идей. Ниже — возможные направления от приложения.", "모델이 쓸 만한 아이디어를 주지 않아 앱에서 방향을 제안합니다.", "โมเดลไม่ได้ให้ไอเดียที่ใช้ได้ แอปจึงเตรียมแนวทางให้เลือกด้านล่าง"],
    ["请先输入修改意见，或聊一聊再改稿。", "Enter a revision note or discuss an idea first.", "修正したい点を入力するか、先にアイデアを相談してください。", "Введите пожелание к правке или сначала обсудите идею.", "수정 의견을 입력하거나 먼저 아이디어를 논의하세요.", "พิมพ์สิ่งที่ต้องการแก้ หรือคุยเรื่องไอเดียก่อน"],
    ["按输入改稿", "Revise from my note", "入力した内容で改稿", "Исправить по моей заметке", "입력한 의견으로 수정", "แก้ร่างตามที่พิมพ์"],
    ["按最近讨论改稿", "Revise from our discussion", "直近の相談を反映", "Исправить по итогам обсуждения", "최근 대화로 수정", "แก้ร่างตามที่คุยล่าสุด"],
    ["讨论已有答复。可以继续聊，也可以按最近讨论改稿。", "The reply is ready. Continue the discussion or use it to revise the draft.", "返答が届きました。相談を続けるか、このやり取りを改稿に反映できます。", "Ответ готов. Продолжите обсуждение или используйте его для правки.", "답변이 도착했습니다. 대화를 이어 가거나 최근 대화로 초안을 수정할 수 있습니다.", "ได้รับคำตอบแล้ว คุยต่อหรือนำสิ่งที่คุยไปแก้ร่างได้"],
  ];
  const templates = translations({
    "dialogue.useLastDiscussion": [
      "根据最近讨论中的这条回复修改所选模块，结合对话中我的要求。\n{reply}",
      "Revise the selected modules using this reply from our latest discussion and my request in that exchange.\n{reply}",
      "直近の相談の次の返答と、その際の私の要望を踏まえ、選択したモジュールを改稿してください。\n{reply}",
      "Доработай выбранные модули, учитывая этот ответ из последнего обсуждения и мою просьбу в нём.\n{reply}",
      "최근 대화의 다음 답변과 당시의 내 요청을 바탕으로 선택한 모듈을 수정해 주세요.\n{reply}",
      "แก้โมดูลที่เลือกตามคำตอบล่าสุดนี้และคำขอของฉันในการสนทนาครั้งนั้น\n{reply}",
    ],
  });
  root.TAI18n?.add(translations(Object.fromEntries(labels.map(row => [row[0], row]))), templates);

  const words = translations({
    topic: ["创作构想「{brief}」", "“{brief}”", "今回の構想「{brief}」", "Для замысла «{brief}»", "‘{brief}’에 관해", "สำหรับ «{brief}»"],
    characterQ: ["如果这名角色今天只能守住一样东西，会守住什么？为了它，愿意得罪谁？", "What would this character protect today, even if it meant making an enemy?", "この人物が、誰かを敵に回してでも今日守りたいものは何ですか？", "Что персонаж защитит сегодня, даже если наживёт себе врага?", "이 인물이 오늘 누군가를 적으로 돌려서라도 지키려는 것은 무엇인가요?", "วันนี้ตัวละครจะปกป้องสิ่งใด แม้ต้องยอมเป็นศัตรูกับใครสักคน?"],
    worldQ: ["当地人每天要遵守哪条规矩？第一次打破它，会付出什么代价？", "Which everyday rule do the locals follow, and what does it cost to break it for the first time?", "住人が毎日守る決まりは何ですか？ 初めて破ると何を失いますか？", "Какое правило местные соблюдают каждый день и чем обернётся его первое нарушение?", "주민들이 매일 지키는 규칙은 무엇이며, 처음 어기면 어떤 대가를 치르나요?", "คนท้องถิ่นต้องทำตามกฎใดทุกวัน และการฝ่าฝืนครั้งแรกจะมีผลอย่างไร?"],
    relationQ: ["哪两个人想要同一件事，却各自向对方隐瞒了动机？", "Which two people want the same thing but keep their reasons from each other?", "同じものを望みながら、互いに理由を隠している二人は誰ですか？", "Какие два человека добиваются одного и того же, но скрывают друг от друга свои мотивы?", "같은 것을 원하면서 서로에게 이유를 숨기는 두 사람은 누구인가요?", "คนสองคนใดต้องการสิ่งเดียวกันแต่ต่างปิดบังเหตุผลของตน?"],
    interactionQ: ["玩家会在哪个具体时刻用到它？举一句输入和你希望看到的回应，好吗？", "At what exact moment will the player use this? What is one example input and the response you want?", "プレイヤーがこれを使うのはどの場面ですか？ 入力の一例と期待する反応は何ですか？", "В какой момент игрок этим воспользуется? Приведите пример ввода и ожидаемого ответа.", "플레이어가 어느 순간에 이것을 사용할까요? 입력 예시와 원하는 반응을 하나씩 알려 주세요.", "ผู้เล่นจะใช้สิ่งนี้ในจังหวะไหน? ลองยกตัวอย่างข้อความและคำตอบที่อยากเห็นได้ไหม?"],
    sceneQ: ["开场的哪一个细节，会让玩家主动做出第一个选择？", "What detail in the opening would prompt the player to make their first choice?", "冒頭のどんな描写が、プレイヤー自身の最初の選択を促しますか？", "Какая деталь в начале подтолкнёт игрока к первому выбору?", "첫 장면의 어떤 단서가 플레이어의 첫 선택을 이끌까요?", "รายละเอียดใดในฉากเปิดจะชวนให้ผู้เล่นตัดสินใจเป็นครั้งแรก?"],
    revealQ: ["哪件事希望读者一开始就知道，哪件事想留到后来才揭晓？", "What should readers know from the start, and what should they discover later?", "読者に最初から伝えたいことと、後で明かしたいことは何ですか？", "Что читателю стоит знать сразу, а что он должен открыть позже?", "독자가 처음부터 알아야 할 사실과 나중에 발견해야 할 사실은 무엇인가요?", "อะไรที่อยากให้ผู้อ่านรู้ตั้งแต่แรก และอะไรที่อยากเก็บไว้เปิดเผยภายหลัง?"],
    characterI: ["让角色随身带一件不肯送人的小物件。第一次见面时，让玩家因它开口，而角色避开真正的来历。", "Give the character a keepsake they refuse to part with. Let the player ask about it at their first meeting while the character sidesteps its real origin.", "人物に手放せない小さな形見を持たせる。初対面でプレイヤーが尋ねると、本人はその本当の由来をはぐらかす。", "Дайте персонажу вещицу, с которой он не расстаётся. При первой встрече игрок спросит о ней, а персонаж утаит её происхождение.", "인물에게 절대 내주지 않는 물건을 하나 주세요. 첫 만남에서 플레이어가 물건의 내력을 물으면 인물이 대답을 피하게 합니다.", "ให้ตัวละครพกของชิ้นเล็กที่ไม่ยอมยกให้ใคร เมื่อผู้เล่นถามถึงมันในการพบกันครั้งแรก ตัวละครกลับเลี่ยงที่จะเล่าที่มา"],
    worldI: ["把一条地方规矩写成两个相连的条目。一条记录大家遵守的习惯，另一条记下上次破例后留下的痕迹。", "Write two connected entries about one local rule. The first records a daily custom, the second the traces left by its last violation.", "ひとつの土地の決まりを二つの項目に分ける。ひとつに日常の習わしを、もうひとつに前回それを破った痕跡を書く。", "Посвятите местному правилу две связанные записи. В первой опишите повседневный обычай, во второй — следы его последнего нарушения.", "지역 규칙 하나를 두 항목으로 엮으세요. 첫 항목에는 주민들의 관습을, 다음 항목에는 지난번 규칙을 어긴 흔적을 담습니다.", "เขียนกฎท้องถิ่นหนึ่งข้อเป็นสองรายการที่เชื่อมกัน รายการแรกบอกธรรมเนียมประจำวัน อีกรายการบอกถึงร่องรอยจากการฝ่าฝืนครั้งก่อน"],
    relationI: ["给两个角色安排同一段往事，各自记住一个不同的细节。让这个差异在他们合作时第一次浮现。", "Give two characters different memories of the same event. Let the discrepancy emerge the first time they have to work together.", "二人に同じ過去の出来事を別々の細部で覚えさせる。初めて力を合わせる場面で、その食い違いが表に出る。", "Пусть два персонажа запомнят разные детали одного события. Расхождение всплывёт, когда им впервые придётся действовать вместе.", "두 인물이 같은 사건의 다른 부분을 기억하게 하세요. 함께 움직여야 하는 첫 순간에 기억의 어긋남이 드러납니다.", "ให้ตัวละครสองคนจำรายละเอียดต่างกันจากเหตุการณ์เดียวกัน แล้วเผยความคลาดเคลื่อนเมื่อทั้งคู่ต้องร่วมมือกันครั้งแรก"],
    interactionI: ["从玩家在场景中最常说的一句话入手。写出理想回应，再留一句措辞相近但应得到不同回应的反例。", "Start with something a player often says in this scene. Write the response you want, then a similar line that should get a different response.", "その場面でプレイヤーがよく口にする一言から始める。理想の反応と、似ていても違う反応が必要な例を書く。", "Возьмите частую реплику игрока в этой сцене. Напишите желаемый отклик, затем похожую реплику, на которую ответ должен отличаться.", "이 장면에서 플레이어가 자주 할 말부터 쓰세요. 원하는 답을 정한 뒤, 비슷한 말이지만 반응은 달라야 하는 예도 적습니다.", "เริ่มจากประโยคที่ผู้เล่นมักพูดในฉากนี้ เขียนคำตอบที่อยากเห็น แล้วเพิ่มประโยคคล้ายกันที่ควรได้รับคำตอบต่างออกไป"],
    revealI: ["埋下一条起初看似平常的记录，再让后来的发现改变读者对它的理解。", "Plant an ordinary-looking note, then let a later discovery change how the reader understands it.", "初めは何気なく見える記録を残し、後の発見によって読み手の受け取り方を変える。", "Оставьте на вид обычную запись, а затем дайте читателю открытие, которое изменит её смысл.", "처음에는 평범해 보이는 기록을 남기고, 뒤의 발견으로 독자가 그 의미를 다시 보게 하세요.", "วางบันทึกที่ดูธรรมดาไว้ก่อน แล้วให้การค้นพบภายหลังเปลี่ยนความเข้าใจของผู้อ่านต่อมัน"],
    sceneI: ["用一个小选择开场。让玩家决定是否归还一件拿错的东西，再由这个决定改变下一场相遇。", "Open with a small choice. Let the player decide whether to return an item taken by mistake, then let that decision shape the next encounter.", "小さな選択から始める。取り違えた品を返すかどうかをプレイヤーに委ね、その判断で次の出会いを変える。", "Начните с небольшого выбора. Пусть игрок решит, вернуть ли вещь, взятую по ошибке, и это повлияет на следующую встречу.", "사소한 선택으로 시작하세요. 실수로 가져온 물건을 돌려줄지 정하게 하고, 그 결정으로 다음 만남이 달라지게 합니다.", "เปิดด้วยทางเลือกเล็ก ๆ ให้ผู้เล่นตัดสินใจว่าจะคืนของที่หยิบผิดมาหรือไม่ แล้วให้การตัดสินใจนั้นเปลี่ยนการพบกันครั้งต่อไป"],
  });
  const keys = {
    character: "character", world: "world", group: "relation", graph: "relation",
    regex: "interaction", quick: "interaction", prompt: "interaction", sections: "interaction",
    chat: "scene", timeline: "scene", script: "scene", memory: "reveal", backup: "reveal",
  };
  const requested = {
    zh: /(?:用|使用|以)(?:简体)?中文|(?:answer|respond|write) in (?:simplified )?chinese|中文(?:作答|回答)/iu,
    en: /(?:用|使用|以)(?:英文|英语)|(?:answer|respond|write) in english|in english[,!.]?\s*$|英語で|영어로/iu,
    ja: /(?:用|使用|以)(?:日语|日文)|(?:answer|respond|write) in japanese|日本語で|일본어로/iu,
    ru: /(?:用|使用|以)(?:俄语|俄文)|(?:answer|respond|write) in russian|(?:ответь|напиши) по-русски/iu,
    ko: /(?:用|使用|以)(?:韩语|韩文)|(?:answer|respond|write) in korean|한국어로/iu,
    th: /(?:用|使用|以)(?:泰语|泰文)|(?:answer|respond|write) in thai|ตอบเป็นภาษาไทย/iu,
  };
  function language(brief, preferred) {
    const explicit = Object.keys(requested).find(lang => requested[lang].test(brief));
    if (explicit) return explicit;
    if (/[\u3040-\u30ff]/u.test(brief)) return "ja";
    if (/\p{Script=Hangul}/u.test(brief)) return "ko";
    if (/\p{Script=Thai}/u.test(brief)) return "th";
    if (/\p{Script=Cyrillic}/u.test(brief)) return "ru";
    if (/\p{Script=Han}/u.test(brief)) return "zh";
    if ((brief.match(/\b[a-z]+\b/giu) || []).length >= 4) return "en";
    return languages.includes(preferred) ? preferred : "en";
  }
  function localOptions(task, context, preferred) {
    const brief = String(context.brief || "").replace(/\s+/gu, " ").trim();
    const lang = language(brief, preferred);
    const chars = Array.from(brief);
    const excerpt = chars.slice(0, 48).join("") + (chars.length > 48 ? "…" : "");
    const suffix = task === "questions" ? "Q" : "I";
    const sections = [...new Set([...(context.modules || []).map(id => keys[id]), "scene", "reveal"])];
    const prompts = sections.map(key => words[key + suffix]?.[lang]).filter(Boolean);
    const previouslyAnswered = new Set((context.answers || []).map(row => row.question));
    const topic = words.topic[lang].replace("{brief}", () => excerpt);
    const separator = ["zh", "ja"].includes(lang) ? "。" : " · ";
    const prefixed = prompt => excerpt ? topic + separator + prompt : prompt;
    return prompts.filter(prompt => !previouslyAnswered.has(prompt) && !previouslyAnswered.has(prefixed(prompt)))
      .slice(0, task === "questions" ? 3 : 2).map((prompt, index) => index === 0 ? prefixed(prompt) : prompt);
  }
  root.NIJANDialogueText = { localOptions };
})(typeof globalThis !== "undefined" ? globalThis : window);
