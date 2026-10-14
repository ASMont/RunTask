const fs = require("fs");
const path = require("path");

const MODES = [
  { key: "ENTERPRISE", label: "Предприятие", detail: "Режим 1С:Предприятие, ключ ENTERPRISE" },
  { key: "DESIGNER", label: "Конфигуратор", detail: "Интерактивный конфигуратор, ключ DESIGNER" }
];

const DESIGNER_ACTIONS = [
  { key: "/DumpCfg", label: "Выгрузка конфигурации в CF", detail: "Ключ /DumpCfg. Сохраняет основную конфигурацию в файл cf", needsValue: true, valuePrompt: "Файл cf", valuePlaceholder: "C:\\export\\config.cf" },
  { key: "/LoadCfg", label: "Загрузка конфигурации из CF", detail: "Ключ /LoadCfg. Конфигурацию базы данных этим ключом не обновляет", needsValue: true, valuePrompt: "Файл cf", valuePlaceholder: "C:\\export\\config.cf" },
  { key: "/DumpDBCfg", label: "Выгрузка конфигурации базы данных в CF", detail: "Ключ /DumpDBCfg. Сохраняет конфигурацию базы данных в файл cf", needsValue: true, valuePrompt: "Файл cf", valuePlaceholder: "C:\\export\\db-config.cf" },
  { key: "/DumpConfigToFiles", label: "Выгрузка конфигурации в XML", detail: "Ключ /DumpConfigToFiles. Каталог файлов выгрузки", needsValue: true, valuePrompt: "Каталог XML", valuePlaceholder: "C:\\export\\xml" },
  { key: "/LoadConfigFromFiles", label: "Загрузка конфигурации из XML", detail: "Ключ /LoadConfigFromFiles. Каталог файлов выгрузки", needsValue: true, valuePrompt: "Каталог XML", valuePlaceholder: "C:\\export\\xml" },
  { key: "/UpdateDBCfg", label: "Обновление конфигурации базы данных", detail: "Ключ /UpdateDBCfg. Применяет основную конфигурацию к базе данных" },
  { key: "/DumpIB", label: "Выгрузка информационной базы в DT", detail: "Ключ /DumpIB. Полная выгрузка базы в файл dt", needsValue: true, valuePrompt: "Файл dt", valuePlaceholder: "C:\\export\\base.dt" },
  { key: "/RestoreIB", label: "Загрузка информационной базы из DT", detail: "Ключ /RestoreIB. Заменяет текущие данные базы", needsValue: true, valuePrompt: "Файл dt", valuePlaceholder: "C:\\export\\base.dt" },
  { key: "/RollbackCfg", label: "Возврат к конфигурации базы данных", detail: "Ключ /RollbackCfg. Заменяет основную конфигурацию на конфигурацию базы данных" },
  { key: "/UpdateCfg", label: "Обновление конфигурации из файла", detail: "Ключ /UpdateCfg. Файл поставки cf или cfu", needsValue: true, valuePrompt: "Файл cf или cfu", valuePlaceholder: "C:\\export\\update.cfu" },
  { key: "/CheckConfig", label: "Проверка конфигурации", detail: "Ключ /CheckConfig. Пакетная проверка, окно конфигуратора не остается открытым" },
  { key: "/CheckModules", label: "Проверка модулей", detail: "Ключ /CheckModules. Пакетная проверка модулей" },
  { key: "/DumpExternalDataProcessorOrReportToFiles", label: "Выгрузка обработки или отчета в XML", detail: "Ключ /DumpExternalDataProcessorOrReportToFiles", needsValue: true, valuePrompt: "Файл epf или erf", valuePlaceholder: "C:\\export\\report.erf", needsValue2: true, valuePrompt2: "Каталог XML", valuePlaceholder2: "C:\\export\\xml" },
  { key: "/LoadExternalDataProcessorOrReportFromFiles", label: "Загрузка обработки или отчета из XML", detail: "Ключ /LoadExternalDataProcessorOrReportFromFiles", needsValue: true, valuePrompt: "Каталог XML", valuePlaceholder: "C:\\export\\xml", needsValue2: true, valuePrompt2: "Файл epf или erf", valuePlaceholder2: "C:\\export\\report.erf" }
];

