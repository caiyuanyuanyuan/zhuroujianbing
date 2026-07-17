"use strict";

/*
 * 棍铲婚礼网页最终版
 *
 * 重要：前端中的 X-Access-Key 对所有访问者可见。
 * 请在 JSONBin 后台只给这个 Access Key 开启当前 Bin 所需的 Read / Update 权限，
 * 不要使用 X-Master-Key，也不要授予 Delete / Create 等无关权限。
 */

const JSONBIN_CONFIG = Object.freeze({
  binId: "6a58ca65f5f4af5e29974689",
  accessKey: "$2a$10$69lJr.U50uvn7Cj2PINAc.pHstvKIpkVBYp4.R1s0LCa/t9mWhX/W",
  apiRoot: "https://api.jsonbin.io/v3/b",
  pollIntervalMs: 15000
});

const VIDEO_CONFIG = Object.freeze({
  about: {
    title: "关于我们",
    vid: "7663092925606499786",
    closeText: "看完返回",
    afterClose: "main"
  },
  banquet: {
    title: "请各位来宾准备入席",
    vid: "7663193884733982858",
    closeText: "关闭并进入宴席",
    afterClose: "room1"
  },
  bow1: {
    title: "骗你的，直接一送洞房",
    vid: "7663143469350718746",
    closeText: "看完返回",
    afterClose: "main"
  },
  bow2: {
    title: "骗你的，直接二送洞房",
    vid: "7663151538923212041",
    closeText: "看完返回",
    afterClose: "main"
  },
  bow3: {
    title: "骗你的，直接三送洞房",
    vid: "7663159047926895854",
    closeText: "看完返回",
    afterClose: "main"
  }
});
const ROOM_CONFIG = Object.freeze({
  room1: "一号主宴席大厅",
  room2: "二号包厢",
  room3: "三号包厢",
  room4: "四号包厢"
});

const TABLE_DEFINITIONS = Object.freeze([
  {
    tableId: "left1",
    side: "left",
    tableName: "双方亲友",
    food: "🍳🥙🧋🍰🐟🥬🍗🥘🍬",
    fixedName: "小锹"
  },
  {
    tableId: "left2",
    side: "left",
    tableName: "其他亲友",
    food: "🍳🥙🧋🍰🐟🥬🥩🍗🥘🍬",
    fixedName: ""
  },
  {
    tableId: "left3",
    side: "left",
    tableName: "棍方亲友",
    food: "🍎🍎🍎🍎🍎🍎🍎🍎",
    fixedName: "芝士"
  },
  {
    tableId: "right1",
    side: "right",
    tableName: "双方亲友",
    food: "🍳🥙🧋🍰🐟🍗🥘🍬",
    fixedName: "小锹"
  },
  {
    tableId: "right2",
    side: "right",
    tableName: "其他亲友",
    food: "🍳🥙🧋🍰🐟🥬🥩🍗",
    fixedName: ""
  },
  {
    tableId: "right3",
    side: "right",
    tableName: "铲方亲友",
    food: "🧀🧀🧀🧀🧀🧀🧀🧀",
    fixedName: "信号灯"
  }
]);

const OTHER_IDENTITIES = Object.freeze([
  "福来",
  "宝丝",
  "极丝",
  "航丝",
  "左邓批",
  "极禹批",
  "其他"
]);

const INITIAL_OCCUPIED = Object.freeze({
  left1: { 0: "小锹" },
  left3: { 0: "芝士" },
  right1: { 0: "小锹" },
  right3: { 0: "信号灯" }
});

const STORAGE_KEY = "gunchan_wedding_rooms_v2";
const VISITOR_ID_KEY = "gunchan_wedding_visitor_id_v1";
const appState = {
  currentPage: "welcomePage",
  currentRoom: "room1",
  cloudDocument: null,
  cloudAvailable: true,
  visitorId: "",
  isWriting: false,
  lastCloudFetchAt: 0,
  pollTimer: null,
  writeQueue: Promise.resolve(),
  videoKey: null,
  pendingSeat: null,
  toastTimer: null,
  welcomeTimer: null,
  agreeTimer: null,
  suppressSeatClickUntil: 0,
  lastCloudWasLegacy: false
};

