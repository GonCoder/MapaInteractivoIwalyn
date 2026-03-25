const imageWidth = 1280;
const imageHeight = 952;
const bounds = [[0, 0], [imageHeight, imageWidth]];

const STORAGE_KEY = "iwalyn_map_custom_markers_v7";
const LEGACY_STORAGE_KEYS = ["iwalyn_map_custom_markers_v6"];
const VANILLA_JSON_PATH = "MarcadoresVanilla.json";
const CUSTOM_JSON_PATH = "MarcadoresCustom.json";

const mapGroups = {
    mapas: {
        label: "Mapas",
        items: {
            mapa0: {
                name: "Mapa Antiguo",
                image: "mapas/Mapa0.png",
                vanillaMarkers: [],
                customMarkers: []
            },
            mapa1: {
                name: "Mapa Politico",
                image: "mapas/Mapa1web.png",
                vanillaMarkers: [],
                customMarkers: []
            },
            mapa2: {
                name: "Mapa General",
                image: "mapas/Mapa2web.png",
                vanillaMarkers: [],
                customMarkers: []
            },
            mapa3: {
                name: "Mapa Conocido",
                image: "mapas/Mapa3web.png",
                vanillaMarkers: [],
                customMarkers: []
            }
        }
    }
};

const mapRegistry = {
    ...mapGroups.mapas.items
};

let currentMapKey = "mapa1";
let currentImageOverlay = null;
let markerMode = "off";
let tempPreviewLayer = null;
let placementPoints = [];
let markersFaded = false;

const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 5,
    zoomSnap: 0.25,
    zoomDelta: 0.25
});

map.fitBounds(bounds);
map.setZoom(map.getZoom() - 0.5);

const ciudades = L.layerGroup().addTo(map);
const lugares = L.layerGroup().addTo(map);
const portales = L.layerGroup().addTo(map);
const minas = L.layerGroup().addTo(map);
const conflictos = L.layerGroup();
const gremios = L.layerGroup().addTo(map);
const otros = L.layerGroup().addTo(map);

L.control.layers(
    null,
    {
        Ciudades: ciudades,
        Lugares: lugares,
        Portales: portales,
        Minas: minas,
        Conflictos: conflictos,
        Gremios: gremios,
        Otros: otros
    },
    { collapsed: false }
).addTo(map);