const CONNECTIONS = [
  { key: "/S", label: "/S", detail: "Серверная база: сервер/имя", needsValue: true, valuePrompt: "Сервер и имя базы", valuePlaceholder: "srv01/my_base" },
  { key: "/F", label: "/F", detail: "Файловая база: каталог", needsValue: true, valuePrompt: "Каталог файловой базы", valuePlaceholder: "C:\\Bases\\MyDB" },
  { key: "/IBName", label: "/IBName", detail: "Имя базы в списке запуска", needsValue: true, valuePrompt: "Имя базы в списке", valuePlaceholder: "Моя база" },
  { key: "/IBConnectionString", label: "/IBConnectionString", detail: "Полная строка соединения", needsValue: true, valuePrompt: "Строка соединения", valuePlaceholder: "Srvr=srv01;Ref=my_base;" },
  { key: "/WS", label: "/WS", detail: "База, опубликованная на веб-сервере", needsValue: true, valuePrompt: "Адрес публикации" }
];

const OPTIONS = [
  { key: "/N", detail: "Имя пользователя", needsValue: true, valuePrompt: "Имя пользователя" },
  { key: "/P", detail: "Пароль пользователя. Значение пишется в хранилище секретов Cursor, в task-menu.json остается secretId", needsValue: true, valuePrompt: "Пароль", secret: true },
  { key: "/WA-", detail: "Запретить аутентификацию Windows" },
  { key: "/WA+", detail: "Аутентификация Windows" },
  { key: "/AppAutoCheckVersion-", detail: "Не искать другую версию платформы" },
  { key: "/AppAutoCheckVersion+", detail: "Подбирать версию платформы" },
  { key: "/AppAutoCheckMode", detail: "Самому определять режим запуска" },
  { key: "/DisableStartupMessages", detail: "Не показывать стартовые сообщения" },
  { key: "/DisableStartupDialogs", detail: "Не показывать стартовые диалоги" },
  { key: "/DisableUnrecoverableErrorMessage", detail: "Не показывать окно критической ошибки" },
  { key: "/ClearCache", detail: "Очистить кэш клиента" },
  { key: "/UseHwLicenses+", detail: "Искать аппаратный ключ защиты" },
  { key: "/UseHwLicenses-", detail: "Не искать аппаратный ключ защиты" },
  { key: "/C", detail: "Параметр запуска, его читает конфигурация", needsValue: true, valuePrompt: "Текст параметра запуска" },
  { key: "/Execute", detail: "Открыть внешнюю обработку или отчет после старта", needsValue: true, valuePrompt: "Путь к epf или erf" },
  { key: "/URL", detail: "Открыть навигационную ссылку", needsValue: true, valuePrompt: "Ссылка", valuePlaceholder: "e1cib/navigationpoint/startpage" },
  { key: "/UC", detail: "Код доступа, если база заблокирована. Значение пишется в хранилище секретов Cursor, в task-menu.json остается secretId", needsValue: true, valuePrompt: "Код разрешения", secret: true },
  { key: "/L", detail: "Код языка интерфейса", needsValue: true, valuePrompt: "Код языка", valuePlaceholder: "ru" },
  { key: "/VL", detail: "Код локализации сеанса", needsValue: true, valuePrompt: "Код локализации", valuePlaceholder: "ru" },
  { key: "/O", detail: "Скорость соединения", needsValue: true, choices: ["Normal", "Low"] },
  { key: "/Out", detail: "Файл служебных сообщений", needsValue: true, valuePrompt: "Путь к файлу" },
  { key: "/T", detail: "Каталог временных файлов", needsValue: true, valuePrompt: "Каталог" },
  { key: "/RunModeManagedApplication", detail: "Запуск в управляемом приложении" },
  { key: "/RunModeOrdinaryApplication", detail: "Запуск в обычном приложении" },
  { key: "/Debug", detail: "Разрешить отладку" },
  { key: "/DebuggerURL", detail: "Адрес сервера отладки", needsValue: true, valuePrompt: "Адрес отладчика", valuePlaceholder: "http://localhost" },
  { key: "/TestManager", detail: "Режим менеджера тестирования" },
  { key: "/SAOnRestart", detail: "После перезапуска открыть базу от имени администратора" },
  { key: "/DisplayPerformance", detail: "Показывать показатели производительности" }
];

