# Подготовка staging, DNS и rollback (W0004)

Статус: **initial staging проверен; к переключению домена не готов**.
Проверенный initial deploy описан в §1.1. Остальная процедура не является
свидетельством полного DNS snapshot, независимой приёмки или реального rollback.
Приватные значения и raw evidence хранятся в отдельном release bundle.
Пустое поле, `UNKNOWN`, отсутствующая проверка или недоступный bundle означают STOP.

W0003 поставила release tooling. В W0004 по owner ACCEPT DR-2026-066 создан
отдельный Worker `production` и проверен первый deploy через `workers.dev`.
В source `wrangler.jsonc` по-прежнему выбран `preview`; initial upload использовал
отдельный временный asset-only config без build hook, routes и custom domains.
Согласованная схема: `dev` — preview, `main` — production; настройка автоматической
веточной интеграции этим initial setup не проверялась и не менялась.

В текущей работе не выполняются production DNS/custom-domain/registrar mutations,
смена NS/DS, live walkthrough/rollback, чтение секретов, push или удаление Vercel.
Исключение из ограничения карточки W0004 — выполненный initial deploy и smoke,
явно одобренные DR-2026-066. Любое последующее переключение требует отдельного owner
**ACCEPT CUTOVER**, успешных независимых pre-cutover Review/QA и заполненных входов.

### Решение владельца о направлении миграции — 2026-10-26

Владелец: «не нужно думать о возврате на vercel, мы будем топить до конца».
Возврат hosting/DNS на Vercel исключён из плана восстановления и не является
условием готовности W0004. Прежнее требование immutable Vercel deployment
и проверки его как rollback target больше не применяется. До фактического
switch Vercel остаётся текущим обслуживающим провайдером; удаление его ресурсов
не поручено. При сбое после switch исправляем конфигурацию внутри Cloudflare
или активируем проверенную версию того же Worker. Само решение о направлении
миграции не назначает момент смены NS/production routing и не заменяет
pre-cutover Review/QA. DNS snapshot остаётся входом для точного переноса почты,
verification и остальных сервисов.

## 1. Release bundle и обязательные входы

Оператор создаёт долговечный каталог вне всех Git working trees и public assets,
с доступом только участникам переключения (directory 0700, files 0600).
Путь, права доступа, резервная копия и срок хранения записываются в приватном
release ticket. `/tmp` не заменяет долговечное хранение. Credentials остаются
в штатном защищённом окружении; не копировать их в bundle, команды, чат или логи.
Публичный репозиторий содержит только эту процедуру и обезличенный статус проверок.
DNS exports, provider/account dumps, DNS TXT values и приватные deployment logs
в него не добавляются; нельзя полагаться только на `.gitignore`.

| Обязательный вход | Источник и проверка | Сейчас |
| --- | --- | --- |
| Ответственный оператор, владелец go/no-go, UTC окно и контакты | Владелец назначает; оператор подтверждает доступ к обеим платформам и registrar | UNKNOWN |
| Site commit и Theme gitlink (полные SHA), pins Hugo/Wrangler | Утверждённый commit из `main`, `.tool-versions`, `package-lock.json`, `git rev-parse COMMIT:themes/declassified` | Initial candidate и pins зафиксированы в §1.1 |
| Account, production Worker, HTTPS staging origin | Подтверждённая цель и фактическая конфигурация Cloudflare; связанное решение владельца | Аккаунт alexandr-sidorenko, Worker production, origin в §1.1; DR-2026-066 |
| Staging release record, asset/home digest, version/deployment ID | Smoke именно этой ревизии; active version = 100% candidate | Initial deploy проверен, IDs/digests в §1.1; это отдельный bootstrap, не обычный release wrapper |
| Worker rollback deployment/version и ожидаемые старые Home bytes | Для следующих releases — проверенный previous deployment того же Worker/account | До initial deploy предыдущей version не было; §1.1 фиксирует первую baseline для восстановления внутри Cloudflare |
| DNS provider/zone, registrar, delegation и DNSSEC/DS | Authoritative/parent DNS, registry WHOIS и Cloudflare API; registrar access перед switch | Registrar Namecheap подтверждён registry WHOIS; исходные NS/DS проверены; Cloudflare зона pending, DNSSEC disabled; registrar write не выполнялся |
| Исходные records, TTL и proxy/routing settings | Owner inventory и authoritative сверка для переноса сервисов | Все 15 предоставленных записей сохранены и импортированы; границы проверки в §1.2 |
| Новые NS, схема NS/endpoint switch, TTL/окна ожидания | Назначенные NS из Cloudflare API; процедура §4 | `bristol.ns.cloudflare.com`, `nico.ns.cloudflare.com`; main/wildcard routing план ниже, не активирован |
| Review/QA subject, результаты, решение владельца | Exact Site/Theme commits + digest + выбранные targets + идентификатор приватного bundle | Отсутствуют |