const dom = {};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createVisitorId() {
  if (window.crypto?.randomUUID) {
    return `guest-${window.crypto.randomUUID()}`;
  }
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateVisitorId() {
  try {
    const saved = localStorage.getItem(VISITOR_ID_KEY);
    if (saved) return saved;
    const created = createVisitorId();
    localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch (error) {
    console.warn("无法持久保存访客标识：", error);
    return createVisitorId();
  }
}

function getTableDefinition(tableId) {
  return TABLE_DEFINITIONS.find((item) => item.tableId === tableId) || null;
}

function makeDefaultSeatData() {
  return TABLE_DEFINITIONS.map((definition) => ({
    tableId: definition.tableId,
    tableName: definition.tableName,
    food: definition.food,
    seats: Array.from({ length: 8 }, (_, seatIndex) => {
      const presetName = INITIAL_OCCUPIED[definition.tableId]?.[seatIndex] || "";
      return {
        occupied: Boolean(presetName),
        name: presetName,
        ownerId: "",
        updatedAt: ""
      };
    })
  }));
}

function makeDefaultDocument() {
  const stamp = nowIso();
  const rooms = {};
  Object.entries(ROOM_CONFIG).forEach(([roomId, roomName]) => {
    rooms[roomId] = {
      roomId,
      roomName,
      seatData: makeDefaultSeatData(),
      updateTime: stamp
    };
  });

  return {
    schemaVersion: 3,
    rooms,
    updateTime: stamp
  };
}

function normalizeSeat(rawSeat, definition) {
  const occupied = rawSeat?.occupied === true;
  let name = occupied ? String(rawSeat?.name || "").trim().slice(0, 12) : "";

  if (occupied && definition.fixedName) {
    name = definition.fixedName;
  }

  if (occupied && !name) {
    name = definition.fixedName || "亲友";
  }

  return {
    occupied,
    name,
    ownerId: occupied ? String(rawSeat?.ownerId || "").slice(0, 80) : "",
    updatedAt: occupied ? String(rawSeat?.updatedAt || "") : ""
  };
}

function normalizeSeatData(rawSeatData) {
  const sourceTables = Array.isArray(rawSeatData) ? rawSeatData : [];

  return TABLE_DEFINITIONS.map((definition) => {
    const sourceTable = sourceTables.find((item) => item?.tableId === definition.tableId) || {};
    const sourceSeats = Array.isArray(sourceTable.seats) ? sourceTable.seats : [];

    return {
      tableId: definition.tableId,
      tableName: definition.tableName,
      food: definition.food,
      seats: Array.from({ length: 8 }, (_, index) => {
        const fallback = makeDefaultSeatData()
          .find((item) => item.tableId === definition.tableId)
          .seats[index];
        return normalizeSeat(sourceSeats[index] ?? fallback, definition);
      })
    };
  });
}

function normalizeDocument(rawDocument) {
  const fallback = makeDefaultDocument();
  const raw = rawDocument && typeof rawDocument === "object" ? rawDocument : {};
  const rooms = {};
  const hasRooms = raw.rooms && typeof raw.rooms === "object";
  const legacySeatData = Array.isArray(raw.seatData) ? raw.seatData : null;

  Object.entries(ROOM_CONFIG).forEach(([roomId, roomName]) => {
    const rawRoom = hasRooms ? raw.rooms[roomId] : null;
    const roomSeatData = rawRoom?.seatData
      ?? (roomId === "room1" ? legacySeatData : null)
      ?? fallback.rooms[roomId].seatData;

    rooms[roomId] = {
      roomId,
      roomName,
      seatData: normalizeSeatData(roomSeatData),
      updateTime: String(rawRoom?.updateTime || raw.updateTime || "")
    };
  });

  return {
    schemaVersion: 3,
    rooms,
    updateTime: String(raw.updateTime || "")
  };
}

function makeCloudPayload(documentData) {
  const normalized = normalizeDocument(documentData);
  const rooms = {};

  Object.entries(normalized.rooms).forEach(([roomId, room]) => {
    rooms[roomId] = {
      roomId,
      roomName: room.roomName,
      seatData: room.seatData.map((table) => ({
        tableId: table.tableId,
        seats: table.seats.map((seat) => seat.occupied
          ? {
              occupied: true,
              name: seat.name,
              ownerId: seat.ownerId || "",
              updatedAt: seat.updatedAt || ""
            }
          : { occupied: false })
      })),
      updateTime: room.updateTime || ""
    };
  });

  return {
    schemaVersion: 3,
    rooms,
    updateTime: normalized.updateTime || nowIso()
  };
}

function readLocalDocument() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeDocument(JSON.parse(saved)) : makeDefaultDocument();
  } catch (error) {
    console.warn("读取本地座位失败：", error);
    return makeDefaultDocument();
  }
}

