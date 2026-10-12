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
