---
title: "Полигон типографики"
description: "Фикстура: проверка Markdown, типографики, кириллицы и подсветки кода. Черновик, в сборку сайта не попадает."
date: 2026-08-01
lastmod: 2026-08-01
draft: true
authors: ["batyshkaLenin"]
id: "01a00aea-44db-7086-9b1c-c38f325632b6"
type: "article"
tags: []
audio:
  - src: "/assets/library/regular-visitor/Постоянщик.mp3"
    type: "audio/mpeg"
---

Короткий лид статьи. Здесь проверяются **полужирное начертание**, *курсив*, ***полужирный курсив***, ~~зачёркнутый текст~~, `inline code` и [обычная ссылка](https://gohugo.io/).

Русский текст нужен для проверки кириллицы: «кавычки-ёлочки», „вложенные кавычки“, длинное тире — такое, короткое тире – такое, дефис - такой. Числа: 0, 1, 2, 42, 1 000, 3,14159, +7 (999) 123-45-67.

English text checks Latin glyphs, punctuation, kerning, ligatures, and combinations like `fi`, `fl`, `->`, `=>`, `===`.

Специальные символы: © ® ™ § ¶ № € $ ¥ ₽ ± × ÷ ≈ ≠ ≤ ≥ → ← ↔ ↑ ↓.

## Заголовок второго уровня

Абзац с достаточно длинной строкой, чтобы проверить ширину текстовой колонки, межстрочное расстояние и переносы. Хорошая типографика должна оставаться читаемой как на широком мониторе, так и на небольшом экране телефона.

### Заголовок третьего уровня

Это предложение заканчивается принудительным переносом.  
А это уже следующая строка того же абзаца.

#### Заголовок четвёртого уровня

##### Заголовок пятого уровня

###### Заголовок шестого уровня

---

## Ссылки и оформление текста

- Внешняя ссылка: [документация Hugo](https://gohugo.io/documentation/).
- Относительная ссылка: [другая статья](/posts).
- Автоматическая ссылка: <https://example.com>.
- Электронная почта: <user@example.com>.
- Клавиши: Ctrl + Alt + T.
- Верхний индекс: E = mc².
- Нижний индекс: H₂O, x₁, x₂.
- Дроби и знаки: ½ ¼ ¾ ‰ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ ∫.
- Греческие буквы: α β γ δ ε θ λ μ π σ φ ω Δ Ω.

Исходный полигон писал индексы и выделения сырым HTML (`kbd`, `sup`, `sub`,
`mark`, `abbr`). Здесь они заменены юникодом: `markup.goldmark.renderer.unsafe
= false`, сайт не рендерит HTML из Markdown, и при `--panicOnWarning` такая
разметка останавливает сборку. Для степеней, индексов и большинства
математических знаков юникода достаточно; настоящий набор формул потребовал бы
отдельного решения (серверный KaTeX через goldmark passthrough — он тянет свой
набор шрифтов).

Экранированные символы: \*звёздочка\*, \_подчёркивание\_, \# решётка, \[скобки\].

## Списки

### Маркированный список

- Первый пункт.
- Второй пункт с длинным описанием, которое должно корректно переноситься на следующую строку.
  - Вложенный пункт.
  - Ещё один вложенный пункт.
    - Третий уровень вложенности.
- Последний пункт.

### Нумерованный список

1. Установить Hugo.
2. Создать новый сайт.
3. Добавить тему.
   1. Проверить шаблоны.
   2. Настроить стили.
4. Собрать проект.

### Список задач

- [x] Добавить заголовки.
- [x] Проверить таблицы.
- [x] Включить подсветку кода.
- [ ] Исправить всё, что выглядит подозрительно.

## Цитаты

> Хороший дизайн заметен прежде всего тогда, когда он перестаёт мешать содержанию.

> Цитата может состоять из нескольких абзацев.
>
> Второй абзац внутри той же цитаты.
>
> > А это вложенная цитата.
>
> — Неизвестный специалист по CSS

## Таблица

| Компонент | Статус | Приоритет | Примечание |
| :--- | :---: | ---: | --- |
| Типографика | Готово | 10 | Кириллица и латиница |
| Подсветка кода | В работе | 8 | Проверить светлую и тёмную темы |
| Таблицы | Готово | 6 | Нужен горизонтальный скролл |
| Мобильная версия | Не проверена | 9 | Ширина около 360 px |

## Код

Встроенный код: `const answer: number = 42;`.

Код существует в двух видах (§28). Простой фрагмент — только код; подробный блок
объявляет на ограде имя файла или подпись и получает имя файла сверху, номера
строк и подпись языка внизу.

### TypeScript

```typescript
type User = {
  id: string;
  name: string;
  roles: readonly string[];
};

async function loadUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<User>;
}

const user = await loadUser("42");
console.log(`${user.name}: ${user.roles.join(", ")}`);
```

### Bash

```bash
#!/usr/bin/env bash
set -euo pipefail

hugo --minify

printf 'Site generated in %s\n' "public/"
find public -type f | sort | head
```

### JSON

```json
{
  "name": "typography-test",
  "private": true,
  "scripts": {
    "dev": "hugo server --buildDrafts",
    "build": "hugo --minify"
  }
}
```

### HTML и CSS

```html
<article class="post">
  <header class="post__header">
    <h1>Заголовок статьи</h1>
    <time datetime="2026-08-06">6 августа 2026</time>
  </header>

  <p>Основное содержимое страницы.</p>
</article>
```

```css
.post {
  max-width: 72ch;
  margin-inline: auto;
  padding: clamp(1rem, 4vw, 3rem);
}

.post__header {
  border-block-end: 1px solid currentColor;
}

code {
  font-variant-ligatures: none;
}
```

### Код без указанного языка

```
Этот блок не должен получать языковую подсветку.
Он нужен для проверки фона, рамки, отступов и горизонтального скролла.
Очень-длинная-строка-без-пробелов-для-проверки-overflow-x-и-поведения-контейнера-кода.
```

### Подробный блок

```typescript {file="src/user.ts" caption="Подпись подробного блока: она нужна не всегда, а имя файла — почти всегда."}
type User = {
  id: string;
  roles: readonly string[];
};

async function loadUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}?include=roles&expand=permissions&locale=ru-RU`);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<User>;
}
```

### Diff

```diff
 const value = items.filter(Boolean);