function saveLocalDocument(documentData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentData));
  } catch (error) {
    console.warn("保存本地座位失败：", error);
  }
}

function jsonBinHeaders(includeContentType = false) {
  const headers = {
    "X-Access-Key": JSONBIN_CONFIG.accessKey,
    "X-Bin-Meta": "false"
  };
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function fetchCloudDocument({ quiet = false } = {}) {
  const url = `${JSONBIN_CONFIG.apiRoot}/${JSONBIN_CONFIG.binId}/latest?meta=false&_=${Date.now()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: jsonBinHeaders(false),
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`读取座位库失败（${response.status}）${details ? `：${details}` : ""}`);
  }

  const raw = await response.json();
  const sourceDocument = raw?.record ?? raw;
  appState.lastCloudWasLegacy = !(sourceDocument?.rooms && typeof sourceDocument.rooms === "object");
  const documentData = normalizeDocument(sourceDocument);
  appState.cloudDocument = documentData;
  appState.cloudAvailable = true;
  appState.lastCloudFetchAt = Date.now();
  saveLocalDocument(documentData);

  if (!quiet) {
    setSyncStatus("ok", "座位库已同步");
  }

  return documentData;
}

async function putCloudDocument(documentData) {
  const url = `${JSONBIN_CONFIG.apiRoot}/${JSONBIN_CONFIG.binId}`;
  const normalized = normalizeDocument(documentData);
  normalized.updateTime = nowIso();
  const payload = makeCloudPayload(normalized);

  const response = await fetch(url, {
    method: "PUT",
    headers: jsonBinHeaders(true),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`写入座位库失败（${response.status}）${details ? `：${details}` : ""}`);
  }

  const responseBody = await response.json().catch(() => null);
  const saved = normalizeDocument(responseBody?.record ?? payload);
  appState.cloudDocument = saved;
  appState.cloudAvailable = true;
  saveLocalDocument(saved);
  return saved;
}

function setSyncStatus(state, text) {
  if (!dom.syncStatus) return;
  dom.syncStatus.dataset.state = state;
  const textNode = dom.syncStatus.querySelector(".sync-text");
  if (textNode) textNode.textContent = text;
}

async function initializeSeatStore() {
  setSyncStatus("loading", "正在连接座位库…");

  try {
    const cloudDocument = await fetchCloudDocument();
    appState.cloudDocument = cloudDocument;
    renderCurrentRoom();
  } catch (error) {
    console.warn(error);
    appState.cloudAvailable = false;
    appState.cloudDocument = readLocalDocument();
    renderCurrentRoom();
    setSyncStatus("error", "云端暂不可用，操作时会继续重试");
  }
}

function startPolling() {
  stopPolling();
  appState.pollTimer = window.setInterval(async () => {
    if (appState.currentPage !== "banquetPage" || appState.isWriting) return;
    try {
      await fetchCloudDocument({ quiet: true });
      renderCurrentRoom({ preserveAnimation: true });
      setSyncStatus("ok", "座位状态已更新");
    } catch (error) {
      console.warn("轮询同步失败：", error);
      appState.cloudAvailable = false;
      setSyncStatus("error", "同步中断，将自动重试");
    }
  }, JSONBIN_CONFIG.pollIntervalMs);
}

function stopPolling() {
  if (appState.pollTimer) {
    clearInterval(appState.pollTimer);
    appState.pollTimer = null;
  }
}

function getSeat(documentData, roomId, tableId, seatIndex) {
  const room = documentData?.rooms?.[roomId];
  const table = room?.seatData?.find((item) => item.tableId === tableId);
  return table?.seats?.[seatIndex] || null;
}

function findSeatOwnedBy(documentData, ownerId) {
  if (!ownerId) return null;

  for (const [roomId, room] of Object.entries(documentData?.rooms || {})) {
    for (const table of room.seatData || []) {
      const seatIndex = (table.seats || []).findIndex(
        (seat) => seat?.occupied && seat.ownerId === ownerId
      );
      if (seatIndex >= 0) {
        return {
          roomId,
          tableId: table.tableId,
          seatIndex,
          seat: table.seats[seatIndex]
        };
      }
    }
  }

  return null;
}

function getSeatLocationText(location) {
  if (!location) return "";
  const roomName = ROOM_CONFIG[location.roomId] || location.roomId;
  const tableName = getTableDefinition(location.tableId)?.tableName || location.tableId;
  return `${roomName} · ${tableName} · ${location.seatIndex + 1}号位`;
}

function applySeatMutation(documentData, mutation) {
  const normalized = normalizeDocument(documentData);
  const seat = getSeat(normalized, mutation.roomId, mutation.tableId, mutation.seatIndex);
  const definition = getTableDefinition(mutation.tableId);

  if (!seat || !definition) {
    throw new Error("未找到对应席位");
  }

  if (mutation.occupied) {
    seat.occupied = true;
    seat.name = definition.fixedName || String(mutation.name || "亲友").trim().slice(0, 12);
    seat.ownerId = mutation.ownerId || appState.visitorId;
    seat.updatedAt = mutation.updatedAt;
  } else {
    seat.occupied = false;
    seat.name = "";
    seat.ownerId = "";
    seat.updatedAt = "";
  }

  normalized.rooms[mutation.roomId].updateTime = mutation.updatedAt;
  normalized.updateTime = mutation.updatedAt;
  return normalized;
}

function queueSeatMutation(mutationInput) {
  const mutation = {
    ...mutationInput,
    ownerId: mutationInput.occupied ? appState.visitorId : "",
    updatedAt: nowIso()
  };

  appState.writeQueue = appState.writeQueue
    .catch(() => undefined)
    .then(() => persistSeatMutation(mutation));

  return appState.writeQueue;
}

async function persistSeatMutation(mutation) {
  setSyncStatus("saving", mutation.occupied ? "正在保存席位…" : "正在清空席位…");
  appState.isWriting = true;

  try {
    // 一次操作最多调用两次 API：先读取最新数据，再写入完整但精简的四包厢数据。
    const latest = await fetchCloudDocument({ quiet: true });
    const latestTarget = getSeat(latest, mutation.roomId, mutation.tableId, mutation.seatIndex);

    if (!latestTarget) {
      throw new Error("云端没有找到这个席位，请刷新后重试");
    }

    if (mutation.occupied) {
      if (latestTarget.occupied) {
        appState.cloudDocument = latest;
        renderCurrentRoom({ preserveAnimation: true });
        setSyncStatus("ok", "座位状态已更新");
        showMessage("这个席位刚被选走了", "请选择其他空位。");
        return;
      }

      const existing = findSeatOwnedBy(latest, mutation.ownerId);
      if (existing) {
        appState.cloudDocument = latest;
        renderCurrentRoom({ preserveAnimation: true });
        setSyncStatus("ok", "每位来宾只能选择一个席位");
        showMessage(
          "每位来宾只能坐一个席位",
          `你已经坐在：${getSeatLocationText(existing)}。
如需换座，请先长按原席位 0.8 秒清空。`
        );
        return;
      }
    }

    const merged = applySeatMutation(latest, mutation);
    const saved = await putCloudDocument(merged);
    appState.cloudDocument = saved;
    renderCurrentRoom({ preserveAnimation: true });
    setSyncStatus("ok", mutation.occupied ? "席位已同步到云端" : "席位已清空并同步");

    const savedSeat = getSeat(saved, mutation.roomId, mutation.tableId, mutation.seatIndex);
    showToast(mutation.occupied ? `已落座：${savedSeat?.name || mutation.name}` : "席位已清空");
  } catch (error) {
    console.error(error);
    appState.cloudAvailable = false;
    setSyncStatus("error", "云端保存失败，可再次点击重试");
    showMessage(
      "云端保存失败",
      `${error.message}
本次操作没有假装保存到本地，请稍后再次点击。`
    );
  } finally {
    appState.isWriting = false;
  }
}

function visitorAlreadyHasSeat(documentData = appState.cloudDocument) {
  const existing = findSeatOwnedBy(documentData, appState.visitorId);
  if (!existing) return false;

  showMessage(
    "每位来宾只能坐一个席位",
    `你已经坐在：${getSeatLocationText(existing)}。
如需换座，请先长按原席位 0.8 秒清空。`
  );
  return true;
}

function cacheDom() {
  dom.pages = Array.from(document.querySelectorAll(".page"));
  dom.choicePhoto = document.querySelector(".choice-photo");
  dom.heroPhoto = document.querySelector(".hero-photo");
  dom.agreeBtn = document.getElementById("agreeBtn");
  dom.refuseBtn = document.getElementById("refuseBtn");
  dom.mainPage = document.getElementById("mainPage");
  dom.banquetPage = document.getElementById("banquetPage");
  dom.roomTitle = document.getElementById("roomTitle");
  dom.roomSwitcher = document.getElementById("roomSwitcher");
  dom.tableArea = document.getElementById("tableArea");
  dom.entranceGroup = document.getElementById("entranceGroup");
  dom.syncStatus = document.getElementById("syncStatus");
  dom.videoModal = document.getElementById("videoModal");
  dom.videoModalTitle = document.getElementById("videoModalTitle");
  dom.videoCloseIcon = document.getElementById("videoCloseIcon");
  dom.videoCloseBtn = document.getElementById("videoCloseBtn");
  dom.douyinFrame = document.getElementById("douyinFrame");
  dom.videoMissing = document.getElementById("videoMissing");
  dom.identityModal = document.getElementById("identityModal");
  dom.identityClose = document.getElementById("identityClose");
  dom.identityOptions = document.getElementById("identityOptions");
  dom.customIdentityArea = document.getElementById("customIdentityArea");
  dom.customIdentityInput = document.getElementById("customIdentityInput");
  dom.customIdentityConfirm = document.getElementById("customIdentityConfirm");
  dom.messageModal = document.getElementById("messageModal");
  dom.messageTitle = document.getElementById("messageTitle");
  dom.messageText = document.getElementById("messageText");
  dom.messageOkBtn = document.getElementById("messageOkBtn");
  dom.toast = document.getElementById("toast");
  dom.musicLeftBtn = document.getElementById("musicLeftBtn");
  dom.musicRightBtn = document.getElementById("musicRightBtn");
  dom.musicLeft = document.getElementById("musicLeft");
  dom.musicRight = document.getElementById("musicRight");
}

function showPage(pageId) {
  dom.pages.forEach((page) => page.classList.toggle("is-active", page.id === pageId));
  appState.currentPage = pageId;

  if (pageId === "banquetPage") {
    renderCurrentRoom();
    restartEntranceAnimation();
    startPolling();
  } else {
    stopPolling();
  }

  if (pageId !== "mainPage") {
    pauseAllMusic();
  }
}

function showMessage(title, text, onClose = null) {
  dom.messageTitle.textContent = title;
  dom.messageText.textContent = text;
  dom.messageModal.classList.remove("hidden");
  dom.messageModal.dataset.hasCallback = onClose ? "true" : "false";
  dom.messageModal._onClose = typeof onClose === "function" ? onClose : null;
}

function closeMessage() {
  dom.messageModal.classList.add("hidden");
  const callback = dom.messageModal._onClose;
  dom.messageModal._onClose = null;
  if (callback) callback();
}

function showToast(text) {
  clearTimeout(appState.toastTimer);
  dom.toast.textContent = text;
  dom.toast.classList.add("show");
  appState.toastTimer = window.setTimeout(() => dom.toast.classList.remove("show"), 2200);
}

function setupImageFallbacks() {
  [dom.choicePhoto, dom.heroPhoto].forEach((image) => {
    if (!image) return;
    image.addEventListener("error", () => {
      image.style.display = "none";
    });
    image.addEventListener("load", () => {
      image.style.display = "block";
    });
  });
}

function setupWelcomeFlow() {
  clearTimeout(appState.welcomeTimer);
  appState.welcomeTimer = window.setTimeout(() => showPage("choicePage"), 3000);

  dom.refuseBtn.addEventListener("click", () => {
    showMessage("不许拒绝", "我管你愿不愿意，就要结婚，棍铲强制爱！");
  });

  dom.agreeBtn.addEventListener("click", () => {
    clearTimeout(appState.agreeTimer);
    showMessage("欢迎入场", "感谢你，那我们一起进入婚姻现场吧", () => {
      showPage("mainPage");
    });
    appState.agreeTimer = window.setTimeout(() => {
      if (!dom.messageModal.classList.contains("hidden")) {
        closeMessage();
      }
    }, 1600);
  });
}

function setupMainActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "end") {
        showPage("endPage");
        return;
      }
      openVideoModal(action);
    });
  });

  document.querySelectorAll("[data-back-main]").forEach((button) => {
    button.addEventListener("click", () => showPage("mainPage"));
  });
}

function openVideoModal(videoKey) {
  const config = VIDEO_CONFIG[videoKey];
  if (!config) return;

  appState.videoKey = videoKey;
  dom.videoModalTitle.textContent = config.title;
  dom.videoCloseBtn.textContent = config.closeText;
  dom.videoMissing.classList.toggle("hidden", Boolean(config.vid));

  if (config.vid) {
    const params = new URLSearchParams({ autoplay: "1", vid: config.vid });
    dom.douyinFrame.src = `https://open.douyin.com/player/video?${params.toString()}`;
    dom.douyinFrame.classList.remove("hidden");
  } else {
    dom.douyinFrame.src = "about:blank";
    dom.douyinFrame.classList.add("hidden");
  }

  dom.videoModal.classList.remove("hidden");
}