const editor = document.getElementById("markerEditor");
const activeMapName = document.getElementById("activeMapName");
const markerCategory = document.getElementById("markerCategory");
const standardFields = document.getElementById("standardFields");
const conflictFields = document.getElementById("conflictFields");
const markerNameInput = document.getElementById("markerName");
const markerDescInput = document.getElementById("markerDesc");
const conflictCase1NameInput = document.getElementById("conflictCase1Name");
const conflictCase1DescInput = document.getElementById("conflictCase1Desc");
const conflictCase2NameInput = document.getElementById("conflictCase2Name");
const conflictCase2DescInput = document.getElementById("conflictCase2Desc");
const markerCoords = document.getElementById("markerCoords");
const acceptMarkerBtn = document.getElementById("acceptMarkerBtn");
const cancelMarkerBtn = document.getElementById("cancelMarkerBtn");
const undoLastBtn = document.getElementById("undoLastBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const clearStorageBtn = document.getElementById("clearStorageBtn");
const exportCustomBtn = document.getElementById("exportCustomBtn");
const generatedArray = document.getElementById("generatedArray");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const copyStatus = document.getElementById("copyStatus");
const reloadJsonBtn = document.getElementById("reloadJsonBtn");

function escapeString(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function isConflictCategory(category) {
    return category === "conflictos";
}

function popupHtmlFromData(item) {
    const lines = [];

    if (item.conflictCaseLabel) {
        lines.push(`<small><i>${escapeHtml(item.conflictCaseLabel)}</i></small>`);
    }

    lines.push(`<small><i>${escapeHtml(item.categoria)}</i></small>`);

    if (item.descripcion) {
        lines.push(escapeHtml(item.descripcion).replace(/\n/g, "<br>"));
    }

    return `
    <div>
      <b>${escapeHtml(item.nombre)}</b><br>
      ${lines.join("<br>")}
    </div>
  `;
}

function markerSignature(marker) {
    return [
        marker.categoria ?? "",
        marker.nombre ?? "",
        Number(marker.y).toFixed(2),
        Number(marker.x).toFixed(2),
        marker.descripcion ?? "",
        marker.conflictId ?? "",
        marker.conflictCaseLabel ?? "",
        marker.conflictCaseOrder ?? ""
    ].join("||");
}

function normalizeMarker(raw) {
    if (!raw || typeof raw !== "object") return null;

    const categoria = typeof raw.categoria === "string" ? raw.categoria : "otros";
    const nombre = typeof raw.nombre === "string" ? raw.nombre : "Marcador sin nombre";
    const y = Number(raw.y);
    const x = Number(raw.x);
    const descripcion = typeof raw.descripcion === "string" ? raw.descripcion : "";

    if (!Number.isFinite(y) || !Number.isFinite(x)) return null;

    const normalized = {
        categoria,
        nombre,
        y: Number(y.toFixed(2)),
        x: Number(x.toFixed(2)),
        descripcion
    };

    if (typeof raw.conflictId === "string" && raw.conflictId.trim()) {
        normalized.conflictId = raw.conflictId.trim();
    }

    if (typeof raw.conflictCaseLabel === "string" && raw.conflictCaseLabel.trim()) {
        normalized.conflictCaseLabel = raw.conflictCaseLabel.trim();
    }

    if (Number.isFinite(Number(raw.conflictCaseOrder))) {
        normalized.conflictCaseOrder = Number(raw.conflictCaseOrder);
    }

    return normalized;
}

function uniqueMarkers(markers) {
    const seen = new Set();
    const out = [];

    for (const marker of markers) {
        const normalized = normalizeMarker(marker);
        if (!normalized) continue;

        const sig = markerSignature(normalized);
        if (seen.has(sig)) continue;

        seen.add(sig);
        out.push(normalized);
    }

    return out;
}

function mergeMarkers(existingMarkers, currentMarkers) {
    return uniqueMarkers([...(existingMarkers || []), ...(currentMarkers || [])]);
}

function getLayerByCategory(category) {
    switch (category) {
        case "ciudades": return ciudades;
        case "lugares": return lugares;
        case "portales": return portales;
        case "minas": return minas;
        case "conflictos": return conflictos;
        case "gremios": return gremios;
        default: return otros;
    }
}

function getCategoryEmoji(category) {
    switch (category) {
        case "ciudades": return "🏠";
        case "lugares": return "📍";
        case "portales": return "🌀";
        case "minas": return "💎";
        case "conflictos": return "⚔️";
        case "gremios": return "🏅";
        default: return "•";
    }
}

function createCategoryIcon(category) {
    return L.divIcon({
        className: "custom-div-icon-wrapper",
        html: `
      <div class="custom-marker-icon custom-marker-${category}">
        <span>${getCategoryEmoji(category)}</span>
      </div>
    `,
        iconSize: [21, 21],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    });
}

function clearMarkerLayers() {
    [ciudades, lugares, portales, minas, conflictos, gremios, otros].forEach(layer => {
        layer.clearLayers();
    });
}

function getConflictGroupItems(markers) {
    const groups = new Map();

    markers.forEach(marker => {
        if (!isConflictCategory(marker.categoria) || !marker.conflictId) return;

        if (!groups.has(marker.conflictId)) {
            groups.set(marker.conflictId, []);
        }

        groups.get(marker.conflictId).push(marker);
    });

    return groups;
}

function removeMarkersByConflictId(markers, conflictId) {
    return markers.filter(marker => marker.conflictId !== conflictId);
}

function createFinalMarker(item, sourceType = "custom") {
    const layer = getLayerByCategory(item.categoria);

    const marker = L.marker([item.y, item.x], {
        icon: createCategoryIcon(item.categoria)
    })
        .bindPopup(popupHtmlFromData(item))
        .addTo(layer);

    marker.on("click", function () {
        if (markerMode !== "delete") return;
        if (sourceType !== "custom") return;

        const arr = mapRegistry[currentMapKey].customMarkers;

        if (isConflictCategory(item.categoria) && item.conflictId) {
            mapRegistry[currentMapKey].customMarkers = removeMarkersByConflictId(arr, item.conflictId);
            saveCustomMarkersToStorage();
            refreshExportBox();
            redrawMarkersForCurrentMap();
            copyStatus.textContent = `Conflicto eliminado de ${mapRegistry[currentMapKey].name}.`;
            return;
        }

        const sig = markerSignature(item);
        const index = arr.findIndex(markerItem => markerSignature(markerItem) === sig);

        if (index !== -1) {
            arr.splice(index, 1);
            saveCustomMarkersToStorage();
            refreshExportBox();
            redrawMarkersForCurrentMap();
            copyStatus.textContent = `Marcador eliminado de ${mapRegistry[currentMapKey].name}.`;
        }
    });
}

function drawConflictLines(markers) {
    const groups = getConflictGroupItems(markers);

    groups.forEach(items => {
        const orderedItems = [...items].sort((a, b) => (a.conflictCaseOrder || 99) - (b.conflictCaseOrder || 99));
        if (orderedItems.length < 2) return;

        L.polyline(
            orderedItems.map(item => [item.y, item.x]),
            {
                color: "#ff3b30",
                weight: 3,
                opacity: 0.95
            }
        ).addTo(conflictos);
    });
}

function redrawMarkersForCurrentMap() {
    clearMarkerLayers();

    const current = mapRegistry[currentMapKey];

    current.vanillaMarkers.forEach(marker => createFinalMarker(marker, "vanilla"));
    current.customMarkers.forEach(marker => createFinalMarker(marker, "custom"));
    drawConflictLines([...current.vanillaMarkers, ...current.customMarkers]);
}

function serializeMarkerForExport(item) {
    const properties = [
        `categoria: "${escapeString(item.categoria)}"`,
        `nombre: "${escapeString(item.nombre)}"`,
        `y: ${item.y}`,
        `x: ${item.x}`,
        `descripcion: "${escapeString(item.descripcion)}"`
    ];

    if (item.conflictId) {
        properties.push(`conflictId: "${escapeString(item.conflictId)}"`);
    }

    if (item.conflictCaseLabel) {
        properties.push(`conflictCaseLabel: "${escapeString(item.conflictCaseLabel)}"`);
    }

    if (Number.isFinite(item.conflictCaseOrder)) {
        properties.push(`conflictCaseOrder: ${item.conflictCaseOrder}`);
    }

    return `  {\n    ${properties.join(",\n    ")}\n  }`;
}

function buildArrayExport(mapKey) {
    const current = mapRegistry[mapKey];
    const lines = [...current.vanillaMarkers, ...current.customMarkers].map(serializeMarkerForExport);

    return `const marcadores_${mapKey.replace(/-/g, "_")} = [\n${lines.join(",\n")}\n];`;
}

function buildCustomJsonExportObject() {
    const out = {};

    Object.keys(mapRegistry).forEach(key => {
        out[key] = mapRegistry[key].customMarkers.map(marker => {
            const exported = {
                categoria: marker.categoria,
                nombre: marker.nombre,
                y: marker.y,
                x: marker.x,
                descripcion: marker.descripcion
            };

            if (marker.conflictId) {
                exported.conflictId = marker.conflictId;
            }

            if (marker.conflictCaseLabel) {
                exported.conflictCaseLabel = marker.conflictCaseLabel;
            }

            if (Number.isFinite(marker.conflictCaseOrder)) {
                exported.conflictCaseOrder = marker.conflictCaseOrder;
            }

            return exported;
        });
    });

    return out;
}

function refreshExportBox() {
    generatedArray.value = buildArrayExport(currentMapKey);
    activeMapName.textContent = mapRegistry[currentMapKey].name;
}

function removeTempPreview() {
    if (tempPreviewLayer) {
        map.removeLayer(tempPreviewLayer);
        tempPreviewLayer = null;
    }
}

function clearPlacementState() {
    removeTempPreview();
    placementPoints = [];
}

function resetInputs(options = {}) {
    const preserveCategory = Boolean(options.preserveCategory);

    markerNameInput.value = "";
    markerDescInput.value = "";
    conflictCase1NameInput.value = "";
    conflictCase1DescInput.value = "";
    conflictCase2NameInput.value = "";
    conflictCase2DescInput.value = "";
    markerCoords.textContent = "";

    if (!preserveCategory) {
        markerCategory.value = "ciudades";
    }

    updateEditorFields();
}

function updateCoordsText() {
    if (placementPoints.length === 0) {
        markerCoords.textContent = "";
        return;
    }

    if (isConflictCategory(markerCategory.value)) {
        const parts = placementPoints.map((point, index) => {
            return `Caso ${index + 1} -> Y: ${point.lat.toFixed(2)} | X: ${point.lng.toFixed(2)}`;
        });

        if (placementPoints.length === 1) {
            parts.push("Falta seleccionar Caso 2.");
        }

        markerCoords.textContent = parts.join(" | ");
        return;
    }

    const point = placementPoints[0];
    markerCoords.textContent = `Coordenadas -> Y: ${point.lat.toFixed(2)} | X: ${point.lng.toFixed(2)}`;
}

function focusRelevantInput() {
    if (isConflictCategory(markerCategory.value)) {
        conflictCase1NameInput.focus();
        return;
    }

    markerNameInput.focus();
}

function updateEditorFields() {
    const conflictMode = isConflictCategory(markerCategory.value);

    standardFields.style.display = conflictMode ? "none" : "block";
    conflictFields.style.display = conflictMode ? "grid" : "none";
    updateCoordsText();
}

function openEditor() {
    editor.style.display = "block";
    updateEditorFields();
    focusRelevantInput();
}

function closeEditor() {
    editor.style.display = "none";
}

function applyEditorModeToUI(button) {
    if (markerMode === "off") {
        map.getContainer().style.cursor = "";
        button.style.background = "white";
        button.textContent = "📍";
        button.title = "Modo apagado";
        clearPlacementState();
        resetInputs();
        closeEditor();
        return;
    }

    if (markerMode === "create") {
        map.getContainer().style.cursor = "crosshair";
        button.style.background = "#ffe08a";
        button.textContent = "📍";
        button.title = "Modo crear marcadores";
        openEditor();
        copyStatus.textContent = "Modo crear activado.";
        return;
    }

    if (markerMode === "delete") {
        map.getContainer().style.cursor = "not-allowed";
        button.style.background = "#d9534f";
        button.textContent = "🗑";
        button.title = "Modo borrar marcadores";
        clearPlacementState();
        resetInputs();
        editor.style.display = "block";
        copyStatus.textContent = "Modo borrar activado. Haz clic en un marcador custom para eliminarlo.";
    }
}

function cycleMarkerMode(button) {
    if (markerMode === "off") {
        markerMode = "create";
    } else if (markerMode === "create") {
        markerMode = "delete";
    } else {
        markerMode = "off";
    }

    applyEditorModeToUI(button);
}

function applyMarkersFadedState() {
    const mapContainer = map.getContainer();

    if (markersFaded) {
        mapContainer.classList.add("markers-faded");
    } else {
        mapContainer.classList.remove("markers-faded");
    }
}

function toggleMarkersFaded(button) {
    markersFaded = !markersFaded;
    applyMarkersFadedState();

    if (markersFaded) {
        button.style.background = "#cfe8ff";
        button.textContent = "👁";
        button.title = "Marcadores atenuados activados";
        copyStatus.textContent = "Marcadores atenuados activados.";
    } else {
        button.style.background = "white";
        button.textContent = "👁";
        button.title = "Marcadores atenuados desactivados";
        copyStatus.textContent = "Marcadores atenuados desactivados.";
    }
}

function loadMapItem(mapKey) {
    currentMapKey = mapKey;

    if (currentImageOverlay) {
        map.removeLayer(currentImageOverlay);
    }

    currentImageOverlay = L.imageOverlay(
        mapRegistry[mapKey].image,
        bounds
    ).addTo(map);

    map.fitBounds(bounds);
    map.setZoom(map.getZoom() - 0.5);

    clearPlacementState();
    resetInputs();
    refreshExportBox();
    redrawMarkersForCurrentMap();
    updateMapButtons();
    applyMarkersFadedState();
}

function updateMapButtons() {
    document.querySelectorAll(".continent-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mapkey === currentMapKey);
    });
}

async function fetchJsonSafe(path) {
    try {
        const headResponse = await fetch(path, {
            method: "HEAD",
            cache: "no-store"
        });

        if (!headResponse.ok) {
            return null;
        }

        const dataResponse = await fetch(path, {
            cache: "no-store"
        });

        if (!dataResponse.ok) {
            return null;
        }

        return await dataResponse.json();
    } catch (error) {
        return null;
    }
}

function applyJsonDataToTarget(parsed, targetField) {
    if (!parsed || typeof parsed !== "object") return;

    Object.keys(mapRegistry).forEach(key => {
        const source = parsed[key];

        if (Array.isArray(source)) {
            mapRegistry[key][targetField] = uniqueMarkers(source);
            return;
        }

        if (source && Array.isArray(source.markers)) {
            mapRegistry[key][targetField] = uniqueMarkers(source.markers);
        }
    });
}

async function loadJsonMarkerFiles() {
    const [vanillaData, customData] = await Promise.all([
        fetchJsonSafe(VANILLA_JSON_PATH),
        fetchJsonSafe(CUSTOM_JSON_PATH)
    ]);

    if (vanillaData) {
        applyJsonDataToTarget(vanillaData, "vanillaMarkers");
    }

    if (customData) {
        applyJsonDataToTarget(customData, "customMarkers");
    }
}

function resetAllMarkersInMemory() {
    Object.keys(mapRegistry).forEach(key => {
        mapRegistry[key].vanillaMarkers = [];
        mapRegistry[key].customMarkers = [];
    });
}

async function reloadJsonFilesIntoMemory() {
    resetAllMarkersInMemory();
    await loadJsonMarkerFiles();
    saveCustomMarkersToStorage();
    refreshExportBox();
    redrawMarkersForCurrentMap();
    applyMarkersFadedState();
}

function saveCustomMarkersToStorage() {
    const dataToSave = {};

    Object.keys(mapRegistry).forEach(key => {
        dataToSave[key] = mapRegistry[key].customMarkers;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
}

function loadCustomMarkersFromStorage() {
    const candidateKeys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

    for (const storageKey of candidateKeys) {
        const raw = localStorage.getItem(storageKey);
        if (!raw) continue;

        try {
            const parsed = JSON.parse(raw);

            Object.keys(mapRegistry).forEach(key => {
                if (Array.isArray(parsed[key])) {
                    mapRegistry[key].customMarkers = uniqueMarkers(parsed[key]);
                }
            });

            if (storageKey !== STORAGE_KEY) {
                saveCustomMarkersToStorage();
            }

            return true;
        } catch (error) {
            console.error("No se pudo cargar el guardado local:", error);
        }
    }

    return false;
}

function clearAllStorage() {
    localStorage.removeItem(STORAGE_KEY);
}

async function mergeExistingCustomJsonIntoMemory() {
    const existingCustomData = await fetchJsonSafe(CUSTOM_JSON_PATH);

    if (!existingCustomData || typeof existingCustomData !== "object") {
        return;
    }

    Object.keys(mapRegistry).forEach(key => {
        const existingMarkers = Array.isArray(existingCustomData[key])
            ? existingCustomData[key]
            : (existingCustomData[key] && Array.isArray(existingCustomData[key].markers)
                ? existingCustomData[key].markers
                : []);

        mapRegistry[key].customMarkers = mergeMarkers(
            existingMarkers,
            mapRegistry[key].customMarkers
        );
    });

    saveCustomMarkersToStorage();
    refreshExportBox();
    redrawMarkersForCurrentMap();
    applyMarkersFadedState();
}

async function downloadCustomJsonFile() {
    await mergeExistingCustomJsonIntoMemory();

    const jsonString = JSON.stringify(buildCustomJsonExportObject(), null, 2);
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "MarcadoresCustom.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}

function rebuildTempPreview() {
    removeTempPreview();

    if (placementPoints.length === 0) {
        updateCoordsText();
        return;
    }

    tempPreviewLayer = L.layerGroup().addTo(map);

    placementPoints.forEach((point, index) => {
        L.marker([point.lat, point.lng], {
            icon: createCategoryIcon(markerCategory.value)
        })
            .bindPopup(`<b>Nuevo ${isConflictCategory(markerCategory.value) ? `Caso ${index + 1}` : "marcador"}</b>`)
            .addTo(tempPreviewLayer);
    });

    if (isConflictCategory(markerCategory.value) && placementPoints.length === 2) {
        L.polyline(
            placementPoints.map(point => [point.lat, point.lng]),
            {
                color: "#ff3b30",
                weight: 3,
                opacity: 0.8,
                dashArray: "8,6"
            }
        ).addTo(tempPreviewLayer);
    }

    updateCoordsText();
}

function addPlacementPoint(latlng) {
    if (isConflictCategory(markerCategory.value)) {
        if (placementPoints.length === 2) {
            placementPoints = [];
        }

        placementPoints.push(latlng);
        rebuildTempPreview();

        if (placementPoints.length === 1) {
            copyStatus.textContent = "Caso 1 colocado. Haz clic en el mapa para colocar Caso 2.";
        } else {
            copyStatus.textContent = "Caso 2 colocado. Ya puedes guardar el conflicto.";
        }

        return;
    }

    placementPoints = [latlng];
    rebuildTempPreview();
    copyStatus.textContent = "Marcador temporal colocado. Completa los datos y guarda.";
}

function buildConflictMarkers() {
    if (placementPoints.length !== 2) {
        copyStatus.textContent = "Para un conflicto debes colocar Caso 1 y Caso 2 en el mapa.";
        return null;
    }

    const conflictId = `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const case1 = normalizeMarker({
        categoria: "conflictos",
        nombre: conflictCase1NameInput.value.trim() || "Caso 1",
        y: placementPoints[0].lat,
        x: placementPoints[0].lng,
        descripcion: conflictCase1DescInput.value.trim() || "Sin descripcion.",
        conflictId,
        conflictCaseLabel: "Caso 1",
        conflictCaseOrder: 1
    });
    const case2 = normalizeMarker({
        categoria: "conflictos",
        nombre: conflictCase2NameInput.value.trim() || "Caso 2",
        y: placementPoints[1].lat,
        x: placementPoints[1].lng,
        descripcion: conflictCase2DescInput.value.trim() || "Sin descripcion.",
        conflictId,
        conflictCaseLabel: "Caso 2",
        conflictCaseOrder: 2
    });

    if (!case1 || !case2) {
        copyStatus.textContent = "No se pudo crear el conflicto.";
        return null;
    }

    return [case1, case2];
}

const MarkerToggleControl = L.Control.extend({
    options: {
        position: "topleft"
    },

    onAdd: function () {
        const container = L.DomUtil.create("div", "marker-toggle-control");
        const button = L.DomUtil.create("button", "marker-toggle-btn", container);

        button.textContent = "📍";
        button.title = "Modo apagado";

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        L.DomEvent.on(button, "click", function (e) {
            L.DomEvent.stop(e);
            cycleMarkerMode(button);
        });

        return container;
    }
});

const MarkerFadeControl = L.Control.extend({
    options: {
        position: "topleft"
    },

    onAdd: function () {
        const container = L.DomUtil.create("div", "marker-toggle-control");
        const button = L.DomUtil.create("button", "marker-toggle-btn", container);

        button.textContent = "👁";
        button.title = "Marcadores atenuados desactivados";

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        L.DomEvent.on(button, "click", function (e) {
            L.DomEvent.stop(e);
            toggleMarkersFaded(button);
        });

        return container;
    }
});

const MapSectionControl = L.Control.extend({
    options: {
        position: "bottomleft"
    },

    onAdd: function () {
        const container = L.DomUtil.create("div", "continent-control");
        const panel = L.DomUtil.create("div", "continent-panel", container);

        panel.innerHTML = `
      <div class="continent-list">
        <button class="continent-btn" data-mapkey="mapa0">Mapa Antiguo</button>
        <button class="continent-btn active" data-mapkey="mapa1">Mapa Politico</button>
        <button class="continent-btn" data-mapkey="mapa2">Mapa General</button>
        <button class="continent-btn" data-mapkey="mapa3">Mapa Conocido</button>
      </div>
    `;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        panel.querySelectorAll(".continent-btn").forEach(btn => {
            L.DomEvent.on(btn, "click", function (e) {
                L.DomEvent.stop(e);
                loadMapItem(btn.dataset.mapkey);
            });
        });

        return container;
    }
});

map.addControl(new MarkerToggleControl());
map.addControl(new MarkerFadeControl());
map.addControl(new MapSectionControl());

map.on("click", function (e) {
    if (markerMode !== "create") return;

    addPlacementPoint(e.latlng);
    openEditor();
});

markerCategory.addEventListener("change", function () {
    clearPlacementState();
    resetInputs({ preserveCategory: true });
    openEditor();

    if (isConflictCategory(markerCategory.value)) {
        copyStatus.textContent = "Modo conflicto: coloca Caso 1 y Caso 2 en el mapa.";
    }
});

acceptMarkerBtn.addEventListener("click", function () {
    if (markerMode !== "create") {
        copyStatus.textContent = "Activa primero el modo crear.";
        return;
    }

    if (isConflictCategory(markerCategory.value)) {
        const items = buildConflictMarkers();
        if (!items) return;

        mapRegistry[currentMapKey].customMarkers = mergeMarkers(
            mapRegistry[currentMapKey].customMarkers,
            items
        );

        if (!map.hasLayer(conflictos)) {
            map.addLayer(conflictos);
        }

        saveCustomMarkersToStorage();
        refreshExportBox();
        redrawMarkersForCurrentMap();
        applyMarkersFadedState();
        clearPlacementState();
        resetInputs({ preserveCategory: true });
        focusRelevantInput();
        copyStatus.textContent = `Conflicto añadido a ${mapRegistry[currentMapKey].name}. Total custom: ${mapRegistry[currentMapKey].customMarkers.length}`;
        return;
    }

    if (placementPoints.length !== 1) {
        copyStatus.textContent = "Haz clic primero en el mapa para colocar el marcador.";
        return;
    }

    const item = normalizeMarker({
        categoria: markerCategory.value,
        nombre: markerNameInput.value.trim() || "Marcador sin nombre",
        y: placementPoints[0].lat,
        x: placementPoints[0].lng,
        descripcion: markerDescInput.value.trim() || "Sin descripcion."
    });

    if (!item) {
        copyStatus.textContent = "No se pudo crear el marcador.";
        return;
    }

    mapRegistry[currentMapKey].customMarkers = mergeMarkers(
        mapRegistry[currentMapKey].customMarkers,
        [item]
    );

    saveCustomMarkersToStorage();
    refreshExportBox();
    redrawMarkersForCurrentMap();
    applyMarkersFadedState();
    clearPlacementState();
    resetInputs({ preserveCategory: true });
    focusRelevantInput();
    copyStatus.textContent = `Marcador custom añadido a ${mapRegistry[currentMapKey].name}. Total custom: ${mapRegistry[currentMapKey].customMarkers.length}`;
});

cancelMarkerBtn.addEventListener("click", function () {
    clearPlacementState();
    resetInputs({ preserveCategory: true });
    copyStatus.textContent = "Marcador temporal cancelado.";
});

undoLastBtn.addEventListener("click", function () {
    const arr = mapRegistry[currentMapKey].customMarkers;

    if (arr.length === 0) {
        copyStatus.textContent = "No hay marcadores custom que deshacer.";
        return;
    }

    const lastItem = arr[arr.length - 1];

    if (isConflictCategory(lastItem.categoria) && lastItem.conflictId) {
        mapRegistry[currentMapKey].customMarkers = removeMarkersByConflictId(arr, lastItem.conflictId);
    } else {
        arr.pop();
    }

    saveCustomMarkersToStorage();
    refreshExportBox();
    redrawMarkersForCurrentMap();
    applyMarkersFadedState();
    copyStatus.textContent = `Ultimo marcador custom eliminado de ${mapRegistry[currentMapKey].name}.`;
});

clearAllBtn.addEventListener("click", function () {
    mapRegistry[currentMapKey].customMarkers = [];
    saveCustomMarkersToStorage();
    refreshExportBox();
    redrawMarkersForCurrentMap();
    applyMarkersFadedState();
    clearPlacementState();
    resetInputs();
    copyStatus.textContent = `Marcadores custom de ${mapRegistry[currentMapKey].name} eliminados.`;
});

clearStorageBtn.addEventListener("click", function () {
    Object.keys(mapRegistry).forEach(key => {
        mapRegistry[key].customMarkers = [];
    });

    clearAllStorage();
    refreshExportBox();
    redrawMarkersForCurrentMap();
    applyMarkersFadedState();
    clearPlacementState();
    resetInputs();
    copyStatus.textContent = "Se borro todo el guardado local de marcadores custom.";
});

copyCodeBtn.addEventListener("click", async function () {
    try {
        await navigator.clipboard.writeText(generatedArray.value);
        copyStatus.textContent = `Codigo custom de ${mapRegistry[currentMapKey].name} copiado al portapapeles.`;
    } catch (error) {
        copyStatus.textContent = "No se pudo copiar automaticamente. Copialo manualmente.";
    }
});

exportCustomBtn.addEventListener("click", async function () {
    try {
        await downloadCustomJsonFile();
        copyStatus.textContent = "Se exporto MarcadoresCustom.json.";
    } catch (error) {
        console.error(error);
        copyStatus.textContent = "No se pudo exportar MarcadoresCustom.json.";
    }
});

reloadJsonBtn.addEventListener("click", async function () {
    try {
        await reloadJsonFilesIntoMemory();
        copyStatus.textContent = "JSONs recargados correctamente.";
    } catch (error) {
        console.error(error);
        copyStatus.textContent = "No se pudieron recargar los JSONs.";
    }
});

async function initializeApp() {
    await loadJsonMarkerFiles();

    const hasLocalData = loadCustomMarkersFromStorage();
    if (hasLocalData) {
        copyStatus.textContent = "Se cargo el guardado local de marcadores custom.";
    } else {
        saveCustomMarkersToStorage();
        copyStatus.textContent = "Se cargaron los JSON base del proyecto o se ignoraron si no existian.";
    }

    loadMapItem(currentMapKey);
    editor.style.display = "none";
    updateEditorFields();
    refreshExportBox();
    applyMarkersFadedState();
}

initializeApp();

