# Борд макетов — статическая версия

Внутри: `index.html`, `style.css`, `app.js`, `items.json` и папка `mockups` с самими страницами.
Сервер не нужен — это обычный статический сайт. Работает и локально, и на GitHub Pages.

## Публикация на GitHub Pages

1. Создайте на GitHub репозиторий, например `jet-board` (для бесплатного Pages репозиторий должен быть **Public**).
2. Залейте содержимое этой папки в корень репозитория — любым способом:
   - через веб: на странице пустого репозитория «uploading an existing file» → перетащите все файлы и папку `mockups`;
   - через git:
     ```
     git remote add origin https://github.com/<логин>/jet-board.git
     git push -u origin main
     ```
   - через GitHub Desktop: Add local repository → Publish.
3. В репозитории: Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, папка `/ (root)` → Save.
4. Через 1–2 минуты сайт будет доступен по адресу:
   `https://<логин>.github.io/jet-board/`

Файл `.nojekyll` уже добавлен — он отключает обработку Jekyll и ускоряет публикацию.

## Обновление

Борд — снимок. Если страницы поменялись, пересоберите папку и замените файлы в репозитории.
