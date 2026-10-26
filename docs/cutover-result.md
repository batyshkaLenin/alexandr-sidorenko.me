# W0005 — состояние публикации и домена

Checkpoint: 2026-10-26 UTC. **Приложение обновлено; полная приёмка production-domain cutover ещё не завершена.**

## Временное отключение Last.fm

По поручению владельца на production и preview вместо трека показано `Temporarily unavailable`. Старый шаблон сохранён в Hugo template comment, автоматический вызов `fetch-lastfm.py` — в Bash comments. Сам загрузчик и committed snapshot не удалены; Last.fm snapshot не публикуется в asset directory. Возвращение модуля требует отдельного решения после уточнения условий Last.fm.

Сборка не вызывает Last.fm даже при заданном dummy API key и refresh=1: existing build-mode regression проверяет это на preview и production. Dev refresh preview сохранён. Письмо с описанием build-time API → local snapshot → static HTML подготовлено владельцу без отправки; `/resources`, указанный в API Terms, при проверке возвращает HTTP404.

## Опубликованные версии

Site: `db8b69dca26a02ff62fb57a90c8ad47f5af52b64`. Theme: `50a1e5ab752143569357d169b79a01abbcf91e8f`.

| Среда | Worker origin | Version | Deployment |
| --- | --- | --- | --- |
| Production | https://production.alexandr-sidorenko.workers.dev | `95f44df0-e950-4b52-b021-1e9a426d80e0` | `97feefe8-d9c1-4192-8f33-6b0e9ac8992e` |
| Preview | https://preview.alexandr-sidorenko.workers.dev | `fa596085-d730-4bd6-94ec-ea3763487863` | `e6f6ae26-389b-4285-a3b0-895f9d9f9b01` |

Production asset digest: `938a26b12e7b50a6d891c0f914a12428a2f849bac61c19bdbcf301ba7c7ebc94`; Home SHA256: `cf1d0bd0b1f09f05db112209c9378a2dcf99e7072fcce297ef444fe3d5e3b099`.

Preview asset digest: `78ae4e0cb49ebbe4a99f9966063c6a32d36416ca1ffbf5af993f88315882331f`; Home SHA256: `6af9301ed7183048808e71efbb907fa12a6287f57d49cec2e71e432fb5832e87`.

Каждый version URL проверен до promotion; после promotion обе среды на 100% обслуживают соответствующую версию, live Home digest совпал с конкретной сборкой. Обе CI-сборки pinned Hugo extended0.165.0/Wrangler4.131.2 с frozen snapshots прошли BUILD+POST-BUILD. HTTP matrix каждой среды с явными matching public-dir/base-url: PASS5HTML/12MIME/14identity303/11absent404. Build/deploy regression:25 tests PASS; bash syntax и config/content checks PASS. Независимый технический pre-cutover source Review: PASS, без lifecycle receipt до завершения всей Implementation.

Previous Worker versions сохранены: production `7c3ba0f1-4bbc-48a4-8096-02b316adbaf3`, preview `869f7702-ef10-419e-94b9-f276d103eb4a`. Их доступность проверена через API; настоящий rollback не запускался. Production wrapper default-urllib smoke имеет известный F-W0004-URLLIB-1010: controlled release использовал версии Wrangler отдельно и explicit-UA HTTP smoke; wrapper/security settings не менялись.

## Доменные настройки и propagation

Владелец самостоятельно сохранил NS `bristol.ns.cloudflare.com` / `nico.ns.cloudflare.com` в Namecheap. Cloudflare zone active. На checkpoint21:20UTC parent и обе authoritative NS указывают Cloudflare; DS у parent отсутствует. Google8.8.8.8 уже возвращает новые NS, Cloudflare1.1.1.1 ещё возвращает Vercel. Прежние parent/child NS TTL3600/86400 требуют учитывать незавершённую propagation.

После W0004 обнаружена внешняя remote delta: apex уже назначен Worker Custom Domain на production, появился preview Custom Domain с отключённым stable hostname и включёнными preview URLs, original wildcard удалён, добавлен DMARC. API certificates для apex/wildcard active. Все13 исходных служебных DNS records совпадают по типу, имени, содержимому, TTL, priority и proxied; configuredCAA3/effectiveCloudflareadditions оговорены в runbook. Raw DNS values/export в публичный документ не включены; текущий защищённый pre-update snapshot находится вне репозитория в owner-only local state.

Автор этой реализации не менял DNS, Custom Domains, Worker Routes, DNSSEC/DS или certificate settings. Upload/promote выполнены через isolated asset configs без triggers/build hook и с keep-vars. Прежний точный route→proxy план W0004 не применяется поверх обнаруженных изменений. Владельцу задан вопрос об их происхождении; актуальный superseding network plan и оставшиеся www/wildcard/preview hostname проверки требуют отдельной фиксации перед network mutation.

Прямой HTTPS запрос к Cloudflare IP с корректным apex SNI и включённой проверкой сертификата: HTTP200, exact production Home digest и заглушка. Обычный системный DNS и Chrome пока показывают прежний Vercel сайт; это **не** live production-domain PASS. Normal www возвращает старый redirect, preview custom hostname — старый404. Worker origins проверены отдельно и работают.

## Оставшаяся приёмка

Независимый technical live QA обеих workers.dev сред: PASS. Chrome156 desktop1905×2053/1440×1000 и mobile390×844: одна видимая music section с H2/accessible name и текстом заглушки, без links/images/time; Last.fm markup/requests отсутствуют, commit и Home hashes совпали, нет console errors/failed resources/overflow. Production robots.txt разрешает обход, preview robots.txt содержит Disallow:/; literal robots meta/X-Robots-Tag noindex не наблюдается и не заявляется. Это проверка текущего существующего механизма, а не изменение indexing policy.

Source commits локальные; push не выполнялся. Автоматическая main/dev integration/следующая remote repository build не проверены и не перенастраивались. Дальнейший автоматический релиз должен использовать актуальный commit с отключённым Last.fm.

- Проверить текущие доменные изменения с владельцем и зафиксировать актуальную схему вместо устаревшей exact route/proxy delta.
- Дождаться/проверить независимые recursive DNS и обычный browser production URL; проверить www, wildcard, preview custom hostname и representative visible/share canonical URL на production.
- Зафиксировать независимые Review/QA и закрыть W0005 только после полного acceptance. Техническая проверка отдельных Workers не заменяет приёмку домена.

Vercel resources не удалялись; возврат hosting/DNS на Vercel не планируется. HSTS preload, security weakening, secrets reading и push не выполнялись.
