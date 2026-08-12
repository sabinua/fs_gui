# FS GUI

Мультиплатформенний GUI для FreeSWITCH: підключення через ESL (напряму або через SSH-тунель), декілька серверів одночасно у вкладках, плагінна архітектура. Див. [PLAN.md](PLAN.md).

## Стек

Wails v2 (Go) + React 18 + TypeScript + Tailwind CSS v4. Локальні дані — SQLite (`~/.config/fsgui/fsgui.db`), секрети — системний keychain.

## Розробка

Потрібні: Go ≥ 1.22, Node ≥ 20, Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`).

На Linux збірка йде з тегом `webkit2_41` (Ubuntu 24.04 / Mint 22 мають лише libwebkit2gtk-4.1):

```sh
wails dev -tags webkit2_41      # live-reload розробка
wails build -tags webkit2_41    # production-збірка → build/bin/fsgui
go test ./internal/...          # unit-тести ядра
```

## Можливості інтерфейсу

- **Мова**: українська / англійська — перемикач у нижньому куті сайдбара (зберігається).
- **Тема**: темна / світла — перемикач поруч (зберігається).
- **Гарячі клавіші**: `Ctrl+N` — нове підключення, `Ctrl+W` — закрити вкладку, `Ctrl+1…9` — перемкнути вкладку.
- **Логи**: `~/.config/fsgui/fsgui.log`.

CI (`.github/workflows/build.yml`): тести + збірки Linux/Windows/macOS, реліз-артефакти на тег `v*`.

## Структура

```
app.go                  Wails bindings (API для frontend)
main.go                 точка входу
internal/
  esl/                  ESL inbound-клієнт (протокол, auth, api/bgapi, події)
  sshtunnel/            SSH-з'єднання + dial віддалених адрес (пароль/ключ/agent)
  store/                SQLite (профілі) + секрети в keychain
  session/              Session (reconnect-цикл, події) + Manager (N сесій)
  plugin/               API вбудованих плагінів (v1) + реєстр
frontend/
  src/App.tsx           менеджер підключень + вкладки серверів
  src/components/       ProfileForm (CRUD + тест з'єднання), Dashboard
```

## Push-події backend → frontend

- `session:status` — `{connId, state: connecting|online|reconnecting|offline, error?}`
- `fs:event` — `{connId, name, fields, body?}` (базова підписка: канали, запис, CDR, heartbeat)