function closeVideoModal() {
  const config = VIDEO_CONFIG[appState.videoKey];
  dom.videoModal.classList.add("hidden");
  dom.douyinFrame.src = "about:blank";
  appState.videoKey = null;

  if (config?.afterClose === "room1") {
    enterRoom("room1");
  } else {
    showPage("mainPage");
  }
}

function setupVideoModal() {
  dom.videoCloseIcon.addEventListener("click", closeVideoModal);
  dom.videoCloseBtn.addEventListener("click", closeVideoModal);
}

function setupMusic() {
  const tracks = [
    { button: dom.musicLeftBtn, audio: dom.musicLeft },
    { button: dom.musicRightBtn, audio: dom.musicRight }
  ];

  tracks.forEach(({ button, audio }, currentIndex) => {
    button.addEventListener("click", async () => {
      if (!audio.paused) {
        audio.pause();
        button.classList.remove("is-playing");
        button.setAttribute("aria-pressed", "false");
        return;
      }

      tracks.forEach(({ button: otherButton, audio: otherAudio }, index) => {
        if (index === currentIndex) return;
        otherAudio.pause();
        otherButton.classList.remove("is-playing");
        otherButton.setAttribute("aria-pressed", "false");
      });

      try {
        await audio.play();
        button.classList.add("is-playing");
        button.setAttribute("aria-pressed", "true");
      } catch (error) {
        console.warn("音频播放失败：", error);
        showToast("音频未找到或浏览器阻止了播放");
      }
    });

    audio.addEventListener("error", () => {
      button.classList.remove("is-playing");
      button.setAttribute("aria-pressed", "false");
    });
  });
}

