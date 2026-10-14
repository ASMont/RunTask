const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const onecKeys = require("./onec-keys");

const HAS_CONFIG = "projectTaskMenu.hasConfig";
const RUN_TASK_DIR = "RunTask";
const CONFIG_NAME = "task-menu.json";

const SUBMENU_ICON = "list-tree";
let secretStorage = null;
let movingSecrets = false;

function iconId(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim();
  if (!text) {
    return undefined;
  }
  const wrapped = /^\$\(([^)]+)\)$/.exec(text);
  return wrapped ? wrapped[1] : text;
}

function coloredTaskIcon(icon) {
  if (icon !== "play" && icon !== "tools") {
    return undefined;
  }
  const file = path.join(__dirname, "icons", icon + ".svg");
  if (!fs.existsSync(file)) {
    return undefined;
  }
  return vscode.Uri.file(file);
}

function submenuIcon(value, isSubmenu) {
  const icon = iconId(value);
  if (!isSubmenu) {
    return icon;
  }
  if (!icon || icon === "play") {
    return SUBMENU_ICON;
  }
  return icon;
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRunnable(entry) {
  if (!entry) {
    return false;
  }
  if (entry.run && asText(entry.run.command)) {
    return true;
  }
  return !!asText(entry.command);
}

class TaskItem extends vscode.TreeItem {
  constructor(entry, id, hasChildren) {
    const state = hasChildren
      ? (entry.expanded === false
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.Expanded)
      : vscode.TreeItemCollapsibleState.None;
    super(asText(entry.label) || "Без названия", state);
    this.id = id;
    this.entry = entry;
    const icon = submenuIcon(entry.icon, hasChildren);
    const picture = coloredTaskIcon(icon);
    if (picture) {
      this.iconPath = picture;
    } else if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
    const tooltip = asText(entry.tooltip);
    if (tooltip) {
      this.tooltip = tooltip;
    }
    const file = asText(entry.file).replace(/\\/g, "/");
    const hint = asText(entry.hint);
    if (file) {
      this.description = file;
    } else if (hint) {
      this.description = hint;
    }
    const note = file || hint;
    if (tooltip && note) {
      this.tooltip = tooltip + "\n" + note;
    }
    this.contextValue = Array.isArray(entry.items) ? "taskSubmenu" : "taskButton";
    this.entryPath = [];
    if (!hasChildren && isRunnable(entry)) {
      this.command = {
        command: "projectTaskMenu.run",
        title: this.label,
        arguments: [entry]
      };
    }
  }
}

class FileItem extends vscode.TreeItem {
  constructor(entry, id, folderPath) {
    const relative = asText(entry.path).replace(/\\/g, "/");
    super(relative || "Файл", vscode.TreeItemCollapsibleState.None);
    this.id = id;
    this.entry = entry;
    const absolute = path.resolve(folderPath, relative);
    const note = asText(entry.tooltip);
    this.description = note;
    this.tooltip = note ? absolute + "\n" + note : absolute;
    this.resourceUri = vscode.Uri.file(absolute);
    this.contextValue = "settingsFile";
    this.command = {
      command: "projectTaskMenu.openFile",
      title: relative,
      arguments: [absolute]
    };
  }
}

class TaskMenuProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChange.event;
    this.roots = [];
    this.title = "Запуск задач";
    this.error = "";
    this.hasConfig = false;
  }

  reload() {
    const loaded = readConfig();
    this.roots = loaded.roots;
    this.title = loaded.title;
    this.error = loaded.error;
    this.hasConfig = loaded.hasConfig;
    this._onDidChange.fire();
    return loaded;
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (this.error) {
      return element ? [] : [new vscode.TreeItem(this.error)];
    }
    if (!element) {
      return this.roots;
    }
    return element.children || [];
  }

  runnableEntries() {
    const result = [];
    const walk = (items, parentLabel) => {
      for (const item of items) {
        if (item.children && item.children.length) {
          walk(item.children, item.label);
          continue;
        }
        const entry = item.entry;
        if (!entry) {
          continue;
        }
        if (!isRunnable(entry)) {
          continue;
        }
        const file = asText(entry.file).replace(/\\/g, "/");
        result.push({
          label: parentLabel ? parentLabel + ": " + item.label : String(item.label),
          detail: file || asText(entry.tooltip),
          entry
        });
      }
    };
    walk(this.roots, "");
    return result;
  }

  menuItems() {
    const result = [];
    const walk = (items, parentLabel) => {
      for (const item of items) {
        if (item.contextValue !== "taskButton" && item.contextValue !== "taskSubmenu") {
          continue;
        }
        const label = parentLabel ? parentLabel + ": " + item.label : String(item.label);
        result.push({
          label: label,
          description: item.contextValue === "taskSubmenu" ? "подменю" : "кнопка",
          item: item
        });
        if (item.contextValue === "taskSubmenu" && item.children && item.children.length) {
          walk(item.children, label);
        }
      }
    };
    walk(this.roots, "");
    return result;
  }
}

function buildItems(entries, prefix, parentPath) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const basePath = parentPath || [];
  return entries.map((entry, index) => {
    const entryPath = basePath.concat(index);
    const isSubmenu = Array.isArray(entry && entry.items);
    const children = isSubmenu
      ? buildItems(entry.items, prefix + "." + index, entryPath)
      : [];
    const item = new TaskItem(entry || {}, prefix + "." + index, isSubmenu);
    item.entryPath = entryPath;
    item.children = children;
    return item;
  });
}