Bundle включает: `release-inputs.md`, `dns-before` (raw export и настройки),
`dns-plan.md` (точная before/after таблица), `rollback.md`, уникальный
`production-deploy.json`, preserved build artifact или воспроизводимый checkout,
smoke logs с UTC временем, independent Review/QA и решение go/no-go.
Записать SHA-256 файлов bundle в приватный manifest, проверить читаемость копии.
Идентификатор bundle и итог PASS/FAIL можно сослать в evidence без его содержимого.

Назначенный приватный каталог текущего snapshot:
`~/.local/state/alexandr-sidorenko.me/cutover/W0004-2026-10-26`.
Проверено: вне Git working trees, directory 0700, files 0600, SHA-256 manifest;
API tokens/OAuth credentials туда не копировались. Это локальное сохранение;
внешняя резервная копия и готовность registrar-сессии проверяются перед T0.

### 1.1. Проверенный initial deploy — 2026-10-26

Owner authority: DR-2026-066. Worker создан через Cloudflare MCP; локальные
assets загружены существующим авторизованным pinned Wrangler 4.131.2.
Изолированные полные Site/Theme checkouts, frozen snapshots, production
`scripts/ci.sh` BUILD + POST-BUILD и Wrangler dry-run прошли до upload.

| Поле | Проверенное значение |
| --- | --- |
| Origin | `https://production.alexandr-sidorenko.workers.dev` |
| Site commit | `3a2aae1d1bed3ba87140f12b7bb17d35b5d6a1af` |
| Theme gitlink | `50a1e5ab752143569357d169b79a01abbcf91e8f` |
| Toolchain | Hugo extended 0.165.0; Wrangler 4.131.2; compatibility date 2026-08-06 |
| Deployment ID | `43194287-2a3d-4f7c-9443-a4d2ea398f0c` |
| Version ID, active 100% | `7c3ba0f1-4bbc-48a4-8096-02b316adbaf3` |
| Asset digest (release tooling algorithm) | `50bbd6ba3218c712a2c0f6d49ed4c47d2cde1625c704d0f0508a6f14322bec5f` |
| Exact Home SHA-256 | `f7534dd174592d0c17cca8595785e1f71ae174c367919da355ca0ad279a0b3a5` |
| Artifact | 142 файлов: 140 uploaded assets + `_headers`/`_redirects` как metadata |

MCP подтвердил version/tag/commit message, active version 100%, включённый
workers.dev и отсутствие custom domains у production. Deployment существующего
preview остался `301418f2-f0fb-4f82-8571-a30818c72ddc`; он не обновлялся.
Live HTTP matrix прошла: 5 HTML routes, 12 media types, 14 identity 303,
11 absent URLs 404. HTTPS и exact Home digest проверены в Chrome и HTTP-клиентом
с User-Agent из HTTP matrix. Базовый Chrome smoke Home/Library/Reader прошёл;
CSS/fonts/images загружены, ошибок консоли и failed resources не обнаружено
в проверенных поверхностях. Reader также проверен при viewport 390×844 без
горизонтального overflow. Это Implementation smoke, не независимые Review/QA.

**Ограничение будущего release wrapper:** стандартный Python urllib User-Agent
получает Cloudflare HTTP 403 / code 1010 на workers.dev, тогда как Chrome и
HTTP matrix клиент получают 200 и ожидаемые bytes. Текущий
`deploy-production.py` выполняет exact Home probe стандартным urllib клиентом;
его remote smoke на этой цели пока нельзя считать пригодным для автоматического
релиза. Runtime script и настройки защиты в W0004 не изменялись. Finding
`F-W0004-URLLIB-1010` требует отдельного scope disposition; успешный bootstrap
не объявляет его исправленным и не заменяет future wrapper acceptance.

