# Maps Cameras

Веб-сервис для отображения RTSP-камер видеонаблюдения на интерактивной карте с live-просмотром видеопотоков через [go2rtc](https://github.com/AlexxIT/go2rtc).

Каждая камера привязана к точке на карте и отображается цветным маркером с полупрозрачным конусом поля обзора. Кликнул по камере — открылся стрим с минимальной задержкой.

---

## Возможности

- **Интерактивная карта** на Leaflet с переключением между слоями OpenStreetMap (улицы) и Esri World Imagery (спутник).
- **Две режима работы:**
  - **Просмотр** — карта + плеер стрима в split-pane (перетаскиваемый разделитель). На мобильных — полноэкранный стрим с кнопкой возврата к карте.
  - **Редактирование** — drag-n-drop камер из списка на карту, визуальные контролы для поворота, ширины угла и дальности конуса обзора, формы редактирования свойств.
- **Камера = иконка + конус** — цвет настраивается, геометрия конуса задаётся тремя параметрами (поворот, угол, дистанция в метрах).
- **Undo/Redo** в режиме редактирования (Ctrl+Z / Ctrl+Shift+Z) — снапшоты всех изменений в рамках сессии.
- **Low-latency стриминг** через go2rtc: WebRTC или MSE/WebSocket, H.264 и H.265. Стримы добавляются в go2rtc по требованию и автоматически удаляются при закрытии вкладки (heartbeat + cleanup).
- **Transport race** — WebRTC и MSE пробуются параллельно, показывается тот, что ответил первым. WebRTC приоритетнее: даже если MSE запустился раньше, плеер переключится на WebRTC в течение 15-секундного окна.
- **Плеер-тулбар** (десктоп):
  - **Статистика стрима** — битрейт, FPS, потери пакетов, тип активного транспорта (WebRTC/MSE).
  - **Скриншот** кадра в файл или в буфер обмена.
  - **Запись** со стрима с сохранением на диск (File System Access API в Chrome/Edge — без ограничения длительности; in-memory fallback в Firefox/Safari с лимитом 10 минут и предупреждением за минуту до конца).
  - **Instant replay** — одним кликом сохранить фрагмент 10 секунд до клика + 10 секунд после. Реализован через ротацию перекрывающихся `MediaRecorder`-слотов (2–4 слота, настраивается). Выключен на мобильных для экономии батареи.
  - **Настройки битрейта** — auto / 2 / 4 / 8 Mbps, сохраняются в localStorage.
- **Мини-превью камеры** в правом углу карты в режиме редактирования — сразу виден выбранный стрим.
- **Импорт M3U плейлистов** — массовое добавление камер из списка `#EXTINF:-1,Имя\nrtsp://...`.
- **Автоматический fit bounds** — при старте карта подстраивается так, чтобы все размещённые камеры попали в область просмотра.
- **Single binary deployment** — Go-бэкенд со встроенным React SPA через `embed.FS`. Один бинарник, одна точка входа.

---

## Архитектура

```
┌─────────────────────────────────────────────┐
│              Browser (React SPA)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │  Map     │ │ Stream   │ │   Editor     │ │
│  │ (Leaflet)│ │ (WebRTC/ │ │ (формы, DnD, │ │
│  │          │ │  MSE)    │ │  undo/redo)  │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│                    │                        │
│              Zustand Store                  │
└────────────────┬───────────────────┬────────┘
                 │ REST API          │ WS (сигналинг +
                 │                   │    heartbeat)
                 ▼                   ▼
        ┌────────────────┐   ┌──────────────┐
        │   Go Backend   │   │   go2rtc     │
        │   :8080        │   │  (Frigate)   │
        │                │   │              │
        │  • CRUD камер  │   │  • WebRTC    │
        │  • SQLite      │   │  • MSE/WS    │
        │  • SPA assets  │   │  • RTSP proxy│
        │  • Прокси      │   │              │
        └────────────────┘   └──────────────┘
```

**Ключевые решения:**

- **Go backend** — единый бинарник, раздаёт SPA из `embed.FS`, хранит метаданные камер в SQLite, проксирует сигналинг к go2rtc для обхода CORS, управляет жизненным циклом стримов.
- **go2rtc** — уже развёрнут (например, как часть Frigate). Наш сервис подключается к существующему инстансу.
- **Streams on demand** — RTSP-поток добавляется в go2rtc только при клике по камере. WebSocket-соединение с клиентом автоматически закрывает стрим при разрыве.
- **WebRTC + MSE fallback** — WebRTC для минимальной задержки, MSE через WebSocket как запасной.
- **Без авторизации** на старте — сервис для локальной сети.

---

## Стек

**Backend:** Go 1.22+, `net/http` ServeMux, `modernc.org/sqlite` (pure Go), `gorilla/websocket`, `gopkg.in/yaml.v3`

**Frontend:** React 18, TypeScript, Vite, Zustand, react-leaflet, Tailwind CSS v4

**Внешние сервисы:** go2rtc (встроен в Frigate)

---

## Быстрый старт (dev)

```bash
# Клонируем
git clone https://github.com/Fokir/maps-cameras.git
cd maps-cameras

# Backend
go mod download
make dev-backend                     # http://localhost:8080

# Frontend (в отдельном терминале)
cd web && npm install
cd .. && make dev-frontend           # http://localhost:5173
```

Vite dev server проксирует `/api/*` на бэкенд. Открывай http://localhost:5173.

### Конфигурация

`config.yaml` в корне проекта:

```yaml
server:
  port: 8080
database:
  path: ./data/cameras.db
go2rtc:
  url: http://server.local:1984        # адрес твоего go2rtc (включая порт)
map:
  center: [54.3142, 48.4031]           # fallback центр карты
  zoom: 18
```

---

## Production сборка

```bash
make build    # собирает frontend (web/dist), копирует в cmd/server/dist, билдит Go-бинарник
./maps-cameras                         # или ./maps-cameras.exe на Windows
```

На выходе — один файл со встроенной статикой.

---

## Деплой через Docker Compose (sokol.local)

Инструкция для быстрого развёртывания на сервере, где уже запущен Frigate с go2rtc.

### 1. Установи Docker и docker-compose

Если ещё нет — `curl -fsSL https://get.docker.com | sh`.

### 2. Подготовь каталог

```bash
mkdir -p ~/maps-cameras && cd ~/maps-cameras
```

### 3. Скачай compose-файл и пример конфига

```bash
curl -O https://raw.githubusercontent.com/Fokir/maps-cameras/master/docker-compose.yml
curl -o config.yaml https://raw.githubusercontent.com/Fokir/maps-cameras/master/config.yaml.example
```

### 4. Отредактируй `config.yaml`

Укажи правильный адрес твоего go2rtc и начальный центр карты:

```yaml
server:
  port: 8080
database:
  path: ./data/cameras.db
go2rtc:
  url: http://sokol.local:1984           # порт 1984 — это API go2rtc (или go2rtc внутри Frigate)
map:
  center: [54.3142, 48.4031]             # начальный центр карты
  zoom: 18
```

### 5. Запусти

```bash
docker compose pull
docker compose up -d
docker compose logs -f                   # посмотреть логи
```

Открывай **http://sokol.local:8080**.

### Обновление

```bash
docker compose pull
docker compose up -d
```

### Где хранятся данные

- `./data/cameras.db` — SQLite с камерами (персистентный, бекапь этот каталог)
- `./config.yaml` — конфигурация

### Если go2rtc на другом хосте

В compose-файле раскомментируй `extra_hosts` и укажи IP, чтобы контейнер мог резолвить имя:

```yaml
extra_hosts:
  - "sokol.local:192.168.1.10"
```

### Сборка из исходников вместо готового образа

Если хочешь собрать сам — замени в `docker-compose.yml` строку `image:` на `build: .` и выполни:

```bash
docker compose build
docker compose up -d
```

---

## API

### Камеры

| Метод  | Путь                    | Описание                             |
|--------|-------------------------|--------------------------------------|
| GET    | `/api/cameras`          | Список всех камер                    |
| POST   | `/api/cameras`          | Создать камеру                       |
| PUT    | `/api/cameras/:id`      | Обновить камеру                      |
| DELETE | `/api/cameras/:id`      | Удалить камеру                       |
| POST   | `/api/cameras/import`   | Импорт из M3U (multipart/form-data)  |

### Стриминг

| Метод  | Путь                      | Описание                                        |
|--------|---------------------------|-------------------------------------------------|
| POST   | `/api/stream/start`       | Добавить стрим в go2rtc, вернуть URL            |
| POST   | `/api/stream/stop`        | Убрать стрим из go2rtc                          |
| POST   | `/api/stream/heartbeat`   | Подтвердить активность (cleanup через 30с)      |
| WS     | `/api/stream/ws`          | Прокси MSE WebSocket к go2rtc                   |
| WS     | `/api/stream/webrtc`      | Прокси WebRTC сигналинга                        |

### Конфигурация

| Метод  | Путь                | Описание                                  |
|--------|---------------------|-------------------------------------------|
| GET    | `/api/config/map`   | Центр и зум карты по умолчанию            |

---

## Структура проекта

```
cmd/server/               # точка входа, встроенная статика
internal/
  config/                 # парсинг config.yaml
  database/               # SQLite инициализация + миграции
  camera/                 # модель, репозиторий, HTTP handlers, M3U импорт
  stream/                 # проксирование go2rtc, tracker, handlers
  router/                 # HTTP маршруты + SPA static
web/                      # React SPA
  src/
    app/                  # корневые компоненты, layout
    modules/
      map/                # Leaflet, маркеры, конусы, контролы
      camera/             # список, форма, импорт, store
      stream/             # плеер, store, heartbeat, мини-превью
      editor/             # editor layout, DnD, undo/redo
    shared/               # types, API клиент, хуки
config.yaml               # конфигурация
Makefile                  # dev/build/run команды
Dockerfile                # multi-stage сборка
docker-compose.yml        # деплой
```

---

## Лицензия

MIT