function buildFilesGroup(files, folderPath) {
  const list = Array.isArray(files) ? files : [];
  const children = list.map((entry, index) => {
    const file = typeof entry === "string" ? { path: entry } : (entry || {});
    return new FileItem(file, "file." + index, folderPath);
  });
  const group = new TaskItem({
    label: "Файлы расширения",
    icon: "files",
    tooltip: "Файлы расширения Запуск задач",
    expanded: true
  }, "files", children.length > 0);
  group.contextValue = "settingsFiles";
  group.command = undefined;
  group.entryPath = undefined;
  group.children = children;
  return group;
}

function readConfig() {
  const taskDir = projectRunTaskDir();
  if (!taskDir) {
    return { hasConfig: false, title: "Запуск задач", roots: [], error: "" };
  }
  const filePath = path.join(taskDir, CONFIG_NAME);
  if (!fs.existsSync(filePath)) {
    return { hasConfig: true, title: "Запуск задач", roots: [], error: "" };
  }
  try {
    let text = fs.readFileSync(filePath, "utf8");
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Корень файла должен быть объектом");
    }
    if (data.entries !== undefined && !Array.isArray(data.entries)) {
      throw new Error("Поле entries должно быть массивом");
    }
    if (data.files !== undefined && !Array.isArray(data.files)) {
      throw new Error("Поле files должно быть массивом");
    }
    const title = asText(data.title) || "Запуск задач";
    const roots = buildItems(data.entries || [], "item");
    const filesGroup = buildFilesGroup(data.files || [], taskDir);
    if (filesGroup.children.length) {
      roots.push(filesGroup);
    }
    return {
      hasConfig: true,
      title,
      roots,
      error: ""
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return {
      hasConfig: true,
      title: "Запуск задач",
      roots: [],
      error: "Ошибка в RunTask/task-menu.json: " + message
    };
  }
}

function workspaceFolder() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders[0];
}

function projectRunTaskDir() {
  const folder = workspaceFolder();
  if (!folder) {
    return "";
  }
  return path.join(folder.uri.fsPath, RUN_TASK_DIR);
}

function expandVars(text, folderPath) {
  const folderName = path.basename(folderPath);
  return String(text)
    .replace(/\$\{workspaceFolder\}/g, folderPath)
    .replace(/\$\{workspaceFolderBasename\}/g, folderName);
}

function secretStorageKey(id) {
  return "runtask:" + id;
}

async function forgetSecretIds(ids) {
  if (!secretStorage) {
    return;
  }
  for (const id of ids) {
    await secretStorage.delete(secretStorageKey(id));
  }
}

async function hydrateSecretOptions(options) {
  if (!secretStorage || !Array.isArray(options)) {
    return;
  }
  for (const option of options) {
    if (!option || !onecKeys.isSecretKey(option.key) || option.value || !option.secretId) {
      continue;
    }
    const value = await secretStorage.get(secretStorageKey(option.secretId));
    if (value) {
      option.value = value;
    }
  }
}

async function sealLaunchSecrets(launch, previousRun) {
  if (!secretStorage) {
    throw new Error("Хранилище секретов Cursor недоступно");
  }
  const previous = [];
  const previousKeys = previousRun && Array.isArray(previousRun.keys) ? previousRun.keys : [];
  previousKeys.forEach((item) => {
    if (item && item.secretId && onecKeys.isSecretKey(item.key)) {
      previous.push({ key: String(item.key).toLowerCase(), secretId: String(item.secretId) });
    }
  });
  const used = new Set();
  const sealed = [];
  (launch.keys || []).forEach((item) => {
    if (!item || !onecKeys.isSecretKey(item.key)) {
      return;
    }
    const value = item.secretValue ? String(item.secretValue) : "";
    if (!value) {
      throw new Error("Нужно значение для " + item.key);
    }
    let id = item.secretId ? String(item.secretId) : "";
    if (!id) {
      const prevIndex = previous.findIndex((prev) => prev.key === String(item.key).toLowerCase() && !used.has(prev.secretId));
      id = prevIndex >= 0 ? previous[prevIndex].secretId : crypto.randomUUID();
    }
    used.add(id);
    sealed.push({ item: item, id: id, value: value });
  });
  for (const row of sealed) {
    await secretStorage.store(secretStorageKey(row.id), row.value);
    row.item.secretId = row.id;
    delete row.item.secretValue;
    delete row.item.value;
  }
}

async function movePlainSecretsNow() {
  if (!secretStorage) {
    return;
  }
  const filePath = configFilePath();
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  let file;
  try {
    file = loadConfigFile();
  } catch (error) {
    return;
  }
  const plan = onecKeys.takePlainSecrets(file.data, () => crypto.randomUUID());
  if (!plan.changed) {
    return;
  }
  for (const item of plan.secrets) {
    await secretStorage.store(secretStorageKey(item.secretId), item.value);
  }
  saveConfigFile(file);
}

async function argsWithSecrets(run, folderPath) {
  const source = Array.isArray(run.args) ? run.args.map((arg) => String(arg)) : [];
  if (run.kind !== "1c" || !Array.isArray(run.keys)) {
    return source.map((arg) => expandVars(arg, folderPath));
  }
  const pending = run.keys.filter((item) => item && onecKeys.isSecretKey(item.key));
  const resolved = [];
  let cursor = 0;
  for (let index = 0; index < source.length; index++) {
    const token = source[index];
    resolved.push(expandVars(token, folderPath));
    if (!onecKeys.isSecretKey(token)) {
      continue;
    }
    const spec = pending[cursor];
    cursor += 1;
    if (!spec) {
      throw new Error("Ключ " + token + " не описан в keys");
    }
    if (!spec.secretId) {
      continue;
    }
    if (!secretStorage) {
      throw new Error("Хранилище секретов Cursor недоступно");
    }
    const value = await secretStorage.get(secretStorageKey(spec.secretId));
    if (!value) {
      throw new Error("Значение " + token + " не найдено в хранилище секретов Cursor. Откройте кнопку и введите его снова.");
    }
    if (source[index + 1] !== undefined && source[index + 1] === value) {
      continue;
    }
    resolved.push(value);
  }
  return resolved;
}