const CONFLICTS = [
  ["/WA+", "/WA-"],
  ["/AppAutoCheckVersion+", "/AppAutoCheckVersion-"],
  ["/UseHwLicenses+", "/UseHwLicenses-"],
  ["/RunModeManagedApplication", "/RunModeOrdinaryApplication"]
];

function catalog() {
  return MODES.concat(CONNECTIONS).concat(OPTIONS);
}

function matchKey(token, items) {
  const sorted = items.slice().sort((a, b) => b.key.length - a.key.length);
  const source = String(token || "");
  for (const item of sorted) {
    if (source.length < item.key.length) {
      continue;
    }
    if (source.slice(0, item.key.length).toLowerCase() !== item.key.toLowerCase()) {
      continue;
    }
    if (source.length === item.key.length) {
      return { item: item, glued: "" };
    }
    const next = source.charAt(item.key.length);
    if (!/[A-Za-z]/.test(next)) {
      return {
        item: item,
        glued: source.slice(item.key.length).replace(/^["']|["']$/g, "")
      };
    }
  }
  return null;
}

function isKeyLike(token) {
  const text = String(token || "");
  if (!text) {
    return false;
  }
  if (/^(ENTERPRISE|DESIGNER)$/i.test(text)) {
    return true;
  }
  return !!matchKey(text, CONNECTIONS.concat(OPTIONS).concat(DESIGNER_ACTIONS));
}

function unquote(value) {
  return String(value || "").replace(/^["']|["']$/g, "");
}

function parseArgs(command, args) {
  const tokens = Array.isArray(args) ? args.map((item) => String(item)) : [];
  const result = {
    client: /1cv8c\.exe$/i.test(String(command || "")) ? "thin" : "thick",
    mode: "ENTERPRISE",
    connection: null,
    action: null,
    options: [],
    extra: []
  };
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^ENTERPRISE$/i.test(token)) {
      result.mode = "ENTERPRISE";
      index += 1;
      continue;
    }
    if (/^DESIGNER$/i.test(token)) {
      result.mode = "DESIGNER";
      index += 1;
      continue;
    }
    const connection = matchKey(token, CONNECTIONS);
    if (connection) {
      const next = tokens[index + 1];
      if (connection.glued) {
        result.connection = { key: connection.item.key, value: connection.glued };
        index += 1;
      } else if (next && !isKeyLike(next)) {
        result.connection = { key: connection.item.key, value: unquote(next) };
        index += 2;
      } else {
        result.connection = { key: connection.item.key, value: "" };
        index += 1;
      }
      continue;
    }
    const action = matchKey(token, DESIGNER_ACTIONS);
    if (action) {
      result.mode = "DESIGNER";
      result.action = { key: action.item.key, value: "", value2: "" };
      let step = 1;
      if (action.item.needsValue && action.glued) {
        result.action.value = action.glued;
      } else if (action.item.needsValue && tokens[index + step] && !isKeyLike(tokens[index + step])) {
        result.action.value = unquote(tokens[index + step]);
        step += 1;
      }
      if (action.item.needsValue2 && tokens[index + step] && !isKeyLike(tokens[index + step])) {
        result.action.value2 = unquote(tokens[index + step]);
        step += 1;
      }
      index += step;
      continue;
    }
    const option = matchKey(token, OPTIONS);
    if (option) {
      const next = tokens[index + 1];
      if (option.item.needsValue && option.glued) {
        result.options.push({ key: option.item.key, value: option.glued });
        index += 1;
      } else if (option.item.needsValue && next && !isKeyLike(next)) {
        result.options.push({ key: option.item.key, value: unquote(next) });
        index += 2;
      } else {
        result.options.push({ key: option.item.key, value: "" });
        index += 1;
      }
      continue;
    }
    result.extra.push(token);
    index += 1;
  }
  return result;
}

function fromStored(run) {
  const parsed = {
    client: run.client === "thick" ? "thick" : "thin",
    mode: "ENTERPRISE",
    connection: null,
    action: null,
    options: [],
    extra: []
  };
  const keys = Array.isArray(run.keys) ? run.keys : [];
  keys.forEach((item) => {
    const key = item && item.key ? String(item.key) : "";
    const value = item && item.value ? String(item.value) : "";
    if (/^ENTERPRISE$/i.test(key)) {
      parsed.mode = "ENTERPRISE";
      return;
    }
    if (/^DESIGNER$/i.test(key)) {
      parsed.mode = "DESIGNER";
      return;
    }
    if (CONNECTIONS.some((connection) => connection.key.toLowerCase() === key.toLowerCase())) {
      parsed.connection = { key: key, value: value };
      return;
    }
    const action = DESIGNER_ACTIONS.find((item) => item.key.toLowerCase() === key.toLowerCase());
    if (action) {
      parsed.mode = "DESIGNER";
      parsed.action = {
        key: action.key,
        value: value,
        value2: item && item.value2 ? String(item.value2) : ""
      };
      return;
    }
    if (OPTIONS.some((option) => option.key.toLowerCase() === key.toLowerCase())) {
      const stored = { key: key, value: value };
      if (item && item.secretId) {
        stored.secretId = String(item.secretId);
      }
      parsed.options.push(stored);
      return;
    }
    if (key) {
      parsed.extra.push(value ? key + " " + value : key);
    }
  });
  return parsed;
}

function restore(run) {
  if (!run) {
    return null;
  }
  if (run.kind === "1c" && Array.isArray(run.keys) && run.keys.length) {
    const stored = fromStored(run);
    if (run.client === "thick" || run.client === "thin") {
      stored.client = run.client;
    }
    return stored;
  }
  const command = String(run.command || "");
  if (/1cv8c\.exe$/i.test(command) || /1cv8\.exe$/i.test(command)) {
    return parseArgs(command, run.args);
  }
  return null;
}

function optionByKey(key) {
  return OPTIONS.find((item) => item.key.toLowerCase() === String(key || "").toLowerCase());
}

function isSecretKey(key) {
  const known = optionByKey(key);
  return !!(known && known.secret);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripSecretToken(text, key, value) {
  if (!text || !value) {
    return text || "";
  }
  const pattern = new RegExp(escapeRegExp(key) + "\\s+" + escapeRegExp(value) + "(?=\\s|$)", "gi");
  return String(text).replace(pattern, key);
}

function stripSecretArg(args, key, value) {
  if (!Array.isArray(args) || !value) {
    return args;
  }
  const next = [];
  for (let index = 0; index < args.length; index++) {
    const sameKey = String(args[index]).toLowerCase() === String(key).toLowerCase();
    const sameValue = index + 1 < args.length && String(args[index + 1]) === String(value);
    if (sameKey && sameValue) {
      next.push(args[index]);
      index += 1;
      continue;
    }
    next.push(args[index]);
  }
  return next;
}

function walkEntries(entries, visit) {
  if (!Array.isArray(entries)) {
    return;
  }
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    visit(entry);
    walkEntries(entry.items, visit);
  });
}

function collectSecretIds(entry) {
  const ids = [];
  walkEntries([entry], (node) => {
    const keys = node.run && Array.isArray(node.run.keys) ? node.run.keys : [];
    keys.forEach((item) => {
      if (item && item.secretId && isSecretKey(item.key)) {
        ids.push(String(item.secretId));
      }
    });
  });
  return ids;
}

function takePlainSecrets(data, createId) {
  const secrets = [];
  let changed = false;
  walkEntries(data && data.entries, (entry) => {
    const run = entry.run;
    if (!run || !Array.isArray(run.keys)) {
      return;
    }
    run.keys.forEach((item) => {
      if (!item || !isSecretKey(item.key) || item.value === undefined || item.value === null || item.value === "") {
        return;
      }
      const value = String(item.value);
      if (!item.secretId) {
        if (typeof createId !== "function") {
          throw new Error("Нужен идентификатор секрета");
        }
        item.secretId = createId();
      }
      delete item.value;
      if (Array.isArray(run.args)) {
        run.args = stripSecretArg(run.args, item.key, value);
      }
      if (typeof entry.hint === "string") {
        entry.hint = stripSecretToken(entry.hint, item.key, value);
      }
      if (typeof entry.tooltip === "string") {
        entry.tooltip = stripSecretToken(entry.tooltip, item.key, value);
      }
      secrets.push({ secretId: String(item.secretId), value: value });
      changed = true;
    });
  });
  return { changed: changed, secrets: secrets };
}

function conflictText(selectedKeys) {
  const names = selectedKeys.map((key) => key.toLowerCase());
  for (const pair of CONFLICTS) {
    if (names.indexOf(pair[0].toLowerCase()) >= 0 && names.indexOf(pair[1].toLowerCase()) >= 0) {
      return "Ключи " + pair[0] + " и " + pair[1] + " вместе не используются. Оставьте один.";
    }
  }
  return "";
}

function buildLaunch(selection) {
  const platformMode = selection.action ? "DESIGNER" : selection.mode;
  const args = [platformMode];
  const keys = [{ key: platformMode }];
  if (selection.connection && selection.connection.key) {
    args.push(selection.connection.key, selection.connection.value);
    keys.push({ key: selection.connection.key, value: selection.connection.value });
  }
  if (selection.action && selection.action.key) {
    args.push(selection.action.key);
    const storedAction = { key: selection.action.key };
    if (selection.action.value) {
      args.push(selection.action.value);
      storedAction.value = selection.action.value;
    }
    if (selection.action.value2) {
      args.push(selection.action.value2);
      storedAction.value2 = selection.action.value2;
    }
    keys.push(storedAction);
  }
  (selection.options || []).forEach((option) => {
    args.push(option.key);
    if (isSecretKey(option.key)) {
      const stored = { key: option.key };
      if (option.secretId) {
        stored.secretId = option.secretId;
      }
      if (option.value) {
        stored.secretValue = option.value;
      }
      keys.push(stored);
      return;
    }
    keys.push(option.value ? { key: option.key, value: option.value } : { key: option.key });
    if (option.value) {
      args.push(option.value);
    }
  });
  (selection.extra || []).forEach((token) => {
    args.push(token);
    keys.push({ key: token });
  });
  const hintParts = [selection.mode];
  if (selection.connection && selection.connection.key) {
    hintParts.push(selection.connection.key + " " + selection.connection.value);
  }
  if (selection.action && selection.action.key) {
    hintParts.push(selection.action.key);
    if (selection.action.value) {
      hintParts.push(selection.action.value);
    }
    if (selection.action.value2) {
      hintParts.push(selection.action.value2);
    }
  }
  (selection.options || []).forEach((option) => {
    const known = optionByKey(option.key);
    if (known && known.secret) {
      hintParts.push(option.key);
      return;
    }
    hintParts.push(option.value ? option.key + " " + option.value : option.key);
  });
  (selection.extra || []).forEach((token) => hintParts.push(token));
  return {
    command: selection.exe,
    args: args,
    cwd: selection.cwd || "${workspaceFolder}",
    keys: keys,
    client: selection.client,
    hint: hintParts.join(" ")
  };
}

function findOnecExe(client, currentCommand, version) {
  const fileName = client === "thick" ? "1cv8.exe" : "1cv8c.exe";
  const roots = ["C:\\Program Files\\1cv8", "C:\\Program Files (x86)\\1cv8"];
  if (version) {
    for (const root of roots) {
      const preferred = path.join(root, version, "bin", fileName);
      if (fs.existsSync(preferred)) {
        return preferred;
      }
    }
  }
  if (currentCommand && path.basename(currentCommand).toLowerCase() === fileName.toLowerCase() && fs.existsSync(currentCommand)) {
    return currentCommand;
  }
  const found = [];
  roots.forEach((root) => {
    if (!fs.existsSync(root)) {
      return;
    }
    fs.readdirSync(root).forEach((dir) => {
      const exe = path.join(root, dir, "bin", fileName);
      if (fs.existsSync(exe)) {
        found.push(exe);
      }
    });
  });
  found.sort();
  found.reverse();
  return found[0] || "";
}

function readListText(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString("utf16le").replace(/^\uFEFF/, "");
  }
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseConnect(value) {
  const source = String(value || "");
  const server = /Srvr="([^"]*)"/i.exec(source);
  const ref = /Ref="([^"]*)"/i.exec(source);
  if (server && ref) {
    return { key: "/S", value: server[1] + "/" + ref[1] };
  }
  const file = /File="([^"]*)"/i.exec(source);
  if (file) {
    return { key: "/F", value: file[1] };
  }
  const web = /Ws="([^"]*)"/i.exec(source);
  if (web) {
    return { key: "/WS", value: web[1] };
  }
  return null;
}