Предыдущих Worker deployments до bootstrap не было. Указанная версия — первая
здоровая baseline для последующего релиза, а не вымышленный предыдущий rollback
target. Основной домен/DNS и Vercel deployment не переключались. Перед cutover
заново проверить freshness live IDs, freeze и DNS bundle.

### 1.2. Подготовленная Cloudflare DNS зона — 2026-10-26

После продолжения подготовки владельцем создана зона `alexandr-sidorenko.me`
на плане Free Website. Zone ID: `f46c8ebc24c47e13a93bde6ab1caee09`.
Статус после записи и read-back: **pending**. Назначены NS:
`bristol.ns.cloudflare.com`, `nico.ns.cloudflare.com`. Registrar delegation
по-прежнему указывает на Vercel; NS/DS и production routing не изменялись.

В пустую pending-зону импортированы ровно 15 owner-supplied records. API read-back
подтвердил совпадение name/type/content/priority/TTL и DNS-only proxy status.
13 записей сверены напрямую с исходным authoritative DNS; 2 Vercel ALIAS
преобразованы в DNS-only CNAME по значениям owner provider inventory. Это
проверка предоставленного набора, не доказательство отсутствия неизвестных
subdomain records. Исходный provider inventory и новые record IDs сохранены
в приватном bundle. Его `sha256.json` позволяет проверить неизменность.

Оба назначенных Cloudflare NS напрямую вернули ожидаемые iCloud MX и apex TXT;
DKIM CNAME, `lab`, verification и три configured CAA сохранены. Cloudflare Email
Routing не включался; новый SPF/DMARC и новые mail providers не добавлялись.
Целевая DNSSEC-конфигурация пока disabled, исходный parent DS отсутствовал;
после activation цепочка проверяется заново.