async function runProcess(entry, folder) {
  const run = entry.run || {};
  const command = expandVars(asText(run.command), folder.uri.fsPath);
  if (!command) {
    vscode.window.showErrorMessage("У пункта нет команды запуска: " + asText(entry.label));
    return;
  }
  let args;
  try {
    args = await argsWithSecrets(run, folder.uri.fsPath);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showErrorMessage(message);
    return;
  }
  const cwd = asText(run.cwd)
    ? expandVars(run.cwd, folder.uri.fsPath)
    : folder.uri.fsPath;
  const file = asText(entry.file);
  if (file && !fs.existsSync(path.resolve(folder.uri.fsPath, file))) {
    vscode.window.showErrorMessage("Файл не найден: " + file);
    return;
  }
  const execution = new vscode.ProcessExecution(command, args, { cwd });
  const task = new vscode.Task(
    { type: "projectTaskMenu" },
    folder,
    asText(entry.label) || command,
    "Список задач",
    execution,
    []
  );
  task.presentationOptions = {
    echo: false,
    reveal: vscode.TaskRevealKind.Silent,
    focus: false,
    panel: vscode.TaskPanelKind.Shared,
    showReuseMessage: false,
    close: true
  };
  await vscode.tasks.executeTask(task);
}

function colorThemes() {
  const byId = new Map();
  vscode.extensions.all.forEach((extension) => {
    const themes = extension.packageJSON
      && extension.packageJSON.contributes
      && extension.packageJSON.contributes.themes;
    if (!Array.isArray(themes)) {
      return;
    }
    themes.forEach((theme) => {
      const label = theme && typeof theme.label === "string" ? theme.label.trim() : "";
      const rawId = theme && typeof theme.id === "string" ? theme.id.trim() : "";
      const id = rawId || label;
      const shown = label && label.charAt(0) !== "%" ? label : id;
      if (!id || id.charAt(0) === "%" || byId.has(id)) {
        return;
      }
      byId.set(id, { id: id, label: shown });
    });
  });
  return Array.from(byId.values()).sort((left, right) => left.label.localeCompare(right.label, "ru"));
}

async function cycleColorTheme() {
  const themes = colorThemes();
  if (!themes.length) {
    vscode.window.showErrorMessage("Не найдены цветовые темы");
    return;
  }
  const current = vscode.workspace.getConfiguration("workbench").get("colorTheme");
  const index = typeof current === "string"
    ? themes.findIndex((theme) => theme.id === current || theme.label === current)
    : -1;
  const next = themes[(index + 1) % themes.length];
  try {
    await vscode.workspace.getConfiguration("workbench").update(
      "colorTheme",
      next.id,
      vscode.ConfigurationTarget.Workspace
    );
    await vscode.workspace.getConfiguration("window").update(
      "autoDetectColorScheme",
      false,
      vscode.ConfigurationTarget.Workspace
    );
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showErrorMessage("Не удалось сменить тему: " + message);
    return;
  }
  vscode.window.setStatusBarMessage("Тема: " + next.label, 4000);
}

async function runEntry(entry) {
  if (!entry) {
    return;
  }
  if (entry.run && asText(entry.run.command)) {
    const folder = workspaceFolder();
    if (!folder) {
      vscode.window.showErrorMessage("Нет открытой папки проекта");
      return;
    }
    await runProcess(entry, folder);
    return;
  }
  const command = asText(entry.command);
  if (command) {
    await vscode.commands.executeCommand(command);
    return;
  }
  vscode.window.showErrorMessage("У пункта нет команды запуска: " + asText(entry.label));
}

async function openFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    vscode.window.showErrorMessage("Файл не найден: " + (filePath || ""));
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: false });
}

function configFilePath() {
  const taskDir = projectRunTaskDir();
  if (!taskDir) {
    return "";
  }
  return path.join(taskDir, CONFIG_NAME);
}

function loadConfigFile() {
  const filePath = configFilePath();
  if (!filePath) {
    throw new Error("Нет открытой папки проекта");
  }
  if (!fs.existsSync(filePath)) {
    return {
      filePath: filePath,
      newline: "\r\n",
      hasBom: false,
      data: {
        title: "Запуск задач",
        files: [
          {
            path: CONFIG_NAME,
            tooltip: "Список задач и настройки этой панели"
          }
        ],
        entries: []
      }
    };
  }
  const bytes = fs.readFileSync(filePath);
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let text = bytes.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Корень файла должен быть объектом");
  }
  if (!Array.isArray(data.entries)) {
    data.entries = [];
  }
  if (data.files !== undefined && !Array.isArray(data.files)) {
    throw new Error("Поле files должно быть массивом");
  }
  return {
    filePath: filePath,
    newline: text.indexOf("\r\n") >= 0 ? "\r\n" : "\n",
    hasBom: hasBom,
    data: data
  };
}

function saveConfigFile(file) {
  fs.mkdirSync(path.dirname(file.filePath), { recursive: true });
  let text = JSON.stringify(file.data, null, 2);
  if (file.newline !== "\n") {
    text = text.replace(/\n/g, file.newline);
  }
  text += file.newline;
  if (file.hasBom) {
    text = "\uFEFF" + text;
  }
  fs.writeFileSync(file.filePath, text, "utf8");
}

function nodeAt(data, indexPath) {
  let list = data.entries;
  let node = null;
  for (let i = 0; i < indexPath.length; i++) {
    const index = indexPath[i];
    if (!Array.isArray(list) || !Number.isInteger(index) || index < 0 || index >= list.length) {
      return null;
    }
    node = list[index];
    list = node && node.items;
  }
  return node;
}