function clientFromApp(app) {
  return /thick/i.test(String(app || "")) ? "thick" : "thin";
}

function loadStartupBases() {
  const appData = process.env.APPDATA || "";
  const candidates = [
    path.join(appData, "1C", "1CEStart", "ibases.v8i"),
    path.join(appData, "1C", "1Cv8", "ibases.v8i")
  ];
  const filePath = candidates.find((item) => item && fs.existsSync(item));
  if (!filePath) {
    return { filePath: candidates[0], bases: [] };
  }
  const lines = readListText(filePath).split(/\r?\n/);
  const bases = [];
  let current = null;
  const pushCurrent = () => {
    if (!current || !current.connectRaw) {
      return;
    }
    const connection = parseConnect(current.connectRaw);
    if (!connection) {
      return;
    }
    bases.push({
      name: current.name,
      folder: current.folder,
      order: current.order,
      app: current.app,
      version: current.version,
      client: clientFromApp(current.app),
      connection: connection,
      additionalParameters: current.additionalParameters
    });
  };
  lines.forEach((line) => {
    const trimmed = line.trim();
    const section = /^\[(.*)\]$/.exec(trimmed);
    if (section) {
      pushCurrent();
      current = {
        name: section[1],
        folder: "",
        order: 0,
        app: "Auto",
        version: "",
        connectRaw: "",
        additionalParameters: ""
      };
      return;
    }
    if (!current) {
      return;
    }
    const splitAt = trimmed.indexOf("=");
    if (splitAt < 0) {
      return;
    }
    const key = trimmed.slice(0, splitAt).trim();
    const value = trimmed.slice(splitAt + 1).trim();
    if (key === "Connect") {
      current.connectRaw = value;
    } else if (key === "OrderInTree") {
      current.order = parseFloat(value) || 0;
    } else if (key === "Folder") {
      current.folder = value.replace(/^\//, "").replace(/\//g, " / ");
    } else if (key === "App") {
      current.app = value;
    } else if (key === "DefaultVersion") {
      current.version = value;
    } else if (key === "AdditionalParameters") {
      current.additionalParameters = value;
    }
  });
  pushCurrent();
  bases.sort((a, b) => a.order - b.order);
  return { filePath: filePath, bases: bases };
}

function optionsFromText(text) {
  const tokens = ["ENTERPRISE"].concat(splitExtra(text));
  return parseArgs("1cv8c.exe", tokens).options;
}

function splitExtra(text) {
  const result = [];
  const source = String(text || "").trim();
  if (!source) {
    return result;
  }
  const pattern = /"([^"]*)"|(\S+)/g;
  let match = pattern.exec(source);
  while (match) {
    result.push(match[1] !== undefined ? match[1] : match[2]);
    match = pattern.exec(source);
  }
  return result;
}

module.exports = {
  MODES: MODES,
  DESIGNER_ACTIONS: DESIGNER_ACTIONS,
  CONNECTIONS: CONNECTIONS,
  OPTIONS: OPTIONS,
  optionByKey: optionByKey,
  isSecretKey: isSecretKey,
  collectSecretIds: collectSecretIds,
  takePlainSecrets: takePlainSecrets,
  conflictText: conflictText,
  restore: restore,
  buildLaunch: buildLaunch,
  findOnecExe: findOnecExe,
  splitExtra: splitExtra,
  loadStartupBases: loadStartupBases,
  optionsFromText: optionsFromText
};
