/* Interface language and display preferences. User-written card text is not translated. */
(function (root) {
  const KEY = 'nijan-ui';
  const PHRASE = {
    '总览': { en: 'Overview', ja: '概要' },
    '段落预设': { en: 'Section presets', ja: '段落プリセット' },
    '使用教学': { en: 'Tutorial', ja: '使い方' },
    'AI 创作': { en: 'AI studio', ja: 'AI創作' },
    '角色卡工坊': { en: 'Character cards', ja: 'キャラカード' },
    '世界书看板': { en: 'World book', ja: 'ワールドブック' },
    '提示词拼装': { en: 'Prompt blocks', ja: 'プロンプト' },
    '群聊卡司': { en: 'Group cast', ja: 'グループ' },
    '聊天阅览': { en: 'Chat reader', ja: 'チャット閲覧' },
    '素材库': { en: 'Assets', ja: '素材' },
    '正则脚本': { en: 'Regex', ja: '正規表現' },
    '快捷回复': { en: 'Quick replies', ja: 'クイック返信' },
    '作者注与情景时间线': { en: 'Timeline', ja: 'タイムライン' },
    '角色关系图': { en: 'Relationship graph', ja: '関係図' },
    '人设一致性检查': { en: 'Consistency', ja: '設定チェック' },
    '群聊剧本': { en: 'Group script', ja: '台本' },
    '主题预设': { en: 'Theme', ja: 'テーマ' },
    '整库备份': { en: 'Library backup', ja: 'ライブラリ保存' },
    '工坊总览': { en: 'Overview', ja: '概要' },
    '导入角色卡': { en: 'Import card', ja: 'カードを読み込む' },
    '导入世界书': { en: 'Import world book', ja: 'ワールドブックを読み込む' },
    '设置': { en: 'Settings', ja: '設定' },
    '载入示例': { en: 'Load sample', ja: 'サンプルを読む' },
    '清空库': { en: 'Clear library', ja: 'ライブラリを空にする' },
    '已保存': { en: 'Saved', ja: '保存済み' },
    '待写入': { en: 'Unsaved', ja: '未保存' },
    '正在写入…': { en: 'Saving…', ja: '保存中…' },
    '未能写入': { en: 'Not saved', ja: '保存できない' },
    '改动自动写入这台浏览器。': { en: 'Changes are stored in this browser.', ja: '変更はこのブラウザに保存されます。' },
    '只过滤这一页，不改库。': { en: 'Filters this page only.', ja: 'このページだけを絞り込みます。' },
    '示例会替换当前库。清空只删这台浏览器里的稿。': { en: 'The sample replaces the current library. Clear only deletes what is in this browser.', ja: 'サンプルは今のライブラリを置き換えます。空にするのはこのブラウザの原稿だけです。' },
    '去写角色': { en: 'Write a character', ja: 'キャラを書く' },
    '新建角色': { en: 'New character', ja: '新しいキャラ' },
    '导入 JSON / PNG': { en: 'Import JSON / PNG', ja: 'JSON / PNG を読む' },
    '导入 JSON': { en: 'Import JSON', ja: 'JSON を読む' },
    '导入 JSON / JSONL': { en: 'Import JSON / JSONL', ja: 'JSON / JSONL を読む' },
    '复制': { en: 'Duplicate', ja: '複製' },
    '删除': { en: 'Delete', ja: '削除' },
    '导出 JSON': { en: 'Export JSON', ja: 'JSON を書き出す' },
    '导出 PNG': { en: 'Export PNG', ja: 'PNG を書き出す' },
    '画廊': { en: 'Gallery', ja: 'ギャラリー' },
    '编辑': { en: 'Edit', ja: '編集' },
    '选择文件': { en: 'Choose file', ja: 'ファイルを選ぶ' },
    '把角色卡拖到这里': { en: 'Drop a character card here', ja: 'キャラカードをここにドロップ' },
    'JSON，或带 chara 数据的 PNG。': { en: 'JSON, or a PNG with a chara chunk.', ja: 'JSON、または chara 入り PNG。' },
    '把世界书拖到这里': { en: 'Drop a world book here', ja: 'ワールドブックをここにドロップ' },
    '酒馆世界信息的 JSON。': { en: 'SillyTavern world-info JSON.', ja: 'SillyTavern のワールド情報 JSON。' },
    '新建世界书': { en: 'New world book', ja: '新しいワールドブック' },
    '导出世界书': { en: 'Export world book', ja: 'ワールドブックを書き出す' },
    '删除此书': { en: 'Delete this book', ja: 'この本を削除' },
    '改书名': { en: 'Rename', ja: '名前を変える' },
    '新建条目': { en: 'New entry', ja: '新しい項目' },
    '看会触发哪些': { en: 'See what triggers', ja: 'どれが反応するか' },
    '试一句': { en: 'Try a line', ja: '一文で試す' },
    '试跑': { en: 'Try it', ja: '試す' },
    '表达式': { en: 'Pattern', ja: 'パターン' },
    '知道了': { en: 'OK', ja: '了解' },
    '取消': { en: 'Cancel', ja: 'キャンセル' },
    '界面语言': { en: 'Interface language', ja: '表示言語' },
    '教学说明': { en: 'Teaching notes', ja: '解説' },
    '显示逐步说明和导入解读': { en: 'Show step-by-step notes and import readings', ja: '手順解説と読み込み解説を表示' },
    '界面字号': { en: 'Interface size', ja: '文字サイズ' },
    '间距': { en: 'Spacing', ja: '間隔' },
    '舒适': { en: 'Comfortable', ja: 'ゆったり' },
    '紧凑': { en: 'Compact', ja: 'コンパクト' },
    '关闭': { en: 'Close', ja: '閉じる' },
    '搜角色、标签': { en: 'Search characters, tags', ja: 'キャラ・タグを検索' },
    '搜条目、关键词': { en: 'Search entries, keywords', ja: '項目・キーワードを検索' },
    '搜块名称': { en: 'Search blocks', ja: 'ブロックを検索' },
    '搜群名': { en: 'Search groups', ja: 'グループを検索' },
    '搜聊天标题': { en: 'Search chats', ja: 'チャットを検索' },
    '搜素材名': { en: 'Search assets', ja: '素材を検索' },
    '搜脚本': { en: 'Search scripts', ja: 'スクリプトを検索' },
    '搜回复': { en: 'Search replies', ja: '返信を検索' },
    '搜注记、情节': { en: 'Search notes, beats', ja: 'メモ・場面を検索' },
    '搜剧本、台词': { en: 'Search scripts, lines', ja: '台本・セリフを検索' },
    '点数字进入对应模块，点角色打开那张卡。载入示例会换掉当前库。': { en: 'Click a count to open that module, or a character to open that card. Load sample replaces the library.', ja: '数字でモジュールへ、キャラでそのカードへ。サンプルはライブラリを置き換えます。' },
    '新建一本，或导入酒馆导出的世界信息 JSON。': { en: 'Create a book, or import SillyTavern world-info JSON.', ja: '新しい本を作るか、SillyTavern のワールド情報 JSON を読み込みます。' },
    '先选书。新建或导入条目，点卡片编辑。每一栏是一个注入位置。': { en: 'Pick a book. Create or import entries, then click a card to edit. Each column is an injection position.', ja: '本を選び、項目を作るか読み込み、カードを押して編集します。列は注入位置です。' },
    '看这句话会触发当前书里哪些启用条目。恒定条目总会算上；选择性条目通常还要命中一个次关键词。': { en: 'See which enabled entries this line triggers. Constant entries always count. Selective entries usually also need a secondary keyword.', ja: 'この文がどの有効項目を起こすか。恒常項目は常に含まれ、選択項目はたいてい副キーワードも要ります。' },
    '添加一块后，拖左侧「序」排列。关掉的块仍会导出，只是未启用。': { en: 'After adding a block, drag Order to reorder. Disabled blocks are still exported, marked off.', ja: 'ブロックを足したあと、「順」を拖って並べます。切ったブロックも書き出されますが無効です。' },
    '从下面选角色加入。取消「上场」则先不让这个角色开口。导出只是名单，回酒馆后按名单建群。': { en: 'Add characters below. Uncheck On stage to keep someone silent. The export is only a roster.', ja: '下からキャラを加えます。「登場」を外すとその人は話しません。書き出すのは名簿だけです。' },
    '导入 jsonl 或消息数组，也可拖进来。背景只影响这页。导出的阅读稿不会写回酒馆。': { en: 'Import jsonl or a message array, or drop it here. The background only affects this page. The reading export is not written back.', ja: 'jsonl かメッセージ配列を読むか、ドロップします。背景はこのページだけ。閲覧用の書き出しは戻しません。' },
    '涂选正文后再复制或做成书签。上一处、下一处在搜索命中之间跳。': { en: 'Select text, then copy it or make a bookmark. Previous and next jump between search hits.', ja: '本文を選んでからコピーするか、しおりにします。前へ・次へは検索の一致を移動します。' },
    '按种类上传。超过约 400KB 会先问你，超过 1.6MB 不收。拖进来的图先当头像。': { en: 'Upload by kind. Over about 400KB asks first. Over 1.6MB is refused. Dropped images start as avatars.', ja: '種類ごとに上げます。約 400KB 超は確認、1.6MB 超は受けません。ドロップした画像はまずアイコンです。' },
    '新建或导入酒馆的正则 JSON。导出的仍是原来的数组。右侧按顺序讲每一截；试一句会标出匹配、分组、替换和没吃到的字。': { en: 'Create or import SillyTavern regex JSON. The export stays the same array. The side walks each piece; a sample shows the match, groups, replacement, and unmatched text.', ja: '正規表現 JSON を作るか読み込みます。書き出しは元の配列のまま。右は一片ずつ解説し、試す文では一致・グループ・置換・残った文字を示します。' },
    '贴一行字。下面给出匹配、捕获组和替换结果，不写入库。': { en: 'Paste a line. Below: the match, capture groups, and replacement. Nothing is saved.', ja: '一行貼ってください。下に一致、キャプチャ、置換が出ます。ライブラリには書きません。' },
    '一套里有多条短句。导出为 Quick Reply v2；每条颜色记在 atelierColor。点「复制内容」只复制句子。': { en: 'A set holds several short lines. Export is Quick Reply v2. Each color is stored as atelierColor. Copy content copies only the sentence.', ja: 'セットは複数の短文です。Quick Reply v2 で書き出します。色は atelierColor。 「复制内容」は文だけコピーします。' },
    '注记钉在某一楼，情节是节拍。点一条再改标题和楼层。': { en: 'Notes pin to a floor. Beats are story steps. Click one to edit its title and floor.', ja: 'メモは階層に留まり、場面は拍です。一つ押して題と階層を変えます。' },
    '先从角色同步人物，再拖圆点。右侧选起点终点并写上关系。': { en: 'Sync people from characters, then drag the dots. On the right, pick both ends and name the relation.', ja: 'まずキャラから人物を同期し、点を拖ります。右で起点と終点を選び、関係を書きます。' },
    '选定角色，可选一本世界书对照。重新检查会刷新结果，导出报告不改卡。': { en: 'Pick a character and optionally a world book. Run check refreshes the result. Exporting the report does not edit the card.', ja: 'キャラを選び、必要ならワールドブックも。再チェックで結果が更新されます。報告の書き出しはカードを変えません。' },
    '选说话的人再写句子。触发词可留空。上移、下移改顺序，右侧是预览。': { en: 'Pick who speaks, then write the line. The trigger can stay empty. Move up or down to reorder. The right side is the preview.', ja: '話す人を選んで文を書きます。きっかけ語は空でもよい。上へ下へで順を変え、右がプレビューです。' },
    '改色会马上作用在织境上。点「使用此主题」才记住这套。CSS 需自己贴进酒馆。': { en: 'Color changes apply to Realmweave immediately. Use this theme to keep the set. Paste the CSS into SillyTavern yourself.', ja: '色はすぐ织境に効きます。「このテーマを使う」でこのセットを覚えます。CSS は自分で SillyTavern に貼ります。' },
    '导出一份带日期的 JSON。恢复时可把文件拖进来，再选替换或合并。': { en: 'Export a dated JSON file. To restore, drop the file here, then replace or merge.', ja: '日付入り JSON を書き出します。戻すときはファイルをドロップし、置き換えか統合を選びます。' },
    '织境不代替 SillyTavern。角色、世界书、正则和一场聊天都留在这台浏览器里，导出的是酒馆认得的文件。': { en: 'Realmweave does not replace SillyTavern. Characters, world books, regex, and a chat stay in this browser. Exports are files SillyTavern can import.', ja: '织境は SillyTavern の代わりではありません。キャラ、ワールドブック、正規表現、チャットはこのブラウザに残り、書き出すのは SillyTavern が読めるファイルです。' },
  };

  const TEMPLATES = {
    'blurb.studio': {
      zh: '模型先问，再给灵感。接受或拒绝之后才写。改一栏，就送进对应的工坊页。',
      en: 'The model asks first, then offers inspirations. Edits import into the matching workshop page.',
      ja: 'モデルが先に尋ね、灵感を出す。直した内容は対応するページへ入る。',
    },
    'blurb.memory': {
      zh: '写一块 HTML 记忆面板，导出文件，再按页面上的步骤放进 SillyTavern。',
      en: 'Write an HTML memory panel, export the file, then follow the steps on this page into SillyTavern.',
      ja: 'HTML の記憶パネルを書き、ファイルを書き出して、このページの手順で SillyTavern に入れます。',
    },
    'blurb.tutorial': {
      zh: '从打开、导入、书写、检查到导出进酒馆。每一步写在页面上，并标明文件该放哪。',
      en: 'Open, import, write, check, and export into SillyTavern. Each step says where the file goes.',
      ja: '開く、読み込む、書く、チェック、SillyTavern へ書き出す。各手順にファイルの置き場所を書いてあります。',
    },
    'blurb.sections': {
      zh: '打开一组，选一个预设。它会写成作者注；注明的组还会写成世界书、正则或快捷回复。自定义框有字时，以自定义为准。',
      en: 'Turn a group on and pick a preset. It becomes an author note; some groups also write a world-book entry, a regex, or a quick reply. If the custom box has text, that text wins.',
      ja: 'グループをオンにしてプリセットを選ぶと、作者注になります。指定のある組はワールドブック、正規表現、クイック返信も書きます。カスタム欄に文字があればそちらが優先です。',
    },
    'blurb.home': {
      zh: '看这台浏览器里有多少稿。点数字或角色，进入对应模块。',
      en: 'See what is stored in this browser. Click a count or a character to open that module.',
      ja: 'このブラウザにどれだけ原稿があるか。数字かキャラを押すと、そのモジュールへ進みます。',
    },
    'blurb.characters': {
      zh: '写酒馆角色卡 v2。导出 JSON 或 PNG，到角色列表里导入。',
      en: 'Write a SillyTavern v2 card. Export JSON or PNG and import it from the character list.',
      ja: 'SillyTavern v2 のカードを書きます。JSON か PNG を書き出し、キャラ一覧から読み込みます。',
    },
    'blurb.lore': {
      zh: '按注入位置整理世界书。导出后到酒馆「世界信息」导入。',
      en: 'Arrange a world book by injection position. Export it, then import it under World Info.',
      ja: '注入位置ごとにワールドブックを整理します。書き出して World Info から読み込みます。',
    },
    'blurb.prompts': {
      zh: '把提示词块排好顺序。导出后对照抄进预设，不要整份覆盖。',
      en: 'Order prompt blocks. Copy them into a preset. Do not overwrite the whole preset.',
      ja: 'プロンプトブロックの順を決めます。プリセットへ写し、全体は上書きしないでください。',
    },
    'blurb.groups': {
      zh: '从库里选角色排成群聊。导出的是名单，酒馆不能直接导入群文件。',
      en: 'Pick characters into a group. The export is a roster. SillyTavern cannot import a group file directly.',
      ja: 'ライブラリのキャラでグループを組みます。書き出すのは名簿です。グループファイルはそのまま読めません。',
    },
    'blurb.chat': {
      zh: '读酒馆聊天来查阅、搜索、做书签。不会写回酒馆的 chats。',
      en: 'Read a SillyTavern chat to search and bookmark. It is not written back into chats.',
      ja: 'チャットを読んで検索し、しおりを付けます。chats へは書き戻しません。',
    },
    'blurb.assets': {
      zh: '头像、表情和背景存在这台浏览器里，再指定给角色或聊天。',
      en: 'Avatars, expressions, and backgrounds stay in this browser, then attach to a character or chat.',
      ja: 'アイコン、表情、背景はこのブラウザに置き、キャラかチャットへ指定します。',
    },
    'blurb.regex': {
      zh: '写法与酒馆正则扩展一致。导出 JSON 数组后，在扩展里导入。',
      en: 'The fields match the SillyTavern regex extension. Export a JSON array and import it there.',
      ja: '項目は正規表現拡張に合わせています。JSON 配列を書き出して、拡張から読み込みます。',
    },
    'blurb.quick': {
      zh: '做一组可复制的短句。导出为 Quick Reply v2。',
      en: 'Make a set of short lines you can copy. Export as Quick Reply v2.',
      ja: 'コピーできる短文のセットを作り、Quick Reply v2 で書き出します。',
    },
    'blurb.timeline': {
      zh: '楼层注记和情节节拍画在同一条轴上。导出的是工坊自己的 JSON。',
      en: 'Floor notes and beats share one axis. The export is this app’s own JSON.',
      ja: '階層メモと場面を一本の軸に置きます。書き出すのはこのアプリ独自の JSON です。',
    },
    'blurb.graph': {
      zh: '拖人物、连关系。导出时每条线变成世界书条目。',
      en: 'Drag people and connect them. Each line becomes a world-book entry on export.',
      ja: '人物を拖り、関係を結びます。書き出すと線がワールドブックの項目になります。',
    },
    'blurb.check': {
      zh: '本地对照空字段、近名、发色瞳色，以及恒定条目和正文是否打架。不是模型审查。',
      en: 'Locally compare empty fields, near-names, hair and eyes, and constant entries against the prose. Not a model review.',
      ja: '空欄、似た名前、髪と瞳、恒常項目と本文の食い違いをローカルで見ます。モデル審査ではありません。',
    },
    'blurb.script': {
      zh: '按顺序写旁白或角色的句子，可加触发词。导出工坊自己的 JSON。',
      en: 'Write narrator or character lines in order, with optional triggers. The export is this app’s own JSON.',
      ja: 'ナレーションやキャラの文を順に書き、任意できっかけ語を付けます。独自 JSON で書き出します。',
    },
    'blurb.theme': {
      zh: '改的是织境自己的纸色和字号。酒馆要另贴 CSS，选择器不会自动对上。',
      en: 'This changes Realmweave’s own colors and type size. SillyTavern needs its own CSS. Selectors will not match.',
      ja: '変えるのは织境自身の色と文字サイズです。SillyTavern には別の CSS が要り、セレクタは一致しません。',
    },
    'blurb.backup': {
      zh: '一份 JSON 带走整库。恢复时可替换，或按编号合并。',
      en: 'One JSON file takes the whole library. Restore can replace, or merge by id.',
      ja: 'JSON 一枚でライブラリ全体を持ち出せます。復元は置き換えか、番号での統合です。',
    },
    'card.name': {
      zh: '名字是「{name}」。这是卡的标题，酒馆角色列表里显示这个名字。',
      en: 'The name is “{name}”. It is the card title shown in the character list.',
      ja: '名前は「{name}」。カードの題で、キャラ一覧に出ます。',
    },
    'card.nameEmpty': {
      zh: '名字是空的。酒馆里这张卡没有可显示的角色名。',
      en: 'The name is empty. The card has nothing to show in the character list.',
      ja: '名前が空です。一覧に出すキャラ名がありません。',
    },
    'card.personality': {
      zh: '性格：「{text}」。它说明这个人稳定的脾气和说话方式，模型会把它当成不能随便改的人设。',
      en: 'Personality: “{text}”. This is the stable temperament and voice. The model should treat it as fixed.',
      ja: '性格：「{text}」。安定した気質と口調です。モデルはこれを固定の人設として扱います。',
    },
    'card.personalityEmpty': {
      zh: '性格是空的。卡没有写这个人稳定的脾气。',
      en: 'Personality is empty. The card does not fix how this person behaves.',
      ja: '性格が空です。安定した気質が書かれていません。',
    },
    'card.scenario': {
      zh: '情景：「{text}」。它是聊天开始时已经摆好的局面，不是人物小传。',
      en: 'Scenario: “{text}”. This is the situation already in place when chat starts, not a biography.',
      ja: '情景：「{text}」。チャット開始時にすでに置かれている局面で、人物伝ではありません。',
    },
    'card.scenarioEmpty': {
      zh: '情景是空的。开场时没有交代已经发生了什么。',
      en: 'Scenario is empty. Nothing says what has already happened.',
      ja: '情景が空です。すでに何が起きたかが書かれていません。',
    },
    'card.first': {
      zh: '开场白：「{text}」。新开一场聊天时，角色先说出这一段。',
      en: 'First message: “{text}”. When a new chat starts, the character says this first.',
      ja: '最初の発言：「{text}」。新しいチャットでは、キャラがまずこれを話します。',
    },
    'card.firstEmpty': {
      zh: '开场白是空的。新聊天没有角色先说的第一句。',
      en: 'The first message is empty. A new chat has no opening line.',
      ja: '最初の発言が空です。新しいチャットに最初の一文がありません。',
    },
    'card.greetings': {
      zh: '备用开场有 {count} 条。它们是可以换上的另一句开场，第一条是「{text}」。',
      en: 'There are {count} alternate greetings. They can replace the opening. The first is “{text}”.',
      ja: '代替の挨拶が {count} 件あります。最初の一文と入れ替えられます。1件目は「{text}」。',
    },
    'card.greetingsEmpty': {
      zh: '没有备用开场。酒馆里只能用上面那一句开场白。',
      en: 'There are no alternate greetings. Only the first message above can open a chat.',
      ja: '代替の挨拶はありません。上の最初の発言だけが使えます。',
    },
    'card.example': {
      zh: '对话示例：「{text}」。它示范口气，通常用 {{char}} 和 {{user}}，不会被当成已经发生过的聊天。',
      en: 'Example dialogue: “{text}”. It shows the voice, often with {{char}} and {{user}}. It is not past chat.',
      ja: '会話例：「{text}」。口調の見本で、多くは {{char}} と {{user}} を使います。過去のチャットではありません。',
    },
    'card.exampleEmpty': {
      zh: '没有对话示例。模型看不到一段可以模仿的对白。',
      en: 'There is no example dialogue. The model has no sample exchange to copy.',
      ja: '会話例がありません。真似る対白がモデルに渡りません。',
    },
    'card.system': {
      zh: '系统提示：「{text}」。它写进角色卡的 system_prompt，用来压过更一般的系统说明。',
      en: 'System prompt: “{text}”. It is stored as system_prompt and overrides a more general system note.',
      ja: 'システム指示：「{text}」。system_prompt に入り、より一般的なシステム説明より優先されます。',
    },
    'card.systemEmpty': {
      zh: '系统提示是空的。不写的话，酒馆继续用自己的系统提示。',
      en: 'The system prompt is empty. SillyTavern keeps its own system prompt.',
      ja: 'システム指示は空です。書かなければ SillyTavern 側の指示が使われます。',
    },
    'card.issueEmpty': {
      zh: '{where}：这是角色卡的基本字段，现在是空的。',
      en: '{where}: this required card field is empty.',
      ja: '{where}：カードの基本項目が空です。',
    },
    'card.issueRepeat': {
      zh: '{where}：和{other}是同一句，开场会重复。',
      en: '{where}: this is the same line as {other}, so the opening repeats.',
      ja: '{where}：{other}と同じ文なので、冒頭が重複します。',
    },
    'card.issueConflict': {
      zh: '{where}：和性格或情景对不上：{note}。',
      en: '{where}: this fights the personality or scenario: {note}.',
      ja: '{where}：性格または情景と食い違います：{note}。',
    },
    'card.issueHair': {
      zh: '{where}：性格或情景里是{canon}发，这里写成了{spoken}发。',
      en: '{where}: personality or scenario says {canon} hair, but this says {spoken} hair.',
      ja: '{where}：性格または情景は{canon}髪なのに、ここは{spoken}髪です。',
    },
    'card.issueEyes': {
      zh: '{where}：性格或情景里是{canon}瞳，这里写成了{spoken}。',
      en: '{where}: personality or scenario says {canon} eyes, but this says {spoken}.',
      ja: '{where}：性格または情景は{canon}の瞳なのに、ここは{spoken}です。',
    },
    'book.lead': {
      zh: '世界书「{name}」共 {count} 条。下面逐条说关键词、是否恒定、顺序、插入位置，以及它在补充什么。',
      en: 'World book “{name}” has {count} entries. Each line below gives keywords, constant or selective, order, position, and what the entry adds.',
      ja: 'ワールドブック「{name}」は {count} 件です。キーワード、恒常か選択か、順序、位置、何を補うかを一件ずつ示します。',
    },
    'book.off': {
      zh: '「{name}」：这条目前停用，不会插入。{meaning}',
      en: '“{name}”: disabled, so it will not be inserted. {meaning}',
      ja: '「{name}」：いま無効なので挿入されません。{meaning}',
    },
    'book.constant': {
      zh: '「{name}」：这是恒定条目，不看关键词，按顺序 {order} 插到「{place}」。{meaning}',
      en: '“{name}”: constant. Keywords are ignored. It is inserted at “{place}” with order {order}. {meaning}',
      ja: '「{name}」：恒常項目です。キーワードは見ず、順序 {order} で「{place}」に入ります。{meaning}',
    },
    'book.selective': {
      zh: '「{name}」：这不是恒定。试句里出现主关键词{keys}之后，还要再看次关键词{secondary}，才按顺序 {order} 插到「{place}」。{meaning}',
      en: '“{name}”: not constant. After a primary keyword {keys} hits, secondary keywords {secondary} must also be checked, then it inserts at “{place}” with order {order}. {meaning}',
      ja: '「{name}」：恒常ではありません。主キーワード{keys}のあと、副キーワード{secondary}も見て、順序 {order} で「{place}」に入ります。{meaning}',
    },
    'book.keyed': {
      zh: '「{name}」：这不是恒定。试句里出现{keys}时，按顺序 {order} 插到「{place}」。{meaning}',
      en: '“{name}”: not constant. When {keys} appears, it inserts at “{place}” with order {order}. {meaning}',
      ja: '「{name}」：恒常ではありません。{keys}が出ると、順序 {order} で「{place}」に入ります。{meaning}',
    },
    'book.means': {
      zh: '它在补充：「{text}」。',
      en: 'It adds: “{text}”.',
      ja: '補足している内容：「{text}」。',
    },
    'book.meansEmpty': {
      zh: '正文是空的。',
      en: 'The body is empty.',
      ja: '本文は空です。',
    },
    'book.issueEmptyKeys': {
      zh: '条目「{name}」：不是恒定条目，却没有主关键词，平时不会被插入。',
      en: 'Entry “{name}”: not constant, and it has no primary keywords, so it will not normally be inserted.',
      ja: '項目「{name}」：恒常ではないのに主キーワードがなく、通常は挿入されません。',
    },
    'book.issueSame': {
      zh: '条目「{name}」：和「{other}」的正文相同。',
      en: 'Entry “{name}”: the body is the same as “{other}”.',
      ja: '項目「{name}」：本文が「{other}」と同じです。',
    },
    'book.issueDupKey': {
      zh: '条目「{name}」：和「{other}」用了同一个关键词「{key}」。',
      en: 'Entry “{name}”: shares the keyword “{key}” with “{other}”.',
      ja: '項目「{name}」：「{other}」と同じキーワード「{key}」です。',
    },
    'book.issueOverlap': {
      zh: '条目「{name}」：关键词「{key}」和「{other}」的「{otherKey}」互相包含，一句话可能同时触发两条。',
      en: 'Entry “{name}”: keyword “{key}” overlaps “{otherKey}” on “{other}”, so one line can trigger both.',
      ja: '項目「{name}」：キーワード「{key}」が「{other}」の「{otherKey}」と重なり、一文で両方反応することがあります。',
    },
    'book.issueOrder': {
      zh: '条目「{name}」：和「{other}」的插入位置都是「{place}」，顺序都是 {order}，分不出先后。',
      en: 'Entry “{name}”: same position “{place}” and same order {order} as “{other}”, so the sequence is ambiguous.',
      ja: '項目「{name}」：「{other}」と位置「{place}」も順序 {order} も同じで、前後が決まりません。',
    },
    'book.issueContra': {
      zh: '条目「{name}」：和恒定条目「{other}」互相矛盾：{note}。',
      en: 'Entry “{name}”: contradicts constant entry “{other}”: {note}.',
      ja: '項目「{name}」：恒常項目「{other}」と矛盾します：{note}。',
    },
    'import.clean': {
      zh: '没有标出重复或明显的逻辑问题。',
      en: 'No duplicates or obvious logical problems were flagged.',
      ja: '重複や明らかな論理の問題は出ていません。',
    },
    'import.cardTitle': {
      zh: '这张卡在说什么',
      en: 'What this card is doing',
      ja: 'このカードの読み',
    },
    'import.bookTitle': {
      zh: '这本世界书在说什么',
      en: 'What this world book is doing',
      ja: 'このワールドブックの読み',
    },
  };

  function load() {
    const base = { lang: 'zh', teach: true, scale: 1, density: 'comfortable', jsonMode: false, adult: false, liveImport: true, replyLength: 'medium', replyChars: 600 };
    try {
      return Object.assign(base, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (error) {
      return base;
    }
  }

  let prefs = load();

  function fill(text, vars) {
    let out = text;
    if (vars) Object.keys(vars).forEach((key) => { out = out.split(`{${key}}`).join(String(vars[key] ?? '')); });
    return out;
  }

  function t(key, vars) {
    const lang = prefs.lang || 'zh';
    const template = TEMPLATES[key];
    if (template) return fill(template[lang] || template.zh, vars);
    if (lang !== 'zh' && PHRASE[key] && PHRASE[key][lang]) return PHRASE[key][lang];
    return key;
  }

  function apply() {
    const lang = prefs.lang || 'zh';
    document.documentElement.lang = lang === 'en' ? 'en' : lang === 'ja' ? 'ja' : 'zh-CN';
    document.documentElement.dataset.teach = prefs.teach === false ? 'off' : 'on';
    document.documentElement.dataset.density = prefs.density === 'compact' ? 'compact' : 'comfortable';
    document.documentElement.style.setProperty('--ui-scale', String(Number(prefs.scale) || 1));
    const product = lang === 'en' ? 'Realmweave' : '织境';
    const tagline = lang === 'en'
      ? 'From a single thought, write the people and the world.'
      : lang === 'ja'
        ? 'ひとつの想いから、人物と世界を書く。'
        : '从一个念头，写出人物与世界。';
    document.title = product;
    document.querySelectorAll('[data-product]').forEach((node) => { node.textContent = product; });
    document.querySelectorAll('[data-tagline]').forEach((node) => { node.textContent = tagline; });
  }

  function save(next) {
    prefs = Object.assign(load(), next || {});
    localStorage.setItem(KEY, JSON.stringify(prefs));
    apply();
  }

  let phraseKeys = null;

  function phraseOf(text) {
    const lang = prefs.lang || 'zh';
    if (!text || lang === 'zh') return '';
    if (PHRASE[text] && PHRASE[text][lang]) return PHRASE[text][lang];
    return '';
  }

  function phraseKeyList() {
    if (!phraseKeys) phraseKeys = Object.keys(PHRASE).filter((key) => key.length >= 4).sort((a, b) => b.length - a.length);
    return phraseKeys;
  }

  function localize(node) {
    if (!node || (prefs.lang || 'zh') === 'zh') return;
    if (node.nodeType === 1) {
      ['placeholder', 'title', 'aria-label'].forEach((attr) => {
        if (!node.getAttribute) return;
        const value = node.getAttribute(attr);
        if (!value) return;
        const trimmed = value.trim();
        const mapped = phraseOf(trimmed);
        if (mapped) node.setAttribute(attr, value.replace(trimmed, mapped));
      });
      if (node.matches && node.matches('textarea, script, style')) return;
    }
    const kids = node.childNodes ? [...node.childNodes] : [];
    kids.forEach((child) => {
      if (child.nodeType === 3) {
        const raw = child.nodeValue;
        const trimmed = raw.trim();
        if (!trimmed) return;
        const skipContent = child.parentElement && child.parentElement.closest && child.parentElement.closest('textarea, .msg .body, #char-preview, .rail-char, .cast, .gallery, figcaption, .snippet, .entry > b, .entry > p');
        if (skipContent) return;
        let mapped = phraseOf(trimmed);
        const numbered = !mapped && trimmed.match(/^(\d+\.\s*)(.+)$/);
        if (!mapped && numbered && phraseOf(numbered[2])) mapped = numbered[1] + phraseOf(numbered[2]);
        if (!mapped) {
          const lang = prefs.lang;
          let next = raw;
          phraseKeyList().forEach((key) => {
            if (!next.includes(key) || !(PHRASE[key] && PHRASE[key][lang])) return;
            next = next.split(key).join(PHRASE[key][lang]);
          });
          if (next !== raw) child.nodeValue = next;
          return;
        }
        child.nodeValue = raw.replace(trimmed, mapped);
      } else if (child.nodeType === 1) localize(child);
    });
  }

  apply();
  function add(extra) { Object.assign(PHRASE, extra || {}); phraseKeys = null; }
  root.TAI18n = { t, load, save, apply, localize, add, get prefs() { return prefs; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