function listAt(data, parentPath) {
  if (!parentPath.length) {
    if (!Array.isArray(data.entries)) {
      data.entries = [];
    }
    return data.entries;
  }
  const parent = nodeAt(data, parentPath);
  if (!parent || !Array.isArray(parent.items)) {
    return null;
  }
  return parent.items;
}

function setOptional(target, key, value) {
  const text = asText(value);
  if (text) {
    target[key] = text;
  } else {
    delete target[key];
  }
}

function formatArgs(args) {
  return Array.isArray(args) ? args.map((arg) => String(arg)).join(" ;; ") : "";
}

function parseArgs(text) {
  const source = asText(text);
  if (!source) {
    return [];
  }
  return source.split(";;").map((part) => part.trim()).filter(Boolean);
}

function rememberFile(data, filePath, note) {
  const relative = asText(filePath).replace(/\\/g, "/");
  if (!relative) {
    return;
  }
  if (!Array.isArray(data.files)) {
    data.files = [];
  }
  const exists = data.files.some((file) => {
    const current = typeof file === "string" ? file : file && file.path;
    return asText(current).replace(/\\/g, "/") === relative;
  });
  if (!exists) {
    data.files.push({ path: relative, tooltip: asText(note) || relative });
  }
}

async function askText(title, prompt, value, placeholder) {
  return vscode.window.showInputBox({
    title: title,
    prompt: prompt,
    value: value || "",
    placeHolder: placeholder || "",
    ignoreFocusOut: true
  });
}

async function askTaskType(title, current) {
  const editorMode = !!(current && asText(current.command) && !(current.run && asText(current.run.command)));
  const onecMode = !!(current && current.run && (current.run.kind === "1c" || /1cv8c?\.exe$/i.test(asText(current.run.command))));
  const firstMode = onecMode ? "1c" : (editorMode ? "editor" : (current && current.run ? "process" : "1c"));
  const catalog = [
    { label: "Запуск 1С", description: "База из списка запуска, режим и ключи", value: "1c" },
    { label: "Программа", description: "Команда и аргументы", value: "process" },
    { label: "Команда редактора", description: "Идентификатор команды", value: "editor" }
  ];
  const items = [catalog.find((item) => item.value === firstMode)].concat(
    catalog.filter((item) => item.value !== firstMode)
  );
  const currentLabel = items[0] && items[0].label;
  return vscode.window.showQuickPick(items, {
    title: title,
    placeHolder: current ? "Сейчас: " + currentLabel : "Какой тип задачи добавить",
    ignoreFocusOut: true,
    matchOnDescription: true
  });
}

async function askNameFields(title, current, defaults) {
  const preset = defaults || {};
  const label = await askText(title, "Название", (current && current.label) || preset.label, preset.label || "Задача");
  if (label === undefined) {
    return null;
  }
  if (!asText(label)) {
    vscode.window.showErrorMessage("Нужно название кнопки");
    return null;
  }
  const tooltip = await askText(title, "Подсказка. Пустое поле ее убирает", current ? current.tooltip : preset.tooltip);
  if (tooltip === undefined) {
    return null;
  }
  const icon = await askText(
    title,
    "Значок Codicon, например play. Пустое поле его убирает",
    (current && current.icon) || preset.icon,
    "play"
  );
  if (icon === undefined) {
    return null;
  }
  return { label: asText(label), tooltip: tooltip, icon: icon };
}

async function askButtonFields(current) {
  const title = current ? "Изменить кнопку" : "Новая задача";
  const mode = await askTaskType(title, current);
  if (!mode) {
    return null;
  }
  if (mode.value === "1c") {
    const launch = await askOnecLaunch(title, current);
    if (!launch) {
      return null;
    }
    const names = await askNameFields(title, current, {
      label: launch.baseName + " (" + launch.modeLabel + ")",
      tooltip: launch.hint,
      icon: launch.mode === "ENTERPRISE" ? "play" : "tools"
    });
    if (!names) {
      return null;
    }
    return {
      kind: "button",
      label: names.label,
      tooltip: names.tooltip,
      icon: names.icon,
      file: "",
      launch: "1c",
      command: launch.command,
      args: launch.args,
      cwd: launch.cwd,
      client: launch.client,
      keys: launch.keys,
      hint: launch.hint,
      baseName: launch.baseName
    };
  }
  const names = await askNameFields(title, current, { label: "", tooltip: "", icon: "play" });
  if (!names) {
    return null;
  }
  const file = await askText(
    title,
    "Файл рядом с кнопкой. Пустое поле его убирает",
    current && current.file,
    ""
  );
  if (file === undefined) {
    return null;
  }
  if (mode.value === "editor") {
    const command = await askText(
      title,
      "Идентификатор команды редактора",
      current && current.command,
      "workbench.action.toggleLightDarkThemes"
    );
    if (command === undefined) {
      return null;
    }
    if (!asText(command)) {
      vscode.window.showErrorMessage("Нужен идентификатор команды");
      return null;
    }
    return {
      kind: "button",
      label: names.label,
      tooltip: names.tooltip,
      icon: names.icon,
      file: file,
      launch: "editor",
      command: asText(command)
    };
  }
  const command = await askText(
    title,
    "Программа",
    current && current.run && current.run.command,
    "powershell.exe"
  );
  if (command === undefined) {
    return null;
  }
  if (!asText(command)) {
    vscode.window.showErrorMessage("Нужна программа для запуска");
    return null;
  }
  const args = await askText(
    title,
    "Аргументы через ;;",
    formatArgs(current && current.run && current.run.args),
    "-NoProfile ;; -ExecutionPolicy ;; Bypass"
  );
  if (args === undefined) {
    return null;
  }
  const cwd = await askText(
    title,
    "Рабочий каталог",
    (current && current.run && current.run.cwd) || "${workspaceFolder}",
    "${workspaceFolder}"
  );
  if (cwd === undefined) {
    return null;
  }
  return {
    kind: "button",
    label: names.label,
    tooltip: names.tooltip,
    icon: names.icon,
    file: file,
    launch: "process",
    command: asText(command),
    args: parseArgs(args),
    cwd: asText(cwd) || "${workspaceFolder}"
  };
}