function pauseAllMusic() {
  [
    [dom.musicLeftBtn, dom.musicLeft],
    [dom.musicRightBtn, dom.musicRight]
  ].forEach(([button, audio]) => {
    audio.pause();
    button.classList.remove("is-playing");
    button.setAttribute("aria-pressed", "false");
  });
}

function enterRoom(roomId) {
  if (!ROOM_CONFIG[roomId]) return;
  appState.currentRoom = roomId;
  showPage("banquetPage");
}

function renderRoomSwitcher() {
  dom.roomSwitcher.innerHTML = "";

  Object.entries(ROOM_CONFIG)
    .filter(([roomId]) => roomId !== appState.currentRoom)
    .forEach(([roomId, roomName]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "room-switch-btn";
      button.textContent = roomName.replace("主宴席大厅", "主大厅");
      button.addEventListener("click", () => enterRoom(roomId));
      dom.roomSwitcher.appendChild(button);
    });
}

function renderCurrentRoom({ preserveAnimation = false } = {}) {
  if (!dom.tableArea) return;
  const documentData = appState.cloudDocument || readLocalDocument();
  const room = documentData.rooms?.[appState.currentRoom];
  if (!room) return;

  dom.roomTitle.textContent = ROOM_CONFIG[appState.currentRoom];
  renderRoomSwitcher();
  dom.tableArea.innerHTML = "";

  // 先按左1右1、左2右2、左3右3显示，让左右各三桌自然对应。
  ["left1", "right1", "left2", "right2", "left3", "right3"].forEach((tableId) => {
    const tableData = room.seatData.find((item) => item.tableId === tableId);
    const definition = getTableDefinition(tableId);
    if (!tableData || !definition) return;
    dom.tableArea.appendChild(createTableElement(tableData, definition));
  });

  if (!preserveAnimation) {
    restartEntranceAnimation();
  }
}

