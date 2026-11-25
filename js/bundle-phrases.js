/* SillyTavern package export. Filenames and titles stay in their original language. */
(function (root) {
  'use strict';
  const rows = {
    '酒馆资源包': ['SillyTavern package','SillyTavern パッケージ','Пакет SillyTavern','SillyTavern 패키지','แพ็กเกจ SillyTavern'],
    '画廊分页': ['Gallery pages','ギャラリーのページ','Страницы галереи','갤러리 페이지','หน้าของแกลเลอรี'],
    '包内角色名': ['Character name in the package','パッケージ内のキャラクター名','Имя персонажа в пакете','패키지에 사용할 캐릭터 이름','ชื่อตัวละครในแพ็กเกจ'],
    '内嵌世界书': ['Embedded world book','埋め込みワールドブック','Встроенная книга мира','내장 월드북','เวิลด์บุ๊กที่ฝังในตัวละคร'],
    '另附独立世界书 JSON': ['Include a separate world book JSON file','ワールドブックの JSON ファイルも同梱','Включить отдельный JSON-файл книги мира','별도의 월드북 JSON 파일 포함','แนบไฟล์ JSON ของเวิลด์บุ๊กแยกด้วย'],
    '表情包': ['Expression packs','表情パック','Наборы эмоций','표정 팩','ชุดภาพแสดงอารมณ์'],
    '角色关联表情': ['Expressions attached to this character','このキャラクターに紐づく表情','Эмоции, привязанные к персонажу','이 캐릭터에 연결된 표정','ภาพแสดงอารมณ์ที่ผูกกับตัวละครนี้'],
    '包内文件': ['Files in the package','パッケージ内のファイル','Файлы в пакете','패키지에 포함된 파일','ไฟล์ในแพ็กเกจ'],
    '表情图的文件名对应酒馆表情标签。快捷回复集可在酒馆的快捷回复设置中启用。': ['Expression image filenames correspond to SillyTavern expression labels. Enable imported sets in SillyTavern’s Quick Reply settings.','表情画像のファイル名は SillyTavern の表情ラベルに対応します。読み込んだセットはクイック返信の設定で有効にできます。','Имена файлов эмоций соответствуют меткам эмоций SillyTavern. Импортированные наборы включаются в настройках быстрых ответов SillyTavern.','표정 이미지 파일 이름은 SillyTavern의 표정 라벨에 대응합니다. 가져온 세트는 SillyTavern의 빠른 답장 설정에서 활성화하세요.','ชื่อไฟล์ภาพตรงกับป้ายกำกับอารมณ์ใน SillyTavern เปิดใช้ชุดข้อความที่นำเข้าได้ในการตั้งค่า Quick Reply ของ SillyTavern'],
    '解压到酒馆用户目录，再刷新酒馆。也可以在相应的酒馆工具中分别导入。': ['Extract the ZIP into your SillyTavern user directory and refresh SillyTavern. You can also import individual files through the corresponding SillyTavern tools.','ZIP を SillyTavern のユーザーディレクトリに展開し、SillyTavern を再読み込みしてください。各ファイルは対応するツールから個別に読み込むこともできます。','Распакуйте ZIP в каталог пользователя SillyTavern и обновите страницу. Отдельные файлы также можно импортировать через соответствующие инструменты SillyTavern.','ZIP 파일을 SillyTavern 사용자 폴더에 풀고 SillyTavern을 새로 고치세요. 각 파일을 해당 도구에서 개별적으로 가져올 수도 있습니다.','แตกไฟล์ ZIP ลงในโฟลเดอร์ผู้ใช้ SillyTavern แล้วรีเฟรช SillyTavern หรือนำเข้าไฟล์แต่ละรายการผ่านเครื่องมือที่เกี่ยวข้อง'],
    '下载 ZIP': ['Download ZIP','ZIP をダウンロード','Скачать ZIP','ZIP 다운로드','ดาวน์โหลด ZIP'],
    '安装到酒馆用户目录': ['Install in a SillyTavern user directory','SillyTavern のユーザーディレクトリにインストール','Установить в каталог пользователя SillyTavern','SillyTavern 사용자 폴더에 설치','ติดตั้งในโฟลเดอร์ผู้ใช้ SillyTavern'],
    '正在准备资源包…': ['Preparing package…','パッケージを準備中…','Подготовка пакета…','패키지 준비 중…','กำลังเตรียมแพ็กเกจ…'],
    '已取消': ['Canceled','キャンセルしました','Отменено','취소됨','ยกเลิกแล้ว'],
    '已安装到': ['Installed in','インストール先','Каталог установки','설치 위치','ติดตั้งแล้วใน'],
    '已导出': ['Exported','書き出しました','Экспортировано','내보냄','ส่งออกแล้ว'],
    '文件名不能用于酒馆目录': ['This name cannot be used in a SillyTavern directory','この名前は SillyTavern のディレクトリで使用できません','Это имя нельзя использовать в каталоге SillyTavern','이 이름은 SillyTavern 폴더에서 사용할 수 없습니다','ไม่สามารถใช้ชื่อนี้ในโฟลเดอร์ SillyTavern ได้'],
    '资源包的目录结构无效': ['The package directory layout is invalid.','パッケージのディレクトリ構成が無効です。','Недопустимая структура каталогов пакета.','패키지의 폴더 구조가 올바르지 않습니다.','โครงสร้างโฟลเดอร์ของแพ็กเกจไม่ถูกต้อง'],
    '两项资源使用同一个文件名': ['Two items use the same filename','同じファイル名の項目が二つあります','У двух ресурсов одинаковое имя файла','두 항목이 같은 파일 이름을 사용합니다','ทรัพยากรสองรายการใช้ชื่อไฟล์เดียวกัน'],
    '文件内容无效': ['Invalid file content','ファイルの内容が無効です','Недопустимое содержимое файла','파일 내용이 올바르지 않습니다','เนื้อหาไฟล์ไม่ถูกต้อง'],
    '资源包最多支持 4096 个文件、256 MiB': ['A package supports up to 4,096 files and 256 MiB.','1 つのパッケージの上限は 4,096 ファイル、256 MiB です。','В одном пакете может быть до 4096 файлов общим объёмом до 256 МиБ.','패키지 하나에는 최대 4,096개 파일, 총 256 MiB까지 담을 수 있습니다.','หนึ่งแพ็กเกจรองรับได้สูงสุด 4,096 ไฟล์ รวมไม่เกิน 256 MiB'],
    '无法读取表情图片': ['The expression image could not be read','表情画像を読み込めません','Не удалось прочитать изображение эмоции','표정 이미지를 읽을 수 없습니다','อ่านภาพแสดงอารมณ์ไม่ได้'],
    '请选择包含 characters 和 worlds 的酒馆用户目录': ['Choose a SillyTavern user directory containing characters and worlds.','characters と worlds が入っている SillyTavern のユーザーディレクトリを選択してください。','Выберите каталог пользователя SillyTavern с папками characters и worlds.','characters와 worlds가 있는 SillyTavern 사용자 폴더를 선택하세요.','เลือกโฟลเดอร์ผู้ใช้ SillyTavern ที่มีโฟลเดอร์ characters และ worlds'],
    '目标目录包含链接或已经变更': ['The destination directory contains a link or has changed','対象ディレクトリにリンクが含まれているか、ディレクトリが変更されました','Каталог назначения изменился или содержит ссылку','대상 폴더에 링크가 있거나 폴더가 변경되었습니다','โฟลเดอร์ปลายทางมีลิงก์หรือมีการเปลี่ยนแปลง'],
    '目标文件已存在': ['The destination file already exists','同名のファイルが既にあります','Файл назначения уже существует','대상 파일이 이미 있습니다','มีไฟล์ชื่อนี้อยู่ที่ปลายทางแล้ว'],
    '写入失败，请检查磁盘空间和权限': ['Could not write the package. Check disk space and permissions.','書き込みに失敗しました。空き容量と権限を確認してください。','Не удалось записать пакет. Проверьте свободное место и права доступа.','패키지를 쓸 수 없습니다. 디스크 공간과 권한을 확인하세요.','เขียนแพ็กเกจไม่ได้ โปรดตรวจสอบพื้นที่ว่างและสิทธิ์การเขียน'],
    '该磁盘不支持安全安装，请下载 ZIP': ['This disk cannot publish files safely. Download the ZIP instead.','このディスクでは安全にインストールできません。ZIP をダウンロードしてください。','Эта файловая система не поддерживает безопасную установку. Скачайте ZIP.','이 디스크는 안전한 설치를 지원하지 않습니다. ZIP 파일을 다운로드하세요.','ดิสก์นี้ไม่รองรับการติดตั้งแบบปลอดภัย โปรดดาวน์โหลด ZIP'],
    '清理未完成，请检查列出的路径': ['Cleanup was incomplete. Check these paths','後片付けが完了しませんでした。次のパスを確認してください','Очистка не завершена. Проверьте указанные пути','정리가 완료되지 않았습니다. 표시된 경로를 확인하세요','ล้างไฟล์ไม่สำเร็จ โปรดตรวจสอบพาธที่ระบุ'],
  };
  root.TAI18n.add(Object.fromEntries(Object.entries(rows).map(([key,values]) => [key,
    Object.fromEntries(['en','ja','ru','ko','th'].map((lang,index) => [lang,values[index]])),
  ])));
})(globalThis);