-const result = oldFunction(value);
+const result = newFunction(value);
 return result;
```

## Изображение

![Команда Blurred Technologies в аудитории](/assets/library/bluredu-new-teachers/core-team.jpg "Подпись при наведении")

*Подпись под изображением, оформленная обычным курсивом.*

### Фигура с источником

{{< figure
    src="/assets/library/philosophy-of-freedom/lenin.jpg"
    alt="Портрет Ленина"
    caption="Подпись фигуры, заданной шорткодом."
    source="Фото: архив Blurred Technologies"
    source_url="https://example.com/archive" >}}

### Галерея

{{< gallery >}}
  {{< figure src="/assets/library/bluredu-new-teachers/core-team.jpg" alt="Команда в аудитории" caption="Первая картинка галереи." >}}
  {{< figure src="/assets/library/bluredu-new-teachers/many-students.jpg" alt="Много студентов в зале" caption="У второй — своя подпись." >}}
  {{< figure src="/assets/library/23/strange-hat.jpg" alt="Человек в странной шляпе" caption="И у третьей тоже." >}}
{{< /gallery >}}

## Видео

{{< video
    src="/assets/library/typography-playground/sample.mp4"
    poster="/assets/library/skver/skver.jpg"
    captions="/assets/library/typography-playground/sample.vtt"
    caption="Фикстура видео: дизеренный постер, штатные элементы управления, субтитры." >}}

## Сноски

У Hugo есть собственная история развития Markdown-рендеринга[^hugo], а у этой фразы есть дополнительное пояснение[^note].

[^hugo]: Современные версии Hugo используют Goldmark в качестве Markdown-рендерера.
[^note]: Сноски полезны для примечаний, которые не должны разрывать основной текст.

## Определения

Markdown
: Облегчённый язык разметки.

Hugo
: Генератор статических сайтов, написанный на Go.

Goldmark
: Markdown-рендерер, используемый Hugo.

## Блок кода на Go

Раздел исходного полигона был свёрнут через сырой `<details>`; здесь он развёрнут,
потому что HTML из Markdown на этом сайте не рендерится.

```go
package main

import "fmt"

func main() {
	fmt.Println("Hello from Hugo")
}
```

## Математика

Формулы сейчас **не рендерятся** — ни MathJax, ни KaTeX не подключены, и блоки
ниже выводятся как обычный текст. Раздел оставлен намеренно: он показывает
фактическое состояние, а не желаемое.

Встроенная формула: \( f(x) = x^2 + 2x + 1 \).

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

Пока формулы записываются юникодом: ∫₀¹ x² dx = ⅓, f(x) = x² + 2x + 1.

## Hugo shortcode

Раскомментируйте shortcode, который поддерживает ваша тема:

```go-html-template
{{</* figure
    src="/images/typography-test.webp"
    alt="Тестовое изображение"
    caption="Подпись, созданная через shortcode figure."
*/>}}
```

## Смешанный контент

1. Элемент списка с цитатой:

   > Цитата внутри нумерованного списка.

2. Элемент списка с кодом:

   ```javascript
   const nested = true;
   ```

3. Элемент списка с дополнительным абзацем.

   Новый абзац остаётся частью третьего элемента.

---

## Финальный абзац

Последняя строка нужна для проверки нижнего отступа статьи. **Конец тестовой страницы.**