function createTableElement(tableData, definition) {
  const table = document.createElement("article");
  table.className = `banquet-table ${definition.side}`;
  table.dataset.tableId = definition.tableId;

  const core = document.createElement("div");
  core.className = "table-core";
  core.innerHTML = `
    <div class="table-meta">
      <h3>${escapeHtml(definition.tableName)}</h3>
      <p>${escapeHtml(definition.food)}</p>
      <small>${definition.fixedName ? `${escapeHtml(definition.fixedName)}` : "身份可自选"}</small>
    </div>
  `;

  table.appendChild(core);

  tableData.seats.forEach((seatData, seatIndex) => {
    const seat = document.createElement("button");
    seat.type = "button";
    const isMine = seatData.occupied && seatData.ownerId === appState.visitorId;
    seat.className = `seat${seatData.occupied ? " occupied" : ""}${isMine ? " is-mine" : ""}`;
    seat.style.setProperty("--angle", `${seatIndex * 45}deg`);
    seat.dataset.tableId = definition.tableId;
    seat.dataset.seatIndex = String(seatIndex);
    seat.setAttribute("aria-label", `${definition.tableName}第 ${seatIndex + 1} 个席位${seatData.occupied ? `，${seatData.name}` : "，空位"}`);

    if (seatData.occupied) {
      seat.textContent = seatData.name;
      seat.title = `${seatData.name}${isMine ? "（我的席位）" : ""}（长按 0.8 秒清空）`;
    } else {
      seat.title = "点击落座";
    }

    attachSeatInteractions(seat, definition, seatData, seatIndex);
    table.appendChild(seat);
  });

  return table;
}

