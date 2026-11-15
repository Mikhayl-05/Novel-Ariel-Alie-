import { useEffect, useMemo, useState } from 'react';
import {
  computeRelationshipLayout,
  relationshipMapData,
} from '../data/relationshipMap';
import { vibrate } from '../utils/haptics';

interface RelationshipMapModalProps {
  open: boolean;
  onClose: () => void;
}

export function RelationshipMapModal({
  open,
  onClose,
}: RelationshipMapModalProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedNodeId(null);
      vibrate(10);
    }
  }, [open]);

  const layout = useMemo(
    () => computeRelationshipLayout(relationshipMapData),
    [],
  );

  const nodeById = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout.nodes],
  );

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;

  const relatedEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return relationshipMapData.edges.filter(
      (e) => e.from === selectedNodeId || e.to === selectedNodeId,
    );
  }, [selectedNodeId]);

  return (
    <>
      <div
        className={`relmap-overlay${open ? ' visible' : ''}`}
        id="relmap-overlay"
        onClick={onClose}
      />
      <div
        className={`relmap-modal${open ? ' visible' : ''}`}
        id="relmap-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Peta Hubungan Karakter"
      >
        <div className="relmap-header">
          <span className="relmap-title">🗺️ Peta Hubungan Karakter</span>
          <button
            type="button"
            className="relmap-close"
            id="relmap-close"
            aria-label="Tutup Peta Hubungan"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="relmap-graph-wrap" id="relmap-graph-wrap">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            {relationshipMapData.edges.map((edge) => {
              const a = nodeById.get(edge.from);
              const b = nodeById.get(edge.to);
              if (!a || !b) return null;
              const cls = edge.main
                ? 'relmap-edge relmap-edge-main'
                : 'relmap-edge';
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  className={cls}
                  x1={a.x.toFixed(1)}
                  y1={a.y.toFixed(1)}
                  x2={b.x.toFixed(1)}
                  y2={b.y.toFixed(1)}
                />
              );
            })}

            {layout.nodes.map((n) => {
              const r = n.group === 'main' ? 24 : 18;
              const groupCls =
                n.group === 'main'
                  ? 'relmap-node-main'
                  : 'relmap-node-support';
              const activeCls = selectedNodeId === n.id ? ' is-active' : '';
              return (
                <g
                  key={n.id}
                  className={`relmap-node ${groupCls}${activeCls}`}
                  data-node-id={n.id}
                  onClick={() => {
                    setSelectedNodeId(n.id);
                    vibrate(10);
                  }}
                >
                  <circle
                    className="relmap-node-circle"
                    cx={n.x.toFixed(1)}
                    cy={n.y.toFixed(1)}
                    r={r}
                  />
                  <text
                    className="relmap-node-label"
                    x={n.x.toFixed(1)}
                    y={(n.y + r + 13).toFixed(1)}
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="relmap-detail" id="relmap-detail">
          {!selectedNode ? (
            <p className="relmap-detail-empty">
              Ketuk salah satu karakter untuk melihat detail &amp; hubungannya.
            </p>
          ) : (
            <>
              <div className="relmap-detail-name">{selectedNode.name}</div>
              <div className="relmap-detail-role">{selectedNode.role}</div>
              <div className="relmap-detail-desc">{selectedNode.desc}</div>
              {relatedEdges.length > 0 && (
                <>
                  <div className="relmap-detail-rel-title">Hubungan</div>
                  {relatedEdges.map((edge) => {
                    const otherId =
                      edge.from === selectedNode.id ? edge.to : edge.from;
                    const other = nodeById.get(otherId);
                    if (!other) return null;
                    return (
                      <div
                        key={`${edge.from}-${edge.to}`}
                        className="relmap-detail-rel-item"
                      >
                        <strong>{other.name}</strong> — {edge.label}
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