async function askSubmenuFields(current) {
  const title = current ? "Изменить подменю" : "Новое подменю";
  const label = await askText(title, "Название", current && current.label, "Запуск 1с");
  if (label === undefined) {
    return null;
  }
  if (!asText(label)) {
    vscode.window.showErrorMessage("Нужно название подменю");
    return null;
  }
  const tooltip = await askText(title, "Подсказка. Пустое поле ее убирает", current && current.tooltip);
  if (tooltip === undefined) {
    return null;
  }
  const storedIcon = current && iconId(current.icon);
  const icon = await askText(
    title,
    "Значок Codicon, например list-tree. Пустое поле ставит значок подменю",
    storedIcon && storedIcon !== "play" ? storedIcon : SUBMENU_ICON,
    SUBMENU_ICON
  );
  if (icon === undefined) {
    return null;
  }
  const collapsed = current && current.expanded === false;
  const expanded = await vscode.window.showQuickPick(
    collapsed
      ? [
        { label: "Свернуто", value: false },
        { label: "Развернуто", value: true }
      ]
      : [
        { label: "Развернуто", value: true },
        { label: "Свернуто", value: false }
      ],
    { title: title, placeHolder: "Как открывать подменю", ignoreFocusOut: true }
  );
  if (!expanded) {
    return null;
  }
  return {
    kind: "submenu",
    label: asText(label),
    tooltip: tooltip,
    icon: icon,
    expanded: expanded.value
  };
}

function applyButton(node, fields) {
  node.label = fields.label;
  setOptional(node, "tooltip", fields.tooltip);
  setOptional(node, "icon", fields.icon);
  setOptional(node, "file", fields.file);
  if (fields.launch === "editor") {
    delete node.run;
    delete node.hint;
    node.command = fields.command;
    return;
  }
  delete node.command;
  if (fields.launch === "1c") {
    (fields.keys || []).forEach((item) => {
      if (item && (item.secretValue || (onecKeys.isSecretKey(item.key) && item.value))) {
        throw new Error("Секрет " + item.key + " не записан в хранилище");
      }
    });
    node.hint = fields.hint;
    node.run = {
      kind: "1c",
      client: fields.client,
      command: fields.command,
      args: fields.args,
      cwd: fields.cwd,
      keys: fields.keys,
      baseName: fields.baseName || ""
    };
    return;
  }
  delete node.hint;
  node.run = {
    command: fields.command,
    args: fields.args,
    cwd: fields.cwd
  };
}

async function askChoice(title, placeHolder, items) {
  return vscode.window.showQuickPick(items, {
    title: title,
    placeHolder: placeHolder,
    ignoreFocusOut: true,
    matchOnDescription: true
  });
}

async function askOnecValue(title, option, currentValue) {
  const current = asText(currentValue);
  if (option.choices && option.choices.length) {
    const ordered = [];
    if (current && option.choices.indexOf(current) >= 0) {
      ordered.push(current);
    }
    option.choices.forEach((choice) => {
      if (choice !== current) {
        ordered.push(choice);
      }
    });
    const picked = await askChoice(
      title,
      current ? "Сейчас: " + current : option.detail,
      ordered.map((choice) => ({
        label: choice,
        value: choice
      }))
    );
    return picked ? picked.value : undefined;
  }
  const prompt = option.valuePrompt || option.detail;
  let promptText = prompt;
  if (option.secret && current) {
    promptText = prompt + ". Пустое поле оставляет сохраненное значение";
  } else if (option.secret && !current) {
    promptText = prompt + ". На этом компьютере сохраненного значения нет";
  } else if (current) {
    promptText = prompt + ". Сейчас подставлено текущее значение";
  }
  const value = await vscode.window.showInputBox({
    title: title,
    prompt: promptText,
    placeHolder: option.valuePlaceholder || "",
    value: current,
    password: !!option.secret,
    ignoreFocusOut: true
  });
  return value;
}