function attachSeatInteractions(seatElement, definition, seatData, seatIndex) {
  let longPressTimer = null;
  let longPressTriggered = false;

  const cancelLongPress = () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    seatElement.classList.remove("is-pressing");
  };

  const startLongPress = (event) => {
    if (!seatData.occupied) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    longPressTriggered = false;
    seatElement.classList.add("is-pressing");
    longPressTimer = window.setTimeout(() => {
      longPressTriggered = true;
      appState.suppressSeatClickUntil = Date.now() + 500;
      seatElement.classList.remove("is-pressing");
      queueSeatMutation({
        roomId: appState.currentRoom,
        tableId: definition.tableId,
        seatIndex,
        occupied: false,
        name: ""
      });
    }, 800);
  };

  seatElement.addEventListener("pointerdown", startLongPress);
  seatElement.addEventListener("pointerup", cancelLongPress);
  seatElement.addEventListener("pointercancel", cancelLongPress);
  seatElement.addEventListener("pointerleave", cancelLongPress);
  seatElement.addEventListener("contextmenu", (event) => event.preventDefault());

  seatElement.addEventListener("click", () => {
    if (longPressTriggered || Date.now() < appState.suppressSeatClickUntil) return;

    if (seatData.occupied) {
      showToast("这个席位已占用，长按 0.8 秒可以清空");
      return;
    }

    if (visitorAlreadyHasSeat()) return;

    if (definition.fixedName) {
      queueSeatMutation({
        roomId: appState.currentRoom,
        tableId: definition.tableId,
        seatIndex,
        occupied: true,
        name: definition.fixedName
      });
      return;
    }

    openIdentityModal(definition.tableId, seatIndex);
  });
}

