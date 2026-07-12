import { useEffect, useMemo } from "react";

const STATUS_META = {
  backlog: { label: "Backlog", icon: "○", className: "status-backlog" },
  todo: { label: "To-do", icon: "◎", className: "status-todo" },
  "in-progress": {
    label: "In Progress",
    icon: "◐",
    className: "status-in-progress",
  },
  done: { label: "Done", icon: "✓", className: "status-done" },
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const LEVEL_GAP = 72;
const ROW_GAP = 28;
const PAD = 32;

function collectUpstreamGraph(items, rootId) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const nodeIds = new Set([rootId]);
  const edges = [];
  const stack = [rootId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    const item = byId.get(currentId);
    if (!item) continue;
    for (const prereqId of item.prerequisites || []) {
      edges.push({ from: prereqId, to: currentId });
      if (!nodeIds.has(prereqId)) {
        nodeIds.add(prereqId);
        stack.push(prereqId);
      }
    }
  }

  return { nodeIds: [...nodeIds], edges, byId };
}

function layoutGraph(nodeIds, edges) {
  const prereqsByNode = Object.fromEntries(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (prereqsByNode[edge.to]) {
      prereqsByNode[edge.to].push(edge.from);
    }
  }

  const levelMemo = {};
  function levelOf(id) {
    if (levelMemo[id] != null) return levelMemo[id];
    const prereqs = (prereqsByNode[id] || []).filter((prereqId) =>
      nodeIds.includes(prereqId)
    );
    if (prereqs.length === 0) {
      levelMemo[id] = 0;
      return 0;
    }
    levelMemo[id] = 1 + Math.max(...prereqs.map(levelOf));
    return levelMemo[id];
  }

  const levels = {};
  for (const id of nodeIds) {
    const level = levelOf(id);
    if (!levels[level]) levels[level] = [];
    levels[level].push(id);
  }

  const positions = {};
  let maxBottom = 0;
  let maxRight = 0;

  for (const [levelText, ids] of Object.entries(levels)) {
    const level = Number(levelText);
    const sorted = [...ids].sort((a, b) => a - b);
    const columnHeight =
      sorted.length * NODE_HEIGHT + (sorted.length - 1) * ROW_GAP;
    const startY = PAD + Math.max(0, (200 - columnHeight) / 2);

    sorted.forEach((id, index) => {
      const x = PAD + level * (NODE_WIDTH + LEVEL_GAP);
      const y = startY + index * (NODE_HEIGHT + ROW_GAP);
      positions[id] = { x, y };
      maxRight = Math.max(maxRight, x + NODE_WIDTH);
      maxBottom = Math.max(maxBottom, y + NODE_HEIGHT);
    });
  }

  return {
    positions,
    width: maxRight + PAD,
    height: Math.max(maxBottom + PAD, 240),
  };
}

function edgePath(fromPos, toPos) {
  const x1 = fromPos.x + NODE_WIDTH;
  const y1 = fromPos.y + NODE_HEIGHT / 2;
  const x2 = toPos.x;
  const y2 = toPos.y + NODE_HEIGHT / 2;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

export default function DependencyGraphModal({ rootItem, items, onClose }) {
  const graph = useMemo(() => {
    if (!rootItem) return null;
    const collected = collectUpstreamGraph(items, rootItem.id);
    const layout = layoutGraph(collected.nodeIds, collected.edges);
    return { ...collected, ...layout };
  }, [rootItem, items]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!rootItem || !graph) return null;

  const hasOnlyRoot = graph.nodeIds.length === 1;

  return (
    <div className="graph-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="graph-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="graph-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="graph-modal-header">
          <div>
            <h2 id="graph-modal-title">Dependency graph</h2>
            <p className="graph-modal-subtitle">
              Tasks leading up to <strong>{rootItem.name}</strong>
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dependency graph"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="graph-modal-legend">
          {Object.entries(STATUS_META).map(([status, meta]) => (
            <span key={status} className={`graph-legend-item ${meta.className}`}>
              <span className="graph-status-icon" aria-hidden="true">
                {meta.icon}
              </span>
              {meta.label}
            </span>
          ))}
        </div>

        {hasOnlyRoot ? (
          <p className="graph-modal-empty">
            This task has no upstream prerequisites.
          </p>
        ) : null}

        <div className="graph-canvas-wrap">
          <svg
            className="graph-canvas"
            width={graph.width}
            height={graph.height}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
          >
            <defs>
              <marker
                id="graph-arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6" fill="none" stroke="#9ca3af" />
              </marker>
            </defs>

            {graph.edges.map((edge) => {
              const fromPos = graph.positions[edge.from];
              const toPos = graph.positions[edge.to];
              if (!fromPos || !toPos) return null;
              return (
                <path
                  key={`${edge.from}->${edge.to}`}
                  d={edgePath(fromPos, toPos)}
                  className="graph-edge"
                  markerEnd="url(#graph-arrowhead)"
                />
              );
            })}

            {graph.nodeIds.map((id) => {
              const item = graph.byId.get(id);
              const pos = graph.positions[id];
              if (!pos) return null;
              const status = item?.status || "backlog";
              const meta = STATUS_META[status] || STATUS_META.backlog;
              const isRoot = id === rootItem.id;

              return (
                <g
                  key={id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className={`graph-node ${meta.className}${
                    isRoot ? " graph-node-root" : ""
                  }`}
                >
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx="8"
                    ry="8"
                    className="graph-node-card"
                  />
                  <text x="14" y="24" className="graph-node-title">
                    {(item?.name || `#${id}`).slice(0, 22)}
                    {(item?.name || "").length > 22 ? "…" : ""}
                  </text>
                  <text x="14" y="44" className="graph-node-status">
                    {meta.icon} {meta.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
