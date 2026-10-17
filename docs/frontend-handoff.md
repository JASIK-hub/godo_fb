# Исправления интеграции для Claude

Аудит ветки main: моки выключены по умолчанию — это правильно. Но текущий HTTP-клиент вызывает `/api/v1/analyze` и `/api/v1/jobs/*` без X-API-Key, а backend ожидает на этих машинных маршрутах ключ. Нельзя исправлять это включением ключа жюри в браузер.

В рамках аудита frontend не изменён: ранее пользователь запретил его редактировать; запрос на исключение отправлен, ответа пока нет.

Необходимые правки без изменения публичного контракта:

- Добавить вход с вводимым пользователем отдельным `UI_ACCESS_CODE`: POST `/api/v1/ui/session`, JSON `{access_code}`, `credentials: 'include'`; код не сохранять в localStorage и не включать в bundle. Logout — DELETE того же URL. Обрабатывать expiry/401.
- Заменить upload/polling на `/api/v1/ui/analyze` и `/api/v1/ui/jobs/{id}`. В production использовать same-origin, `VITE_API_BASE_URL=''`; Compose уже задаёт это при сборке. Origin должен совпадать с `UI_ORIGIN`.
- Типы ответа взять из contracts/public-api.yaml. При done находятся верхнеуровневые `verdict`, `violations`, `source`; при failed — объект `error` с `message`/`code`. Не ожидать `result.events`, `progress`, URL кадров или нормативный document/clause: API их не отдаёт.
- Если сохраняется текущая модель отображения, нужен явный адаптер: pass → «Нарушений не обнаружено», fail → «Обнаружены нарушения»; violation.code/message/timestamp_seconds → карточка события. Не подставлять фиктивные кадры/нормативные документы. Отсутствие данных не равно успешному результату.
- `source: stub` обязательно помечать демонстрационным; production build не должен позволять автоматически включить frontend mocks. Ошибка сети не должна переключать на мок.
- Лимит 500 MB в UploadScreen не соответствует default backend 100 MiB. Согласовать настройку; MOV `video/quicktime` около 29 MiB поддерживается и протестирован. Не полагаться только на расширение.
- Удалить Google Fonts из index.html; установить и упаковать необходимые шрифты/иконки локально на этапе сборки или заменить системным шрифтом и локальными SVG. В поставляемом Nginx CSP внешние загрузки заблокированы.
- Запустить production build и браузерный тест login → upload → processing → done/failed → logout; проверить Network при отключённом интернете, отсутствие запросов к fonts.googleapis.com и отсутствие ключа жюри в assets.

Сохранённый контракт pass/fail не заменять строкой no_violation в браузерном API. Внутренний ML no_violation нормализуется backend.