function openIdentityModal(tableId, seatIndex) {
  if (visitorAlreadyHasSeat()) return;

  appState.pendingSeat = {
    roomId: appState.currentRoom,
    tableId,
    seatIndex
  };

  dom.identityOptions.innerHTML = "";
  dom.customIdentityArea.classList.add("hidden");
  dom.customIdentityInput.value = "";

  OTHER_IDENTITIES.forEach((identity) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "identity-option";
    button.textContent = identity;
    button.addEventListener("click", () => {
      if (identity === "其他") {
        dom.customIdentityArea.classList.remove("hidden");
        window.setTimeout(() => dom.customIdentityInput.focus(), 50);
      } else {
        confirmIdentity(identity);
      }
    });
    dom.identityOptions.appendChild(button);
  });

  dom.identityModal.classList.remove("hidden");
}

function closeIdentityModal() {
  dom.identityModal.classList.add("hidden");
  appState.pendingSeat = null;
}

function confirmIdentity(identity) {
  const normalized = String(identity || "").trim().slice(0, 12);
  if (!normalized) {
    showToast("请先填写身份名称");
    return;
  }

  const pendingSeat = appState.pendingSeat;
  closeIdentityModal();
  if (!pendingSeat) return;

  queueSeatMutation({
    ...pendingSeat,
    occupied: true,
    name: normalized
  });
}

function setupIdentityModal() {
  dom.identityClose.addEventListener("click", closeIdentityModal);
  dom.customIdentityConfirm.addEventListener("click", () => confirmIdentity(dom.customIdentityInput.value));
  dom.customIdentityInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") confirmIdentity(dom.customIdentityInput.value);
  });
  dom.identityModal.addEventListener("click", (event) => {
    if (event.target === dom.identityModal) closeIdentityModal();
  });
}

function restartEntranceAnimation() {
  if (!dom.entranceGroup) return;
  dom.entranceGroup.classList.remove("is-walking", "is-arrived");
  void dom.entranceGroup.offsetWidth;
  dom.entranceGroup.classList.add("is-walking");
}

function setupEntranceAnimation() {
  if (!dom.entranceGroup) return;
  dom.entranceGroup.addEventListener("animationend", (event) => {
    if (event.animationName !== "walkToStage") return;
    dom.entranceGroup.classList.add("is-arrived");
  });
}

function setupMessageModal() {
  dom.messageOkBtn.addEventListener("click", closeMessage);
  dom.messageModal.addEventListener("click", (event) => {
    if (event.target === dom.messageModal) closeMessage();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  cacheDom();
  setupImageFallbacks();
  setupWelcomeFlow();
  setupMainActions();
  setupVideoModal();
  setupMusic();
  setupIdentityModal();
  setupMessageModal();
  setupEntranceAnimation();

  appState.visitorId = getOrCreateVisitorId();
  appState.cloudDocument = readLocalDocument();
  renderCurrentRoom();
  await initializeSeatStore();
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error("页面初始化失败：", error);
    showMessage("初始化失败", error.message || "页面初始化失败，请刷新重试。");
  });
});