**Эффективный CAA ответ отличается от configured inventory:** при трёх
сохранённых configured CAA Cloudflare authoritative DNS вернул 11 CAA,
включая platform-added `issue`/`issuewild`. Это не потеря записей при импорте:
[Cloudflare SSL FAQ](https://developers.cloudflare.com/ssl/faq/#caa-records)
описывает добавление CAA для своих certificate authorities. Review и владелец
перед activation оценивают именно эффективную политику; идентичность трём
исходным authoritative CAA не заявляется. Universal SSL и эти platform defaults
не отключались и не подменялись агентом.

При текущих DNS-only CNAME root/wildcard зона сохраняет существующее направление
traffic на промежуточном этапе. После одобренного switch план переводит оба
web-направления на Worker `production`; `lab` и mail сохраняют свои endpoints.
Ни маршруты Worker, ни proxy switch, ни custom domain пока не создавались.

## 2. Freeze и финальная сборка

1. Оператор фиксирует время freeze. Приостанавливаются публикации, merge в
   release branch, автоматические promotions и ручные изменения activity snapshots.
   Production build автоматически обновляет WakaTime/Code::Stats перед Hugo;
   конкретный полученный снимок становится отдельным входом release record.
   Preview не обновляет эти источники. Last.fm остаётся временно отключённым.
   Проверить actual Cloudflare branch settings: отдельные preview/dev и
   production/main targets; production non-production branch builds отключены.
   Один оператор сериализует releases; проверка concurrency в wrapper не lock.
2. Зафиксировать финальный commit из `main` и Theme gitlink. Любая последующая
   правка, включая content, требует нового candidate и повторной приёмки.
   Запланированная generation `data/dev.json` входит в конкретный build:
   записать её точный JSON и SHA-256, не подменять snapshot после проверки artifact.
3. Получить изолированный полный Site checkout этого commit и полный Theme
   checkout его gitlink. Не использовать текущий локальный `public/`.
   Проверить `git rev-parse --is-shallow-repository` = `false` для обоих repo;
   при shallow checkout сначала восстановить историю из известного upstream.
   Не принимать успешный fetch без проверки результата.
4. В изолированном checkout установить зависимости из lockfile (`npm ci`) и
   pinned Hugo; проверить pins. Не обновлять зависимости для переключения.
   Обычная production сборка обновляет activity snapshot; credential WakaTime
   передать через защищённое окружение сборщика, не через аргумент команды:

   ```sh
   # Только в disposable checkout с проверенными commit/gitlink и toolchain.
   # Предварительно исключить inherited HUGO_* overrides из build environment.
   HUGO_BUILD_ENVIRONMENT=production HUGO_REFRESH_SNAPSHOTS=1 \
     HUGO_DESTINATION=public PUBLIC_DIR=public PERF_PAGES= ./scripts/ci.sh
   git -c core.fileMode=false diff --exit-code HEAD -- . ':(exclude)data/dev.json'
   ```

   Сверить и сохранить generated `data/dev.json` вне asset directory вместе с
   его SHA-256. Это единственное разрешённое tracked source отличие; при обычной
   сборке рабочего checkout оно проходит review/commit. Для воспроизведения уже
   записанного snapshot допустим explicit refresh0, для нового штатного релиза — нет.
   Сохранить checkout/artifact в bundle, включая `_redirects`; не публиковать
   bundle через Worker assets. `ci.sh` должен дать PASS всем своим PRE/POST checks.
   Это ещё не remote smoke и не разрешение cutover.
5. Для следующего штатного релиза после устранения ограничения
   `F-W0004-URLLIB-1010` (исправленный wrapper использует явный client User-Agent)
   применить wrapper с явными входами из bundle:

   ```sh
   python3 scripts/deploy-production.py deploy \
     --commit "$SITE_COMMIT" --worker "$PRODUCTION_WORKER" \
     --account-id "$CF_ACCOUNT_ID" --origin "$STAGING_ORIGIN" \
     --record "$RELEASE_BUNDLE/production-deploy.json"
   ```

   Все переменные здесь — обязательные заполненные входы, а не defaults.
   Команда меняет активную версию выбранного Worker. Для pre-cutover подготовки
   выбрать разрешённый staging target; для штатного production релиза — явно
   согласованные production Worker/origin. Разрешение на один target не переносить
   на другой. Команда сама не меняет DNS/routes/Custom Domains. Wrapper
   пересобирает exact source commit со свежим activity snapshot, сохраняет его
   в `activity_snapshot` release record, проверяет предыдущую version, загружает и
   активирует candidate, проверяет Home digest и HTTP matrix. Это отдельная сборка:
   её фактический input/digest сверяются по её record, не по прежнему локальному
   artifact. Если Worker новый
   и rollback baseline отсутствует, STOP: bootstrap — отдельная согласованная
   операция; не обходить preflight и не подставлять случайную версию.
   `--dry-run` проверяет локальную сборку/packaging, не remote готовность.
6. Успех — record `status=passed`, ожидаемые commit/gitlink/digests, совпадение
   live deployment/version, HTTP/TLS PASS. Сверить digest сохранённого artifact
   с `asset_digest` в record алгоритмом `asset_digest` из release tooling;
   несовпадение запрещает использовать этот artifact как oracle.
   Ошибка уведомления обрабатывается отдельно через `notify`; не redeploy.

## 3. Smoke и фиксация предыдущего состояния

Проверять явный HTTPS origin без подмены сертификата или отключения TLS checks:

```sh
python3 scripts/check-http-matrix.py \
  --base-url "$STAGING_ORIGIN" --public-dir "$RELEASE_PUBLIC_DIR"
```

`RELEASE_PUBLIC_DIR` — сохранённый production artifact exact candidate из §2.
Параметр обязателен для этого сценария: checker читает из него identity
redirects. Запуск без `--base-url` пишет skip и возвращает 0; это **не PASS**.
Ожидается строка `OK: ...` и отсутствие failures. Матрица проверяет canonical
HTML, redirects, media types, identity 303 и отсутствующие URL 404. Дополнить
ручным smoke Home, Library, Reader и загрузкой локальных CSS/JS/images;
проверить security/cache headers, HTTPS chain и отсутствие redirect на иной host.
Wrapper отдельно сверяет Home SHA-256 с release record. При standalone повторе
сохранить полученные Home bytes и сравнить их с `home_digest` без нормализации.

Для Worker evidence оператор пользуется local pinned Wrangler и отдельным
приватным config с явными `name`, `account_id`, `compatibility_date`, без
build hook, routes, custom domains и секретов. Не использовать top-level
preview config для production-запросов. В защищённой сессии после выбора цели:

```sh
node_modules/.bin/wrangler deployments list --config "$TARGET_CONFIG" --json
node_modules/.bin/wrangler versions view "$ROLLBACK_VERSION_ID" \
  --config "$TARGET_CONFIG" --json
```

Сверить ID с record и actual account/Worker; перед promotion отдельно сохранить
предыдущие Home bytes/digest и здоровый smoke baseline. Восстановление использует
версию того же Cloudflare Worker. Worker rollback не исправляет DNS-конфигурацию:
её корректируют отдельно на Cloudflare по одобренному плану.
Смешанное распределение версий, неизвестная старая version или изменившийся
deployment требуют STOP и разбора; не выбирать первый элемент массива вслепую.

## 4. DNS snapshot и последовательность (план; сейчас не выполнять)

Оператор снимает полный export из действующего DNS provider в приватный bundle.
Одних `dig ANY`, quick scan или public lookup недостаточно. Дополнительно
сохранить настройки, которых может не быть в zone export: proxy status,
flattening, Worker routes/custom domains, redirects, TLS mode, DNSSEC и registrar
delegation. Сопоставить экспорт с authoritative ответами; отдельно проверить
MX, SPF, DKIM, DMARC, CAA, verification TXT, wildcards и прочие сервисы.
Значения не копировать в этот документ или публичный receipt.

Вход от владельца 2026-10-26 содержит 15 строк: отдельные apex/wildcard
Vercel targets, iCloud MX/SPF/DKIM и domain verification, прочие verification
TXT, CAA и отдельный `lab` CNAME. Raw значения и результаты сверки уже сохранены
в долговечном приватном bundle из §1.2. Пустые имена в owner inventory
сопоставлены с apex authoritative DNS; неуказанный TTL одной CAA уточнён
authoritative query (60 секунд для всех трёх configured CAA). Проверка
ограничена предоставленными именами и типами; неизвестные subdomain records
не перечислялись. Перед T0 сверить свежесть bundle, provider settings и DNS;
не выдавать ранее сохранённый snapshot за неизменность текущего состояния.
Сохранять все mail/verification/CAA/`lab` записи; их давность не разрешает удаление.
Vercel ALIAS — формат провайдера: при переносе воспроизвести его смысл средствами
нового DNS provider, не импортировать `ALIAS` как универсальный DNS record type.
Auto-managed apex и wildcard records сверить перед переносом, чтобы учесть
оба множества hostname в новой routing-схеме. Их значения не назначаются
целями возврата на прежний hosting.

Read-only DNS checkpoint 2026-10-26 19:10–19:11 UTC: два независимых recursive
resolver вернули Vercel NS; оба authoritative Vercel сервера подтвердили их и
NS TTL 86400 секунд. Parent referral NS TTL — 3600 секунд. Parent authoritative
DS query вернул NOERROR без DS. Это не
проверка registrar settings и не гарантия будущего DNSSEC состояния. В owner
таблице почти все RR TTL равны 60 секундам; перенос NS имеет отдельное окно
кэширования. Перед назначением окна заново сверить delegation/DS и registrar;
консервативное окно учитывает старый child NS TTL, а не только parent referral.
Нынешний план использует перенос NS с Vercel на Cloudflare. Промежуточный
checkpoint может сохранять текущий traffic до включения Worker Routes/proxy;
после переключения восстановление остаётся в Cloudflare.

В `dns-plan.md` записать точные old/new значения, TTL, время изменений и
источник проверки для каждого затрагиваемого RRset, NS delegation, DS и
routing rule. В `rollback.md` — проверенная Cloudflare baseline version и
Home digest, целевые новые NS/DS, Worker domain/routing и порядок исправления
DNS/TLS внутри новой платформы. Старый Vercel deployment URL/ID не является
обязательным входом. Не подменять plan исправления DNS командой отката Worker:
это разные механизмы, и работоспособность обоих проверяется отдельно.

Точная web-delta после отдельного одобрения switch: для root и wildcard
создать Worker Routes `alexandr-sidorenko.me/*` и `*.alexandr-sidorenko.me/*`
на `production`, затем обновить соответствующие два DNS records по сохранённым
ID до proxied originless A (`192.0.2.0`). Назначение placeholder описано в
[Cloudflare DNS originless setups](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/#originless-setups).
Worker Static Assets обслуживает запросы; placeholder не является Vercel origin.
Не менять остальные 13 records. `lab` остаётся DNS-only и не переводится на
web Worker. До proxy switch проверить активный edge certificate для root и
покрываемых wildcard hostname; произвольные более глубокие hostname не объявлять
проверенными. После switch проверить apex, `www`, один случайный wildcard
hostname и сохранение отдельного `lab`. В asset-only Worker остаются прежние
404/html_handling, CSP и headers; новый runtime code не добавляется.

Routes и proxy records готовятся только по принятому switch plan: сначала
проверить отсутствие конфликтующих routes, затем route → DNS proxy switch,
чтобы не направить посетителя на placeholder без обработчика. Удаление root
record с последующим созданием CNAME не требуется. Worker Custom Domain здесь
не используется: он требует active zone и не поддерживает wildcard matching;
см. [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
и [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).

Порядок выполняется сверху вниз. Подготовка и preflight не меняют registrar NS;
единственная операция смены NS находится в шаге 5:

1. **Если NS уже Cloudflare:** зафиксировать действующий NS/DS, оставить их;
   готовить только endpoint/routing switch. Сверить существующие Worker routes
   и custom domains с планируемой конфигурацией, проверить действующую DNSSEC
   цепочку и TTL. Если checkpoint здоров, перейти к шагу 6; шаги миграции 2–5
   в этой ветке не выполняются. Действующий DS этой зоны не удалять.
2. **Если нужен перенос NS:** новая pending-зона и 15 records уже подготовлены
   (§1.2), сейчас web-направление остаётся прежним. Только прочитать API и
   исходный DNS, проверить bundle, все 15 records и отдельные настройки зоны.
   Зафиксировать старые/новые NS, их TTL и исходное состояние DS. Проверить
   доступ назначенного оператора к registrar. Для текущего домена registry
   WHOIS указывает Namecheap; открытая браузерная сессия требует входа владельца.
   Credentials/2FA не передавать в чат или bundle. На этом шаге ничего не переключать.
3. **TTL preflight до NS write:** записать текущие TTL RRset, child NS и parent
   delegation, а также время измерения. Если принятый план понижает TTL,
   сначала выполнить только одобренное понижение и выждать прежний эффективный
   TTL; отсутствие такого изменения не заменять фиктивным ожиданием. Для уже
   имеющихся RRset с TTL 60 секунд дальнейшее понижение не требуется. Proxied
   Cloudflare records используют Auto TTL; NS и DS имеют отдельные lifetimes.
   Окно наблюдения учитывает самый длинный из применимых старых кэшей.
4. **DS preflight до NS write:** заново запросить DS у parent authoritative
   сервера и сверить DNSSEC в registrar и обеих зонах. Если DS отсутствует,
   а новая зона unsigned (как на сохранённом checkpoint), записать результат:
   удалять DS или отключать DNSSEC не нужно, перейти к шагу 5. Если DS присутствует,
   STOP до отдельного проверенного DNSSEC transition plan. Стандартный путь
   сначала снимает старую validation chain с явным разрешением и выжидает
   прежний DS TTL; только подтверждённое отсутствие старого DS и окончание
   этого ожидания допускают шаг 5. Multi-signer требует своего согласованного
   плана. Не оставлять несовместимый DS и не менять NS внутри этого шага.
5. **Единственный NS write:** только после успешных шагов 1–4, независимых
   Review/QA и owner ACCEPT CUTOVER на конкретную NS/web-delta registrar-оператор
   заменяет старые NS ровно на `bristol.ns.cloudflare.com` и
   `nico.ns.cloudflare.com`. Зафиксировать UTC время и ответ registrar;
   остальную registration data не менять. Для уже делегированной Cloudflare
   зоны этот write не выполняется. Последующие шаги не повторяют смену NS.
6. **Проверка NS checkpoint:** выждать записанное окно propagation; сверить
   parent, оба assigned authoritative NS и минимум два независимых recursive
   resolver. Агент проверяет activation через Cloudflare API и публичный DNS,
   сохранение текущего traffic и почтовых/прочих сервисов. При расхождении
   исправить целевую Cloudflare конфигурацию до следующего шага. DNSSEC с новой
   цепочкой включается лишь после activation по отдельно принятому плану;
   старый DS не возвращать.
7. **Web switch:** при неизменном принятом плане и здоровом NS checkpoint
   оператор выполняет описанную web-delta: два Worker Routes, затем два proxied
   originless DNS records. До этого проверить активный сертификат и Worker
   version. Записать UTC T0 и actual resulting records/routes. Если API/DNS/TLS
   расходятся с принятым планом, не продолжать следующую mutation; исправлять
   отклонение внутри Cloudflare согласно §5.
8. Проверить DNS, HTTPS и smoke production domain, exact candidate digest,
   Worker deployment/version и сервисные records. Учесть, что до истечения
   старых кэшей часть посетителей может продолжать попадать на текущий старый
   endpoint; это propagation, не запланированный возврат hosting. Окно наблюдения
   и частота проверок задаются в bundle до T0; TTL поднимается только после него.

TTL и cache propagation описаны в [Cloudflare DNS TTL](https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/).
Порядок проверки зоны, NS и DNSSEC — [Cloudflare full setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).
Это техническая основа плана; фактические NS/DS и разрешение операций дают
приватные входы и owner decision, а не универсальный пример из документации.

## 5. Восстановление внутри Cloudflare (сценарий будущего исполнения)

Триггеры: TLS failure, неожиданные NXDOMAIN/SERVFAIL, неверный candidate,
ошибка обязательного HTTP smoke, недоступный critical route/asset, поломка
почтовых или иных сохранённых сервисов. Один подтверждённый критический сбой
достаточен для остановки дальнейших изменений и запуска одобренного восстановления;
не ждать истечения общего окна. Notification failure отдельно таким сбоем не
считается. Назначенный оператор фиксирует причину и UTC время, прекращает
concurrent releases и сверяет actual state с ожидаемым перед каждым write.

- **Сбой candidate при здоровом Cloudflare routing:** проверить тот же
  Worker/account и что live version всё ещё candidate. Сверить сохранённый
  rollback version ID через `versions view`; при доступной здоровой baseline
  вернуть её целиком командой ниже. Если state изменился параллельно, STOP
  для разбора, а не overwrite чужого deployment.
- **Проблема hosting/domain/DNS:** исправить Worker domain/routing и records
  в целевой Cloudflare зоне по before/after таблице; проверить zone activation,
  покрытие сертификата и DNS. Если healthy Worker baseline недоступна,
  диагностировать и исправить candidate на Cloudflare; не подставлять случайную
  version и не объявлять проблему устранённой без smoke.
- **Проблема delegation/DNSSEC:** сверить registrar NS с назначенными Cloudflare
  nameservers и привести DS в соответствие с целевой validation chain по
  проверенному плану. Дождаться применимых cache lifetimes и повторить запросы
  к parent/authoritative/recursive DNS. Старые Vercel NS и старый hosting не
  используются как направление recovery.

Только при отдельном разрешении реального rollback и прошедших preconditions:

```sh
node_modules/.bin/wrangler versions deploy "$ROLLBACK_VERSION_ID@100%" \
  --config "$TARGET_CONFIG" --yes --message "Approved cutover rollback"
```

Сразу проверить новый deployment ID, 100% проверенной baseline version,
HTTPS, соответствующий ожидаемый Home digest и применимую HTTP matrix. Записать
результаты DNS у authoritative и независимых resolvers, влияние NS/DS caches
и время следующей проверки. Если recovery не подтверждён, оставить incident
открытым и передать владельцу фактическое состояние.

Worker rollback меняет code/assets version, но не откатывает данные связанных
ресурсов; ограничения — [Cloudflare rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## 6. Pre-cutover go/no-go

- [ ] Заполнены все входы §1; bundle и копия доступны оператору восстановления.
- [ ] Freeze действует; final main commit, Theme gitlink, pins и digests связаны.
- [ ] Staging exact candidate прошёл HTTP/TLS, Home digest и ручной smoke;
      active Worker version подтверждена; timestamps достаточно свежие.
- [ ] Проверены actual main/dev settings, отсутствие concurrent promotion,
      проверенная Cloudflare baseline version и доступность её assets.
- [ ] DNS export сверён; before/after delta, TTL/NS/DS ожидания и recovery
      заполнены; почта и прочие сервисы сохраняются.
- [ ] Независимые Review и QA одобрили один exact subject и актуальный bundle;
      нет блокирующих findings или неподтверждённых assumptions.
- [ ] Владелец принял конкретный switch plan (ACCEPT CUTOVER), назначены оператор,
      UTC окно, длительность наблюдения и полномочия rollback по триггерам §5.

Любой unchecked пункт — NO-GO. Walkthrough и simulated rollback требуют
отдельного разрешённого сценария; чтение этого runbook не является их PASS.
Восстановление после cutover остаётся внутри Cloudflare. Удаление прежних
ресурсов не входит в этот план и не выполняется автоматически.
Изменение candidate, targets, DNS или rollback baseline после приёмки требует
повторной проверки затронутого плана до switch.