function sameConnection(left, right) {
  if (!left || !right) {
    return false;
  }
  if (String(left.key).toLowerCase() !== String(right.key).toLowerCase()) {
    return false;
  }
  const normalize = (value) => String(value || "").replace(/\//g, "\\").toLowerCase();
  return normalize(left.value) === normalize(right.value);
}

function commandMatchesClient(command, client) {
  const fileName = path.basename(asText(command)).toLowerCase();
  return client === "thick" ? fileName === "1cv8.exe" : fileName === "1cv8c.exe";
}

function editingOnecLaunch(current) {
  return !!(current && current.run && (current.run.kind === "1c" || /1cv8c?\.exe$/i.test(asText(current.run.command))));
}

function presetForLaunch(editingLaunch, saved, base, batch) {
  if (!editingLaunch) {
    return defaultLaunchOptions(base, batch);
  }
  const preset = (saved.options || []).slice();
  if (!batch) {
    return preset;
  }
  if (!preset.some((item) => item.key.toLowerCase() === "/disablestartupdialogs")) {
    preset.push({ key: "/DisableStartupDialogs", value: "" });
  }
  if (!preset.some((item) => item.key.toLowerCase() === "/out")) {
    preset.push({ key: "/Out", value: "${workspaceFolder}\\1c-designer.log" });
  }
  return preset;
}

function optionLine(item, previous) {
  if (!previous) {
    return item.detail;
  }
  if (item.secret && (previous.value || previous.secretId)) {
    return item.detail + ". Сейчас значение сохранено";
  }
  if (previous.value) {
    return item.detail + ". Сейчас: " + previous.value;
  }
  return item.detail + ". Сейчас включен";
}

function savedBaseRecord(saved, savedName) {
  if (!saved.connection || !saved.connection.key || !saved.connection.value) {
    return null;
  }
  return {
    name: savedName || (saved.connection.key + " " + saved.connection.value),
    folder: "",
    order: -1,
    version: "",
    client: saved.client === "thick" ? "thick" : "thin",
    connection: { key: saved.connection.key, value: saved.connection.value },
    additionalParameters: ""
  };
}

function defaultLaunchOptions(base, batch) {
  const options = onecKeys.optionsFromText(base.additionalParameters).slice();
  if (!batch) {
    return options;
  }
  if (!options.some((item) => item.key.toLowerCase() === "/disablestartupdialogs")) {
    options.push({ key: "/DisableStartupDialogs", value: "" });
  }
  if (!options.some((item) => item.key.toLowerCase() === "/out")) {
    options.push({ key: "/Out", value: "${workspaceFolder}\\1c-designer.log" });
  }
  return options;
}

async function askOnecLaunch(title, current) {
  const saved = onecKeys.restore(current && current.run) || {
    client: "thin",
    mode: "ENTERPRISE",
    connection: null,
    options: [],
    extra: []
  };
  await hydrateSecretOptions(saved.options);
  const editingLaunch = editingOnecLaunch(current);
  const list = onecKeys.loadStartupBases();
  const savedName = current && current.run && current.run.baseName;
  const remembered = editingLaunch ? savedBaseRecord(saved, savedName) : null;
  if (!list.bases.length && !remembered) {
    vscode.window.showErrorMessage("Не найден список баз 1С: " + list.filePath);
    return null;
  }
  const baseItems = list.bases.map((base) => ({
    label: base.name,
    description: base.connection.value,
    detail: base.folder || undefined,
    base: base
  }));
  const rank = (item) => {
    if (savedName && item.base.name === savedName) {
      return 0;
    }
    if (sameConnection(item.base.connection, saved.connection)) {
      return 1;
    }
    return 2;
  };
  baseItems.sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff) {
      return diff;
    }
    return a.base.order - b.base.order;
  });
  if (remembered && (!baseItems.length || rank(baseItems[0]) === 2)) {
    baseItems.unshift({
      label: remembered.name,
      description: remembered.connection.value,
      detail: "Текущее подключение кнопки",
      base: remembered
    });
  } else if (baseItems.length && rank(baseItems[0]) < 2) {
    const note = baseItems[0].detail ? baseItems[0].detail + ". " : "";
    baseItems[0].detail = note + "Текущая база кнопки";
  }
  const basePlace = baseItems.length && (rank(baseItems[0]) < 2 || (remembered && baseItems[0].base === remembered))
    ? "Сейчас: " + baseItems[0].label
    : "База из списка запуска 1С";
  const basePick = await vscode.window.showQuickPick(baseItems, {
    title: title,
    placeHolder: basePlace,
    ignoreFocusOut: true,
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!basePick) {
    return null;
  }
  const base = basePick.base;
  const modeItems = onecKeys.MODES.map((mode) => ({
    label: mode.label,
    description: mode.detail,
    value: mode.key,
    action: null
  })).concat(onecKeys.DESIGNER_ACTIONS.map((action) => ({
    label: action.label,
    description: action.detail,
    value: "DESIGNER",
    action: action
  })));
  const preferred = saved.action
    ? modeItems.find((item) => item.action && item.action.key === saved.action.key)
    : modeItems.find((item) => !item.action && item.value === saved.mode);
  if (preferred) {
    const rest = modeItems.filter((item) => item !== preferred);
    modeItems.splice(0, modeItems.length, preferred);
    rest.forEach((item) => modeItems.push(item));
  }
  const modePick = await askChoice(
    title,
    preferred ? "Сейчас: " + preferred.label : "Режим запуска",
    modeItems
  );
  if (!modePick) {
    return null;
  }
  let action = null;
  if (modePick.action && modePick.action.needsValue) {
    const previous = saved.action && saved.action.key === modePick.action.key ? saved.action.value : "";
    const value = await askOnecValue(title, modePick.action, previous);
    if (value === undefined) {
      return null;
    }
    if (!asText(value)) {
      vscode.window.showErrorMessage("Нужно значение для " + modePick.action.key);
      return null;
    }
    action = { key: modePick.action.key, value: asText(value), value2: "" };
    if (modePick.action.needsValue2) {
      const previous2 = saved.action && saved.action.key === modePick.action.key ? saved.action.value2 : "";
      const value2 = await askText(title, modePick.action.valuePrompt2, previous2, modePick.action.valuePlaceholder2);
      if (value2 === undefined) {
        return null;
      }
      if (!asText(value2)) {
        vscode.window.showErrorMessage("Нужно второе значение для " + modePick.action.key);
        return null;
      }
      action.value2 = asText(value2);
    }
  } else if (modePick.action) {
    action = { key: modePick.action.key, value: "", value2: "" };
  }
  const preset = presetForLaunch(editingLaunch, saved, base, !!modePick.action);
  const selected = new Set(preset.map((item) => item.key.toLowerCase()));
  let optionPick = null;
  while (!optionPick) {
    const optionItems = onecKeys.OPTIONS.map((item) => {
      const previous = preset.find((option) => option.key.toLowerCase() === item.key.toLowerCase());
      const picked = selected.has(item.key.toLowerCase());
      return {
        label: item.key,
        description: optionLine(item, picked ? previous : null),
        option: item,
        picked: picked
      };
    });
    optionItems.sort((a, b) => Number(b.picked) - Number(a.picked));
    const picked = await vscode.window.showQuickPick(optionItems, {
      title: title,
      placeHolder: editingLaunch
        ? "Ключи запуска. Отмечены текущие. Пробел меняет отметку, Enter продолжает"
        : "Ключи запуска. Пробел отмечает ключ, Enter подтверждает",
      canPickMany: true,
      ignoreFocusOut: true,
      matchOnDescription: true
    });
    if (!picked) {
      return null;
    }
    const names = picked.map((item) => item.option.key);
    const conflict = onecKeys.conflictText(names);
    if (conflict) {
      vscode.window.showErrorMessage(conflict);
      selected.clear();
      names.forEach((name) => selected.add(name.toLowerCase()));
      continue;
    }
    optionPick = picked;
  }
  const options = [];
  for (const item of optionPick) {
    const previous = preset.find((option) => option.key.toLowerCase() === item.option.key.toLowerCase());
    if (!item.option.needsValue) {
      options.push({ key: item.option.key, value: "" });
      continue;
    }
    const value = await askOnecValue(title, item.option, previous && previous.value);
    if (value === undefined) {
      return null;
    }
    let text = asText(value);
    if (!text && item.option.secret && previous && previous.value) {
      text = previous.value;
    }
    if (!text) {
      vscode.window.showErrorMessage("Нужно значение для " + item.option.key);
      return null;
    }
    const storedOption = { key: item.option.key, value: text };
    if (previous && previous.secretId) {
      storedOption.secretId = previous.secretId;
    }
    options.push(storedOption);
  }
  const extraText = await askText(
    title,
    saved.extra.length
      ? "Дополнительные ключи через пробел. Сейчас подставлены текущие. Пустое поле их убирает"
      : "Дополнительные ключи через пробел. Пустое поле их не добавляет",
    saved.extra.join(" ")
  );
  if (extraText === undefined) {
    return null;
  }
  const client = modePick.value === "ENTERPRISE" ? base.client : "thick";
  const currentCommand = current && current.run && current.run.command;
  let exe = commandMatchesClient(currentCommand, client) && fs.existsSync(currentCommand)
    ? currentCommand
    : onecKeys.findOnecExe(client, currentCommand, base.version);
  const fallbackExe = client === "thick"
    ? "C:\\Program Files\\1cv8\\8.3.27.2342\\bin\\1cv8.exe"
    : "C:\\Program Files\\1cv8\\8.3.27.2342\\bin\\1cv8c.exe";
  if (!exe) {
    const typed = await askText(title, "Не найден клиент 1С. Укажите путь к exe", currentCommand || "", fallbackExe);
    if (typed === undefined) {
      return null;
    }
    exe = asText(typed);
  }
  if (!exe || !fs.existsSync(exe)) {
    vscode.window.showErrorMessage("Файл клиента 1С не найден: " + (exe || ""));
    return null;
  }
  const launch = onecKeys.buildLaunch({
    client: client,
    exe: exe,
    mode: modePick.value,
    action: action,
    connection: base.connection,
    options: options,
    extra: onecKeys.splitExtra(extraText),
    cwd: "${workspaceFolder}"
  });
  launch.baseName = base.name;
  launch.mode = modePick.value;
  launch.modeLabel = modePick.label;
  return launch;
}

