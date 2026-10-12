---
title: Исполняемый reference сайта
type: design-reference
url: /__design/site
outputs: [HTML]
params:
  design_reference: true
build:
  render: always
  list: never
  publishResources: false
sitemap:
  disable: true
---
## Изображение {#site-figure}

![Сквер — существующее production-изображение](/assets/library/skver/skver.jpg "Production figure pipeline")

## Код {#site-code}

```python {file="reference.py" caption="Production code render hook"}
print("Native content remains readable without JavaScript")
```

## Таблица {#site-table}

| Состояние | Проверка |
| :--- | :--- |
| Без JavaScript | Текст и ссылки доступны |
| Узкий экран | Перенос текста и локальная прокрутка |

## Проза и ссылки {#site-prose}

Обычный абзац содержит **выделение**, *курсив*, `inline code` и
[внутреннюю ссылку](/library). Ссылка на заголовок
[ведёт к таблице](#site-table), а сноска имеет штатный обратный переход[^reference].

> Цитата использует обычный Markdown renderer. Она остаётся текстом без JavaScript.

[^reference]: Примечание к локальному служебному примеру, без material identity.

## Plain code и широкая строка {#site-code-plain}

```text
plain_code_remains_server_rendered_and_this_deliberately_wide_line_checks_local_scrolling_without_shrinking_text_or_forcing_horizontal_page_overflow_0123456789_abcdefghijklmnopqrstuvwxyz
```

## Широкая таблица {#site-table-wide}

| Значение | Проверка | Примечание |
| :--- | :---: | ---: |
| long_unbroken_value_for_local_table_scrolling_0123456789_abcdefghijklmnopqrstuvwxyz | Центр | 42 |
| Второй ряд | Заголовки и выравнивание | 7 |

## Build-time MathML {#site-math}

Inline формула \(x^2 + y^2 = z^2\) и display MathML:

$$
\sum_{i=1}^{n} a_i + \sum_{j=1}^{m} b_j + \sum_{k=1}^{p} c_k + \sum_{l=1}^{q} d_l = \int_0^1 f(x)\,dx
$$

## Figure caption и source {#site-figure-credit}

{{< figure src="/assets/library/skver/skver.jpg" alt="Сквер — production image" caption="Подпись с credit/source через существующий renderer." source="Production material" source_url="/library/skver" >}}

## Wide / full figure {#site-figure-widths}

{{< figure src="/assets/library/skver/skver.jpg" alt="Сквер, wide variant" caption="Existing wide role." class="wide" >}}

{{< figure src="/assets/library/skver/skver.jpg" alt="Сквер, full variant" caption="Existing full role." class="full" >}}

## Gallery {#site-gallery}

{{< gallery >}}
{{< figure src="/assets/library/bluredu-new-teachers/core-team.jpg" alt="Команда в аудитории" caption="Первое изображение." >}}
{{< figure src="/assets/library/bluredu-new-teachers/many-students.jpg" alt="Студенты в аудитории" caption="Второе изображение." >}}
{{< /gallery >}}

## Parallel / translation {#site-parallel}

{{< parallel source-lang="en" translation-lang="ru" >}}
Native content remains readable. // Нативное содержимое остаётся читаемым.
Local scrolling stays local. // Локальная прокрутка остаётся локальной.
{{< /parallel >}}

## Verse block {#site-verse}

{{< verse >}}
Первая строка локального примера.
Вторая строка сохраняет свой ритм.
{{< /verse >}}
