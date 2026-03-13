const FILES = {
  nodeIndex: "/data/codeaware-node-index.latest.json",
  edges: "/data/codeaware-cognitive-edges.latest.json",
  mastery: "/data/codeaware-node-mastery.latest.json",
};

const STYLE_BY_TYPE = {
  step: {
    color: "#ffb947",
    shape: "box",
  },
  "code-chunk": {
    color: "#4ec7f8",
    shape: "dot",
  },
  "background-knowledge": {
    color: "#f66d9b",
    shape: "diamond",
  },
  situation: {
    color: "#90e05a",
    shape: "triangle",
  },
};

const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const detailsEl = document.getElementById("details");
const graphEl = document.getElementById("graph");
const hoverTooltipEl = document.getElementById("hoverTooltip");
const reloadBtn = document.getElementById("reloadBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const typeFilterEls = Array.from(document.querySelectorAll(".type-filter"));

let network = null;
let datasetNodes = null;
let datasetEdges = null;
let rawNodesById = new Map();
let adjacency = new Map();
let fullGraphPayload = { nodes: [], edges: [] };

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#ff7d7d" : "#8ea0bc";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadJson(filePath) {
  const response = await fetch(filePath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${filePath} (${response.status})`);
  }
  return response.json();
}

function getNodeMasteryMap(masteryPayload) {
  const map = new Map();
  const scores = Array.isArray(masteryPayload?.nodeMasteryScores)
    ? masteryPayload.nodeMasteryScores
    : [];

  scores.forEach((item) => {
    map.set(`${item.nodeType}:${item.nodeId}`, item.score);
  });

  return map;
}

function buildGraphPayload(nodeIndexPayload, edgesPayload, masteryPayload) {
  const masteryMap = getNodeMasteryMap(masteryPayload);
  const nodeItems = Array.isArray(nodeIndexPayload?.nodes)
    ? nodeIndexPayload.nodes
    : [];
  const edgeItems = Array.isArray(edgesPayload?.edges)
    ? edgesPayload.edges
    : [];

  rawNodesById = new Map();

  const nodes = nodeItems.map((node) => {
    const typeStyle = STYLE_BY_TYPE[node.nodeType] || {
      color: "#cccccc",
      shape: "dot",
    };
    const mastery = masteryMap.get(`${node.nodeType}:${node.id}`);
    const label =
      node.title && node.title.length > 34
        ? `${node.title.slice(0, 31)}...`
        : node.title;

    rawNodesById.set(node.id, node);
    return {
      id: node.id,
      label: label || node.id,
      shape: typeStyle.shape,
      color: {
        background: typeStyle.color,
        border: "#243246",
        highlight: {
          background: "#ffffff",
          border: "#ffffff",
        },
      },
      font: {
        color: "#121212",
        size: 12,
      },
      size: node.nodeType === "code-chunk" ? 10 : 16,
      title: `<b>${escapeHtml(node.title || node.id)}</b><br/>Type: ${escapeHtml(node.nodeType)}<br/>Mastery: ${
        mastery == null ? "N/A" : Number(mastery).toFixed(2)
      }<br/><br/>${escapeHtml(node.abstract || "")}`,
      nodeType: node.nodeType,
      mastery,
      rawTitle: node.title || node.id,
      rawAbstract: node.abstract || "",
    };
  });

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges = edgeItems
    .filter(
      (edge) => nodeIdSet.has(edge.fromNodeId) && nodeIdSet.has(edge.toNodeId),
    )
    .map((edge) => {
      const weight =
        typeof edge.conditionalMasteryProbability === "number"
          ? edge.conditionalMasteryProbability
          : 0.5;

      const color =
        edge.type === "inference-forward"
          ? "#4ad1ff"
          : edge.type === "inference-reverse"
            ? "#c48cff"
            : "#8ba0bc";

      return {
        id: edge.id,
        from: edge.fromNodeId,
        to: edge.toNodeId,
        arrows: "to",
        color: {
          color,
          opacity: 0.45,
          highlight: "#ffffff",
        },
        width: 1 + weight * 1.5,
        title: `${edge.type || "unknown"} | p=${weight.toFixed(2)}`,
      };
    });

  return { nodes, edges };
}

function buildAdjacency(nodes, edges) {
  const map = new Map();
  nodes.forEach((node) => {
    map.set(node.id, new Set());
  });

  edges.forEach((edge) => {
    const sourceNeighbors = map.get(edge.from);
    const targetNeighbors = map.get(edge.to);
    if (sourceNeighbors) {
      sourceNeighbors.add(edge.to);
    }
    if (targetNeighbors) {
      targetNeighbors.add(edge.from);
    }
  });

  return map;
}

function getActiveNodeTypes() {
  const active = new Set();
  typeFilterEls.forEach((el) => {
    if (el.checked) {
      active.add(el.value);
    }
  });
  return active;
}

function getFilteredGraphPayload() {
  const activeTypes = getActiveNodeTypes();
  const nodes = fullGraphPayload.nodes.filter((node) =>
    activeTypes.has(node.nodeType),
  );
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const edges = fullGraphPayload.edges.filter(
    (edge) => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to),
  );

  return { nodes, edges };
}

function renderFilteredGraph() {
  const payload = getFilteredGraphPayload();
  adjacency = buildAdjacency(payload.nodes, payload.edges);
  createNetwork(payload);
  updateStats(payload.nodes, payload.edges);
  hideHoverTooltip();
  renderDetails(null);

  const activeTypes = Array.from(getActiveNodeTypes());
  if (activeTypes.length === 0) {
    setStatus("No node type selected. Please enable at least one type.", true);
  } else {
    setStatus(
      `Data loaded. Active filters: ${activeTypes.join(", ")}. Hover for details, click a node to focus.`,
    );
  }
}

function updateStats(nodes, edges) {
  const counts = {
    step: 0,
    "code-chunk": 0,
    "background-knowledge": 0,
    situation: 0,
  };

  nodes.forEach((node) => {
    if (Object.prototype.hasOwnProperty.call(counts, node.nodeType)) {
      counts[node.nodeType] += 1;
    }
  });

  statsEl.innerHTML = [
    `Nodes: <b>${nodes.length}</b>`,
    `Edges: <b>${edges.length}</b>`,
    `Step: <b>${counts.step}</b>`,
    `Code Chunk: <b>${counts["code-chunk"]}</b>`,
    `Knowledge: <b>${counts["background-knowledge"]}</b>`,
    `Situation: <b>${counts.situation}</b>`,
  ].join("<br/>");
}

function renderDetails(node) {
  if (!node) {
    detailsEl.textContent = "Click a node to focus and inspect details.";
    return;
  }

  const neighbors = Array.from(adjacency.get(node.id) || []);
  const lines = [
    `ID: ${node.id}`,
    `Type: ${node.nodeType}`,
    `Mastery: ${node.mastery == null ? "N/A" : Number(node.mastery).toFixed(3)}`,
    `Title: ${node.rawTitle || ""}`,
    "",
    `Abstract: ${node.rawAbstract || ""}`,
    "",
    `Neighbors (${neighbors.length}): ${neighbors.slice(0, 20).join(", ")}${neighbors.length > 20 ? " ..." : ""}`,
  ];

  detailsEl.textContent = lines.join("\n");
}

function hideHoverTooltip() {
  hoverTooltipEl.classList.add("hidden");
  hoverTooltipEl.innerHTML = "";
}

function showHoverTooltip(nodeId) {
  const node = datasetNodes.get(nodeId);
  if (!node) {
    hideHoverTooltip();
    return;
  }

  const masteryText =
    node.mastery == null ? "N/A" : Number(node.mastery).toFixed(3);
  const abstractText = node.rawAbstract || "(No abstract)";

  hoverTooltipEl.innerHTML = [
    `<div class="title">${escapeHtml(node.rawTitle || node.id)}</div>`,
    `<div class="meta">${escapeHtml(node.nodeType)} | Mastery: ${masteryText}</div>`,
    `<div>${escapeHtml(abstractText)}</div>`,
  ].join("");

  const posMap = network.getPositions([nodeId]);
  const canvasPos = posMap[nodeId];
  if (!canvasPos) {
    hideHoverTooltip();
    return;
  }

  const domPos = network.canvasToDOM(canvasPos);
  hoverTooltipEl.classList.remove("hidden");

  const graphRect = graphEl.getBoundingClientRect();
  const tooltipRect = hoverTooltipEl.getBoundingClientRect();

  let left = domPos.x + 18;
  let top = domPos.y - tooltipRect.height / 2;

  if (left + tooltipRect.width > graphRect.width - 8) {
    left = domPos.x - tooltipRect.width - 18;
  }
  if (left < 8) {
    left = 8;
  }

  if (top < 8) {
    top = 8;
  }
  if (top + tooltipRect.height > graphRect.height - 8) {
    top = graphRect.height - tooltipRect.height - 8;
  }

  hoverTooltipEl.style.left = `${left}px`;
  hoverTooltipEl.style.top = `${top}px`;
}

function highlightNeighborhood(centerNodeId) {
  const neighbors = adjacency.get(centerNodeId) || new Set();
  const updates = [];

  datasetNodes.forEach((node) => {
    const isCenter = node.id === centerNodeId;
    const isNeighbor = neighbors.has(node.id);

    updates.push({
      id: node.id,
      opacity: isCenter || isNeighbor ? 1 : 0.25,
      borderWidth: isCenter ? 4 : isNeighbor ? 2 : 1,
    });
  });

  datasetNodes.update(updates);
}

function clearHighlight() {
  const updates = [];
  datasetNodes.forEach((node) => {
    updates.push({
      id: node.id,
      opacity: 1,
      borderWidth: 1,
    });
  });
  datasetNodes.update(updates);
}

function createNetwork(payload) {
  datasetNodes = new vis.DataSet(payload.nodes);
  datasetEdges = new vis.DataSet(payload.edges);

  const data = {
    nodes: datasetNodes,
    edges: datasetEdges,
  };

  const options = {
    autoResize: true,
    interaction: {
      hover: true,
      navigationButtons: true,
      keyboard: true,
      tooltipDelay: 120,
      multiselect: false,
    },
    physics: {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -2500,
        springLength: 170,
        springConstant: 0.035,
      },
      stabilization: {
        enabled: true,
        iterations: 450,
      },
    },
    nodes: {
      borderWidth: 1,
      margin: 8,
      scaling: {
        min: 8,
        max: 22,
      },
      shadow: {
        enabled: true,
        color: "rgba(0,0,0,0.35)",
        x: 1,
        y: 2,
        size: 8,
      },
    },
    edges: {
      smooth: {
        enabled: true,
        type: "continuous",
        roundness: 0.24,
      },
      selectionWidth: 2,
      hoverWidth: 2,
    },
  };

  if (network) {
    network.destroy();
  }

  network = new vis.Network(graphEl, data, options);

  network.on("click", (params) => {
    const clickedNodeId = params.nodes[0];
    if (!clickedNodeId) {
      clearHighlight();
      renderDetails(null);
      return;
    }

    const node = datasetNodes.get(clickedNodeId);
    renderDetails(node);
    highlightNeighborhood(clickedNodeId);

    network.focus(clickedNodeId, {
      scale: 1.1,
      animation: {
        duration: 350,
        easingFunction: "easeInOutQuad",
      },
    });
  });

  network.on("hoverNode", (params) => {
    showHoverTooltip(params.node);
  });

  network.on("blurNode", () => {
    hideHoverTooltip();
  });

  network.on("dragStart", () => {
    hideHoverTooltip();
  });

  network.on("zoom", () => {
    hideHoverTooltip();
  });
}

async function reloadData() {
  setStatus("Loading data...");

  try {
    const [nodeIndexPayload, edgesPayload, masteryPayload] = await Promise.all([
      loadJson(FILES.nodeIndex),
      loadJson(FILES.edges),
      loadJson(FILES.mastery),
    ]);

    fullGraphPayload = buildGraphPayload(
      nodeIndexPayload,
      edgesPayload,
      masteryPayload,
    );
    renderFilteredGraph();
  } catch (error) {
    console.error(error);
    setStatus(
      "Could not load JSON files. Ensure data/codeaware-*.latest.json exists.",
      true,
    );
    statsEl.innerHTML = "";
    renderDetails(null);
  }
}

reloadBtn.addEventListener("click", () => {
  reloadData();
});

typeFilterEls.forEach((el) => {
  el.addEventListener("change", () => {
    if (!fullGraphPayload.nodes.length) {
      return;
    }
    renderFilteredGraph();
  });
});

resetViewBtn.addEventListener("click", () => {
  if (!network) {
    return;
  }
  clearHighlight();
  renderDetails(null);
  hideHoverTooltip();
  network.fit({
    animation: {
      duration: 280,
      easingFunction: "easeInOutQuad",
    },
  });
});

window.addEventListener("load", () => {
  reloadData();
});
