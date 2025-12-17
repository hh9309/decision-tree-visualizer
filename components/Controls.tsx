import React, { useState } from 'react';
import { TreeNode, NodeType } from '../types';

interface ControlsProps {
  selectedNode: TreeNode | null;
  onUpdateNode: (id: string, updates: Partial<TreeNode>) => void;
  onAddNode: (parentId: string, type: NodeType) => void;
  onDeleteNode: (id: string) => void;
  calculationMode: string;
}

const Controls: React.FC<ControlsProps> = ({
  selectedNode,
  onUpdateNode,
  onAddNode,
  onDeleteNode,
  calculationMode
}) => {
  // 计算机会节点的子节点概率和
  const getProbabilitySum = () => {
    if (!selectedNode || selectedNode.type !== NodeType.CHANCE) return null;
    return selectedNode.children.reduce((sum, child) => sum + (child.probability || 0), 0);
  };
  
  const probSum = getProbabilitySum();

  // 如果没有选中节点，显示空状态
  if (!selectedNode) {
    return (
      <div className="p-4 text-gray-500 text-center flex flex-col h-full items-center justify-center opacity-60">
        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <p className="text-sm font-medium">点击画布节点进行编辑</p>
        <p className="text-xs mt-2 text-gray-400">或点击空白处取消选择</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-800">节点属性</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${
                selectedNode.type === NodeType.DECISION ? 'bg-blue-50 text-blue-700 border-blue-200' :
                selectedNode.type === NodeType.CHANCE ? 'bg-orange-50 text-orange-700 border-orange-200' :
                'bg-green-50 text-green-700 border-green-200'
            }`}>
                {selectedNode.type}
            </span>
        </div>
        <div className="text-xs text-gray-400 mb-4 font-mono">ID: {selectedNode.id}</div>
        
        {/* Common Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">名称 / 描述</label>
            <input 
              type="text" 
              value={selectedNode.label}
              onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm"
              placeholder="输入节点名称..."
            />
          </div>

          {/* Terminal Node Fields */}
          {selectedNode.type === NodeType.TERMINAL && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">收益 / 成本 (Value)</label>
              <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500 text-sm">¥</span>
                  <input 
                    type="number" 
                    value={selectedNode.value}
                    onChange={(e) => onUpdateNode(selectedNode.id, { value: parseFloat(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md pl-7 pr-3 py-2 text-sm font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition shadow-sm"
                  />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">输入正数表示收益，负数表示成本</p>
            </div>
          )}

           {/* Probability Field for Child Nodes */}
           {selectedNode.type !== NodeType.DECISION && selectedNode.id !== 'root' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">发生概率 (0.0 - 1.0)</label>
              <input 
                type="number" 
                step="0.05"
                min="0"
                max="1"
                value={selectedNode.probability}
                onChange={(e) => onUpdateNode(selectedNode.id, { probability: parseFloat(e.target.value) })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition shadow-sm"
              />
            </div>
          )}

          {/* Probability Sum Validation for Chance Nodes */}
          {selectedNode.type === NodeType.CHANCE && probSum !== null && (
            <div className={`p-2 rounded text-xs border ${Math.abs(probSum - 1) < 0.001 ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                <div className="flex justify-between font-bold mb-1">
                  <span>分支概率总和:</span>
                  <span>{probSum.toFixed(2)}</span>
                </div>
                {Math.abs(probSum - 1) >= 0.001 && (
                  <div className="text-[10px] opacity-80">注意：总和应等于 1.0</div>
                )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">添加子节点</h3>
        <div className="grid grid-cols-2 gap-2">
          {selectedNode.type !== NodeType.TERMINAL && (
            <>
              <button 
                onClick={() => onAddNode(selectedNode.id, NodeType.DECISION)}
                className="flex flex-col items-center justify-center gap-1 bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 py-3 rounded border border-gray-200 hover:border-blue-200 transition shadow-sm group"
              >
                <div className="w-4 h-4 bg-blue-500 rounded-sm group-hover:scale-110 transition-transform"></div> 
                <span className="text-xs">决策节点</span>
              </button>
              <button 
                 onClick={() => onAddNode(selectedNode.id, NodeType.CHANCE)}
                 className="flex flex-col items-center justify-center gap-1 bg-white hover:bg-orange-50 text-gray-700 hover:text-orange-700 py-3 rounded border border-gray-200 hover:border-orange-200 transition shadow-sm group"
              >
                <div className="w-4 h-4 bg-orange-500 rounded-full group-hover:scale-110 transition-transform"></div> 
                <span className="text-xs">机会节点</span>
              </button>
              <button 
                 onClick={() => onAddNode(selectedNode.id, NodeType.TERMINAL)}
                 className="col-span-2 flex flex-row items-center justify-center gap-2 bg-white hover:bg-green-50 text-gray-700 hover:text-green-700 py-2 rounded border border-gray-200 hover:border-green-200 transition shadow-sm group"
              >
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-green-500 group-hover:-translate-y-0.5 transition-transform"></div> 
                <span className="text-xs">终止节点 (结果)</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="border-t pt-4 mt-auto">
        <button 
          onClick={() => onDeleteNode(selectedNode.id)}
          disabled={selectedNode.id === 'root'}
          className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 py-2 rounded text-sm transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          删除当前节点
        </button>
      </div>
    </div>
  );
};

export default Controls;