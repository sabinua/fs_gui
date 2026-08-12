import {createContext, ReactNode, useCallback, useContext, useEffect, useState} from 'react'

export type Lang = 'uk' | 'en'
export type Theme = 'dark' | 'light'

// Ukrainian strings ARE the keys; this maps them to English.
// A missing entry falls back to the key itself.
const en: Record<string, string> = {
  // App shell
  'Підключення': 'Connections',
  'Додати підключення': 'Add connection',
  'Немає профілів.': 'No profiles yet.',
  'Натисніть «+», щоб додати FreeSWITCH-сервер.': 'Press “+” to add a FreeSWITCH server.',
  'Підключити': 'Connect',
  'Відключити': 'Disconnect',
  'Редагувати': 'Edit',
  'Копіювати': 'Clone',
  'Видалити': 'Delete',
  'Оберіть підключення зліва (подвійний клік) або створіть нове.': 'Pick a connection on the left (double-click) or create a new one.',
  'Видалити підключення «{name}»?': 'Delete connection “{name}”?',

  // Session states
  'Підключення…': 'Connecting…',
  'Перепідключення…': 'Reconnecting…',
  'Онлайн': 'Online',
  'Офлайн': 'Offline',

  // Tabs
  'Дашборд': 'Dashboard',
  'Дзвінки': 'Calls',
  'Директорія': 'Directory',
  'Події': 'Events',

  // Profile form
  'Нове підключення': 'New connection',
  'Редагувати: {name}': 'Edit: {name}',
  'Назва': 'Name',
  'Колір': 'Color',
  'ESL хост': 'ESL host',
  'Порт': 'Port',
  'Пароль ESL': 'ESL password',
  '(порожньо — не змінювати)': '(empty — keep current)',
  'Підключатись через SSH-тунель': 'Connect through an SSH tunnel',
  'SSH хост': 'SSH host',
  'Користувач': 'User',
  'Автентифікація': 'Authentication',
  'Пароль': 'Password',
  'Приватний ключ': 'Private key',
  'Пароль SSH': 'SSH password',
  'Шлях до ключа': 'Key path',
  'Пароль ключа (якщо є)': 'Key passphrase (if any)',
  'Підключатись автоматично при старті': 'Connect automatically on startup',
  'Плагіни': 'Plugins',
  '· активний': '· active',
  '{mods} не завантажено': '{mods} not loaded',
  'Перевірити з’єднання': 'Test connection',
  'Скасувати': 'Cancel',
  'Зберегти': 'Save',
  'З’єднання успішне (SSH та ESL)': 'Connection OK (SSH and ESL)',
  'Не вдалося підключитись': 'Could not connect',

  // Dashboard
  'Активні дзвінки': 'Active calls',
  'Сесії': 'Sessions',
  'пік {peak} · макс {max}': 'peak {peak} · max {max}',
  'Сесій/с': 'Sessions/s',
  'макс {max}': 'max {max}',
  'Сесій від старту': 'Sessions since start',
  'Sofia-профілі': 'Sofia profiles',
  'Немає даних (mod_sofia не завантажено?)': 'No data (mod_sofia not loaded?)',
  'Завантажені модулі': 'Loaded modules',
  '— переглянути список': '— view list',
  'Модулі ({n})': 'Modules ({n})',
  'Фільтр…': 'Filter…',
  'Очікування з’єднання…': 'Waiting for connection…',

  // Global vars (dashboard)
  'Глобальні змінні ({n})': 'Global variables ({n})',
  'Оновити': 'Refresh',

  // Commands / macros
  'Команди': 'Commands',
  'Створити вихідний дзвінок: A-leg набирається першим, після відповіді з’єднується з призначенням.':
    'Create an outbound call: the A-leg is dialed first, then connected to the destination on answer.',
  'Канал (A-leg)': 'Channel (A-leg)',
  'Призначення (extension або &app)': 'Destination (extension or &app)',
  'Номер у діалплані або одразу застосунок через &app(args).': 'A dialplan number, or an application directly via &app(args).',
  'Діалплан': 'Dialplan',
  'Caller ID (ім’я)': 'Caller ID (name)',
  'Caller ID (номер)': 'Caller ID (number)',
  'Таймаут, с': 'Timeout, s',
  'key=value через кому — підставляються у {…} перед URL каналу.': 'Comma-separated key=value — placed into {…} before the channel URL.',
  'Керування ядром FreeSWITCH на льоту.': 'Control the FreeSWITCH core at runtime.',
  'Підкоманда': 'Subcommand',
  'Рівень логів': 'Log level',
  'Рівень (0–10)': 'Level (0–10)',
  'Причина (hangup cause)': 'Hangup cause',
  'Лише канали зі змінною (опційно)': 'Only channels with a variable (optional)',
  'Значення змінної': 'Variable value',
  'Порожньо — обидва напрямки.': 'Empty — both directions.',
  'Значення': 'Value',
  'Мілісекунди': 'Milliseconds',
  'Режим': 'Mode',
  'Зупинити FreeSWITCH ({mode})? Це перерве всі дзвінки та з’єднання.':
    'Shut down FreeSWITCH ({mode})? This will drop all calls and connections.',
  'Розірвати ВСІ активні дзвінки?': 'Hang up ALL active calls?',
  'Керування SIP-профілем mod_sofia.': 'Manage a mod_sofia SIP profile.',
  'Профіль': 'Profile',
  'Дія': 'Action',
  'Спочатку reloadxml': 'reloadxml first',
  'Перечитати XML-конфіг перед виконанням дії.': 'Re-read the XML config before performing the action.',
  'Профіль {profile} буде зупинено — активні дзвінки через нього розірвуться. Продовжити?':
    'Profile {profile} will be stopped — active calls through it will drop. Continue?',
  'Перезавантажити модуль без рестарту FreeSWITCH.': 'Reload a module without restarting FreeSWITCH.',
  'Модуль': 'Module',
  'Довільна API-команда (як у fs_cli).': 'Arbitrary API command (as in fs_cli).',
  'Команда': 'Command',
  'Заповніть форму — команда з’явиться тут': 'Fill in the form — the command will appear here',
  'Копіювати команду': 'Copy command',
  '▶ Виконати': '▶ Run',
  'Заповніть обов’язкові поля: {fields}': 'Fill in the required fields: {fields}',
  'Журнал ({n})': 'Log ({n})',
  'виконується…': 'running…',
  '(порожня відповідь)': '(empty reply)',

  // User macros
  'Мої макроси': 'My macros',
  '+ Створити макрос': '+ New macro',
  'Новий макрос': 'New macro',
  'Опис': 'Description',
  'Шаблон команди': 'Command template',
  '<поле> — обов’язкове · <поле=значення> — з дефолтом · <поле:a|b|c> — вибір зі списку. Фігурні дужки {…} лишаються в команді як є.':
    '<field> — required · <field=value> — with a default · <field:a|b|c> — pick from a list. Curly braces {…} stay in the command as they are.',
  'Поля форми ({n})': 'Form fields ({n})',
  'немає — команда виконається як є': 'none — the command runs as is',
  'Виконувати у фоні (bgapi)': 'Run in background (bgapi)',
  'Питати підтвердження перед виконанням': 'Ask for confirmation before running',
  'Виконати макрос «{name}»?': 'Run macro “{name}”?',
  'Видалити макрос «{name}»?': 'Delete macro “{name}”?',

  // Calls
  'Оновити знімок': 'Refresh snapshot',
  '⟳ Оновити': '⟳ Refresh',
  'Немає активних каналів': 'No active channels',
  'Тривалість': 'Duration',
  'Напрямок': 'Direction',
  'Від': 'From',
  'Кому': 'To',
  'Стан': 'State',
  'Додаток': 'Application',
  'Дії': 'Actions',
  '→ вхідний': '→ inbound',
  '← вихідний': '← outbound',
  'Записати': 'Record',
  'Зупинити запис': 'Stop recording',
  'Трансфер': 'Transfer',
  'Змінні': 'Variables',
  'Розірвати': 'Hang up',
  'Розірвати дзвінок {from} → {to}?': 'Hang up call {from} → {to}?',

  // Transfer dialog
  'Куди (extension / номер)': 'Destination (extension / number)',
  'Кого переводимо': 'Which leg to transfer',
  'A-leg (цей канал)': 'A-leg (this channel)',
  'B-leg (співрозмовник)': 'B-leg (the peer)',
  'Обидва': 'Both',
  'Перевести': 'Transfer',

  // Vars drawer
  'Змінні каналу': 'Channel variables',
  'Змінні ({n}) — клік по значенню, щоб редагувати': 'Variables ({n}) — click a value to edit',
  '(порожньо)': '(empty)',
  'Клік — редагувати': 'Click to edit',
  'Додати / встановити змінну': 'Add / set a variable',
  'назва': 'name',
  'значення': 'value',
  'Службові поля каналу ({n})': 'Channel fields ({n})',

  // Directory
  'онлайн {n}': 'online {n}',
  'Пошук (номер, ім’я, група)…': 'Search (number, name, group)…',
  'лише зареєстровані': 'registered only',
  'Нічого не знайдено': 'Nothing found',
  'Домен': 'Domain',
  'зареєстрований': 'registered',
  'офлайн': 'offline',
  'Контекст': 'Context',
  'Групи': 'Groups',
  'Реєстрації ({n})': 'Registrations ({n})',
  'Немає активних реєстрацій': 'No active registrations',
  'Мережа': 'Network',
  'Діє до': 'Expires',
  'Агент (token)': 'Agent (token)',
  'FS-хост': 'FS host',
  'Скинути реєстрацію (flush_inbound_reg)': 'Flush registration (flush_inbound_reg)',
  'Скинути': 'Flush',
  'Реєстрацію скинуто': 'Registration flushed',
  'Скинути реєстрацію {user}@{domain} (профіль {profile})? Пристрій буде змушений перереєструватись.':
    'Flush registration {user}@{domain} (profile {profile})? The device will have to re-register.',

  // CDR
  'збирається з моменту підключення': 'collected since connect',
  '⇩ Експорт CSV': '⇩ Export CSV',
  'Номер (від/кому)…': 'Number (from/to)…',
  'Всі напрямки': 'All directions',
  'Вхідні': 'Inbound',
  'Вихідні': 'Outbound',
  '✕ скинути': '✕ reset',
  'Збережено: {path}': 'Saved: {path}',
  'Початок': 'Start',
  'Розмова': 'Talk',
  'Причина': 'Cause',
  '→ вх': '→ in',
  '← вих': '← out',
  'Немає записів. CDR пишеться для дзвінків, що завершились після підключення GUI.':
    'No records. CDRs are written for calls that ended after the GUI connected.',
  'Деталі дзвінка': 'Call details',
  'Фільтр полів…': 'Filter fields…',

  // Events
  'Фільтр (назва, uuid, значення)…': 'Filter (name, uuid, value)…',
  'Всі події': 'All events',
  '⏸ Пауза': '⏸ Pause',
  '▶ Продовжити': '▶ Resume',
  '▶ Почати': '▶ Start',
  'Потік призупинено — натисніть «Почати», щоб отримувати події.':
    'Stream is paused — press “Start” to receive events.',
  'Очистити': 'Clear',
  'Очікування подій… Базова підписка активна; увімкніть «Всі події» для повного потоку.':
    'Waiting for events… Base subscription is active; enable “All events” for the full stream.',
  'Показані останні {shown}; у буфері {total} (макс {max}).': 'Showing last {shown}; {total} buffered (max {max}).',

  // Tracer
  'Номер призначення (точно)…': 'Destination number (exact)…',
  '▶ Ловити дзвінок': '▶ Catch a call',
  '■ Зупинити очікування': '■ Stop waiting',
  'очікую дзвінок на {n}…': 'waiting for a call to {n}…',
  'Вкажіть номер, натисніть «Ловити дзвінок» і зателефонуйте на нього.': 'Enter a number, press “Catch a call” and dial it.',
  'Кожен крок діалплану буде записано з часом виконання.': 'Every dialplan step will be recorded with its timing.',
  'кроків: {n}': 'steps: {n}',
  'завершено': 'finished',
  'триває': 'in progress',
  '⎘ Копіювати XML-extension': '⎘ Copy XML extension',
  '✓ Скопійовано': '✓ Copied',
  'завершено: ': 'finished: ',
  'Ще немає виконаних додатків…': 'No applications executed yet…',
  'Дані': 'Data',
  'Результат': 'Result',

  // Call Center
  'Агенти ({n})': 'Agents ({n})',
  'Подвійний клік — редагувати': 'Double-click to edit',
  'Черги ({n})': 'Queues ({n})',
  '+ Додати агента': '+ Add agent',
  'Немає агентів': 'No agents',
  'Агент': 'Agent',
  'Контакт': 'Contact',
  'Статус': 'Status',
  'Прийнято': 'Answered',
  'Пропущено': 'Missed',
  'Розмови': 'Talk time',
  'Видалити агента {name}? Його tiers буде втрачено.': 'Delete agent {name}? Their tiers will be lost.',
  'Новий агент': 'New agent',
  'Ім’я (наприклад 1000@default)': 'Name (e.g. 1000@default)',
  'Початковий статус': 'Initial status',
  'Створити': 'Create',
  'Немає черг. Черги описуються в callcenter.conf.xml на сервері.': 'No queues. Queues are defined in callcenter.conf.xml on the server.',
  'агентів: {n}': 'agents: {n}',
  'Оберіть чергу зліва': 'Select a queue on the left',
  'У черзі зараз': 'Currently in queue',
  'Черга порожня': 'Queue is empty',
  'чекає {t}': 'waiting {t}',
  'Агенти черги (tiers)': 'Queue agents (tiers)',
  'До черги не прив’язано агентів': 'No agents assigned to this queue',
  'Додати агента…': 'Add agent…',
  'Прибрати {agent} з черги {queue}?': 'Remove {agent} from queue {queue}?',
  '{h}г {m}хв': '{h}h {m}m',
  '{m}хв': '{m}m',
  '{n}с': '{n}s',
}

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  theme: Theme
  setTheme: (t: Theme) => void
}

const Ctx = createContext<I18n>({lang: 'uk', setLang: () => {}, theme: 'dark', setTheme: () => {}})

export function I18nProvider({children}: {children: ReactNode}) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('fsgui.lang') as Lang) || 'uk')
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('fsgui.theme') as Theme) || 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  const setLang = (l: Lang) => { localStorage.setItem('fsgui.lang', l); setLangState(l) }
  const setTheme = (t: Theme) => { localStorage.setItem('fsgui.theme', t); setThemeState(t) }

  return <Ctx.Provider value={{lang, setLang, theme, setTheme}}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  return useContext(Ctx)
}

// useT returns the translator: t('ukrainian source', {name: 'x'}).
// Placeholders {var} are substituted after lookup.
export function useT() {
  const {lang} = useContext(Ctx)
  return useCallback((key: string, vars?: Record<string, string | number>) => {
    let s = lang === 'uk' ? key : (en[key] ?? key)
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }, [lang])
}

export const locale = () => (localStorage.getItem('fsgui.lang') === 'en' ? 'en-GB' : 'uk-UA')