function applySubmenu(node, fields) {
  node.label = fields.label;
  setOptional(node, "tooltip", fields.tooltip);
  setOptional(node, "icon", submenuIcon(fields.icon, true));
  node.expanded = fields.expanded !== false;
  if (!Array.isArray(node.items)) {
    node.items = [];
  }
}

function submenuPath(item) {
  if (item && item.contextValue === "taskSubmenu" && Array.isArray(item.entryPath)) {
    return item.entryPath;
  }
  return [];
}

function sameLabel(node, item) {
  return !!node && asText(node.label) === asText(item && item.entry && item.entry.label);
}

async function withConfig(action) {
  if (!workspaceFolder()) {
    vscode.window.showErrorMessage("Нет открытой папки проекта");
    return false;
  }
  let file;
  try {
    file = loadConfigFile();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showErrorMessage("Ошибка в RunTask/task-menu.json: " + message);
    return;
  }
  let changed = false;
  try {
    changed = await action(file.data);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showErrorMessage("Не удалось изменить список: " + message);
    return false;
  }
  if (!changed) {
    return false;
  }
  try {
    saveConfigFile(file);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showErrorMessage("Не удалось записать RunTask/task-menu.json: " + message);
    return false;
  }
  return true;
}

async function addButton(item) {
  const fields = await askButtonFields(null);
  if (!fields) {
    return false;
  }
  return withConfig(async (data) => {
    const list = listAt(data, submenuPath(item));
    if (!list) {
      vscode.window.showErrorMessage("Подменю не найдено. Обновите список и повторите.");
      return false;
    }
    if (fields.launch === "1c") {
      await sealLaunchSecrets(fields, null);
    }
    const node = {};
    applyButton(node, fields);
    list.push(node);
    rememberFile(data, fields.file, fields.label);
    return true;
  });
}

async function addSubmenu(item) {
  const fields = await askSubmenuFields(null);
  if (!fields) {
    return false;
  }
  return withConfig(async (data) => {
    const list = listAt(data, submenuPath(item));
    if (!list) {
      vscode.window.showErrorMessage("Подменю не найдено. Обновите список и повторите.");
      return false;
    }
    const node = { items: [] };
    applySubmenu(node, fields);
    list.push(node);
    return true;
  });
}

async function chooseMenuItem(provider, placeHolder) {
  const picks = provider.menuItems();
  if (!picks.length) {
    vscode.window.showErrorMessage("В списке нет кнопок и подменю");
    return null;
  }
  const picked = await vscode.window.showQuickPick(picks, {
    placeHolder: placeHolder,
    ignoreFocusOut: true
  });
  return picked ? picked.item : null;
}

