import React, { useMemo, useState, useRef, useEffect } from 'react';
import { TreeNode, NodeType } from '../types';

interface TreeVisualizerProps {
  data: TreeNode;
  selectedId: string | null;
  onNodeClick: (id: string | null) => void;
  width: number;
  height: number;
  showValues: boolean;
}

// 布局计算辅助类型
interface LayoutNode {
  data: TreeNode;
  x: number;
  y: number;
  children: LayoutNode[];
}

// 恢复正常的间距和大小
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const HORIZONTAL_SPACING = 280; 
const VERTICAL_SPACING = 100;

const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ 
  data, 
  selectedId, 
  onNodeClick,
  width,
  height,
  showValues
}) => {
  // Zoom and Pan state
  // 修改初始坐标 y 为 50，避免因为 height 很大导致初始渲染在屏幕外
  const [transform, setTransform] = useState({ x: 50, y: 50, k: 0.8 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMouse = useRef({ x: 0, y: 0 });

  // 简单的树形布局算法
  const layoutTree = useMemo(() => {
    let nextY = 0;

    const calculateLayout = (node: TreeNode, depth: number): LayoutNode => {
      const childrenLayouts: LayoutNode[] = [];
      
      if (node.children.length === 0) {
        const leafNode = {
          data: node,
          x: depth * HORIZONTAL_SPACING,
          y: nextY,
          children: []
        };
        nextY += VERTICAL_SPACING;
        return leafNode;
      }

      node.children.forEach(child => {
        childrenLayouts.push(calculateLayout(child, depth + 1));
      });

      // 父节点 Y 坐标为子节点 Y 坐标的平均值
      const firstChildY = childrenLayouts[0].y;
      const lastChildY = childrenLayouts[childrenLayouts.length - 1].y;
      const y = (firstChildY + lastChildY) / 2;

      return {
        data: node,
        x: depth * HORIZONTAL_SPACING,
        y,
        children: childrenLayouts
      };
    };

    nextY = 0;
    // 初始布局计算
    return calculateLayout(data, 0);
  }, [data]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scaleFactor = 0.001;
    const newScale = Math.min(Math.max(transform.k - e.deltaY * scaleFactor, 0.1), 5);
    setTransform(prev => ({ ...prev, k: newScale }));
  };

  // 渲染连线
  const renderLinks = (node: LayoutNode): React.ReactNode[] => {
    let links: React.ReactNode[] = [];
    
    node.children.forEach(child => {
      // 贝塞尔曲线连接
      const sourceX = node.x + NODE_WIDTH / 2;
      const sourceY = node.y;
      const targetX = child.x - NODE_WIDTH / 2; // 连接到左侧
      const targetY = child.y;

      const p1 = { x: node.x + 20, y: node.y }; // Right side of source node (approx)
      const p2 = { x: child.x - 20, y: child.y }; // Left side of target node

      const pathData = `M${p1.x},${p1.y} 
                        C${p1.x + HORIZONTAL_SPACING / 2},${p1.y} 
                         ${p2.x - HORIZONTAL_SPACING / 2},${p2.y} 
                         ${p2.x},${p2.y}`;

      const isOptimalPath = child.data.isOptimal && node.data.isOptimal !== false;
      
      links.push(
        <g key={`${node.data.id}-${child.data.id}`}>
          <path
            d={pathData}
            fill="none"
            stroke={isOptimalPath ? "#10b981" : "#cbd5e1"}
            strokeWidth={isOptimalPath ? 3 : 2}
            className="transition-all duration-300"
          />
          {/* 概率/分支标签 - 放在连线正中间 */}
          <foreignObject 
            x={(p1.x + p2.x) / 2 - 40} 
            y={(p1.y + p2.y) / 2 - 12} 
            width={80} 
            height={24}
            style={{ overflow: 'visible' }} // Allow badges to pop out
          >
             <div className="flex flex-col items-center justify-center h-full">
                {node.data.type === NodeType.CHANCE && (
                  <span className="text-xs font-bold text-gray-600 bg-white/90 px-1.5 py-0.5 rounded-full shadow border border-orange-100 whitespace-nowrap">
                    P = {child.data.probability}
                  </span>
                )}
             </div>
          </foreignObject>
        </g>
      );
      links = [...links, ...renderLinks(child)];
    });
    return links;
  };

  // 渲染节点
  const renderNodes = (node: LayoutNode): React.ReactNode[] => {
    let nodes: React.ReactNode[] = [];
    
    const isSelected = node.data.id === selectedId;
    const isDecision = node.data.type === NodeType.DECISION;
    const isChance = node.data.type === NodeType.CHANCE;
    const isTerminal = node.data.type === NodeType.TERMINAL;

    let shape;
    if (isDecision) {
      shape = <rect width={40} height={40} x={-20} y={-20} fill="#3b82f6" rx={4} />;
    } else if (isChance) {
      shape = <circle r={22} fill="#f97316" />;
    } else {
      shape = <path d="M-20,-20 L20,0 L-20,20 Z" fill="#22c55e" transform="translate(6,0)" />; // Triangle-ish
    }

    nodes.push(
      <g 
        key={node.data.id} 
        transform={`translate(${node.x}, ${node.y})`}
        onClick={(e) => { e.stopPropagation(); onNodeClick(node.data.id); }}
        className="cursor-pointer hover:opacity-90 transition-opacity"
        style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
      >
        {/* Node Shape */}
        <g className={`${isSelected ? 'filter drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'filter drop-shadow-sm'}`}>
           {shape}
        </g>
        
        {/* Label Content */}
        <foreignObject x={28} y={-30} width={180} height={60} style={{ pointerEvents: 'none' }}>
          <div className="flex flex-col justify-center h-full p-1 text-left">
             <div className="font-bold text-sm text-gray-800 leading-tight bg-white/50 backdrop-blur-[1px] rounded px-1 self-start shadow-sm border border-transparent truncate w-full" title={node.data.label}>
               {node.data.label}
             </div>
             
             {(showValues || isTerminal) && (
               <div className="text-xs font-mono mt-1 self-start">
                 {isTerminal ? (
                    <span className="text-green-700 font-bold bg-green-50 px-1.5 py-0 rounded border border-green-100">¥{node.data.value}</span>
                 ) : (
                    node.data.calculatedValue !== undefined && (
                      <span className="text-purple-700 font-bold bg-purple-50 px-1.5 py-0 rounded border border-purple-100">
                        EMV: ¥{node.data.calculatedValue.toFixed(2)}
                      </span>
                    )
                 )}
               </div>
             )}
          </div>
        </foreignObject>
      </g>
    );

    node.children.forEach(child => {
      nodes = [...nodes, ...renderNodes(child)];
    });
    return nodes;
  };

  return (
    <div 
      ref={containerRef}
      className="overflow-hidden bg-white/50 relative w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded shadow border border-gray-200 text-xs text-gray-500 z-10 select-none">
         按住拖动 • 滚轮缩放 ({Math.round(transform.k * 100)}%)
      </div>

      <svg width="100%" height="100%" className="block">
         <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {renderLinks(layoutTree)}
            {renderNodes(layoutTree)}
         </g>
      </svg>
    </div>
  );
};

export default TreeVisualizer;