async function editEntry(provider, item) {
  const target = item && (item.contextValue === "taskButton" || item.contextValue === "taskSubmenu")
    ? item
    : await chooseMenuItem(provider, "Какой пункт изменить");
  if (!target) {
    return false;
  }
  const dropped = [];
  const changed = await withConfig(async (data) => {
    const node = nodeAt(data, target.entryPath || []);
    if (!sameLabel(node, target)) {
      vscode.window.showErrorMessage("Пункт не найден. Обновите список и повторите.");
      return false;
    }
    if (target.contextValue === "taskSubmenu") {
      const fields = await askSubmenuFields(node);
      if (!fields) {
        return false;
      }
      applySubmenu(node, fields);
      return true;
    }
    const previousIds = onecKeys.collectSecretIds(node);
    const fields = await askButtonFields(node);
    if (!fields) {
      return false;
    }
    if (fields.launch === "1c") {
      await sealLaunchSecrets(fields, node.run);
    }
    applyButton(node, fields);
    const nextIds = onecKeys.collectSecretIds(node);
    previousIds.filter((id) => nextIds.indexOf(id) < 0).forEach((id) => dropped.push(id));
    rememberFile(data, fields.file, fields.label);
    return true;
  });
  if (changed) {
    try {
      await forgetSecretIds(dropped);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      vscode.window.showErrorMessage("Не удалось удалить секрет из хранилища: " + message);
    }
  }
  return changed;
}

async function deleteEntry(provider, item) {
  const target = item && (item.contextValue === "taskButton" || item.contextValue === "taskSubmenu")
    ? item
    : await chooseMenuItem(provider, "Какой пункт удалить");
  if (!target) {
    return false;
  }
  const question = target.contextValue === "taskSubmenu"
    ? "Удалить подменю \"" + target.label + "\" и пункты внутри?"
    : "Удалить кнопку \"" + target.label + "\"?";
  const answer = await vscode.window.showWarningMessage(question, { modal: true }, "Удалить");
  if (answer !== "Удалить") {
    return false;
  }
  const dropped = [];
  const changed = await withConfig(async (data) => {
    const indexPath = target.entryPath || [];
    const node = nodeAt(data, indexPath);
    if (!sameLabel(node, target)) {
      vscode.window.showErrorMessage("Пункт не найден. Обновите список и повторите.");
      return false;
    }
    const list = indexPath.length === 1 ? data.entries : listAt(data, indexPath.slice(0, -1));
    if (!list) {
      vscode.window.showErrorMessage("Пункт не найден. Обновите список и повторите.");
      return false;
    }
    onecKeys.collectSecretIds(node).forEach((id) => dropped.push(id));
    list.splice(indexPath[indexPath.length - 1], 1);
    return true;
  });
  if (changed) {
    try {
      await forgetSecretIds(dropped);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      vscode.window.showErrorMessage("Не удалось удалить секрет из хранилища: " + message);
    }
  }
  return changed;
}

function activate(context) {
  secretStorage = context.secrets;
  const provider = new TaskMenuProvider();
  const view = vscode.window.createTreeView("projectTaskMenu", {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  const apply = async () => {
    if (!movingSecrets) {
      movingSecrets = true;
      try {
        await movePlainSecretsNow();
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        vscode.window.showErrorMessage("Не удалось перенести пароли в хранилище секретов: " + message);
      } finally {
        movingSecrets = false;
      }
    }
    const loaded = provider.reload();
    view.title = loaded.title;
    vscode.commands.executeCommand("setContext", HAS_CONFIG, loaded.hasConfig);
  };

  const watchers = [];
  const bindWatchers = () => {
    watchers.forEach((item) => item.dispose());
    watchers.length = 0;
    (vscode.workspace.workspaceFolders || []).forEach((folder) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, RUN_TASK_DIR + "/" + CONFIG_NAME)
      );
      watcher.onDidChange(apply);
      watcher.onDidCreate(apply);
      watcher.onDidDelete(apply);
      watchers.push(watcher);
    });
  };
  bindWatchers();

  context.subscriptions.push(
    view,
    { dispose: () => watchers.forEach((item) => item.dispose()) },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      bindWatchers();
      apply();
    }),
    vscode.commands.registerCommand("projectTaskMenu.refresh", async () => {
      try {
        await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
      } catch (error) {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    }),
    vscode.commands.registerCommand("projectTaskMenu.openFile", openFile),
    vscode.commands.registerCommand("projectTaskMenu.addButton", async (item) => {
      if (await addButton(item)) {
        apply();
      }
    }),
    vscode.commands.registerCommand("projectTaskMenu.addSubmenu", async (item) => {
      if (await addSubmenu(item)) {
        apply();
      }
    }),
    vscode.commands.registerCommand("projectTaskMenu.editEntry", async (item) => {
      if (await editEntry(provider, item)) {
        apply();
      }
    }),
    vscode.commands.registerCommand("projectTaskMenu.deleteEntry", async (item) => {
      if (await deleteEntry(provider, item)) {
        apply();
      }
    }),
    vscode.commands.registerCommand("projectTaskMenu.cycleTheme", cycleColorTheme),
    vscode.commands.registerCommand("projectTaskMenu.run", async (entry) => {
      if (entry) {
        await runEntry(entry);
        return;
      }
      const picks = provider.runnableEntries();
      if (!picks.length) {
        vscode.window.showErrorMessage("Список задач пуст");
        return;
      }
      const picked = await vscode.window.showQuickPick(picks, {
        placeHolder: "Выберите задачу"
      });
      if (picked) {
        await runEntry(picked.entry);
      }
    })
  );

  apply();
}

function deactivate() {}

module.exports = { activate, deactivate };
