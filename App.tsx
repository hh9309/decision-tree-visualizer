import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { TreeNode, NodeType, CalculationLog } from './types';
import { 
  createInitialTree, 
  updateNodeInTree, 
  addNodeToTree, 
  deleteNodeFromTree,
  flattenTreePostOrder,
  calculateNodeEMV,
  markOptimalPath,
  findNode,
  getCalculationFormula,
  generateId
} from './utils/treeUtils';
import TreeVisualizer from './components/TreeVisualizer';
import Controls from './components/Controls';
import { analyzeTree, AIProvider } from './services/geminiService';

const App: React.FC = () => {
  const [root, setRoot] = useState<TreeNode>(createInitialTree());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('root');
  const [calculationMode, setCalculationMode] = useState<'edit' | 'step' | 'auto'>('edit');
  const [logs, setLogs] = useState<CalculationLog[]>([]);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  
  // AI States
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showAiSettings, setShowAiSettings] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track AI analysis requests to prevent race conditions
  const analysisRequestId = useRef(0);

  useEffect(() => {
    if (logs.length > 0) {
      const lastLog = logs[logs.length - 1];
      setActiveLogId(lastLog.id);
      if (logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      setActiveLogId(null);
    }
  }, [logs]);

  // 节点操作
  const handleUpdateNode = (id: string, updates: Partial<TreeNode>) => {
    if (calculationMode !== 'edit') resetCalculation();
    setRoot(prev => updateNodeInTree(prev, id, updates));
  };

  const handleAddNode = (parentId: string, type: NodeType) => {
    if (calculationMode !== 'edit') resetCalculation();
    setRoot(prev => addNodeToTree(prev, parentId, type));
  };

  const handleDeleteNode = (id: string) => {
    if (calculationMode !== 'edit') resetCalculation();
    setRoot(prev => deleteNodeFromTree(prev, id));
    setSelectedNodeId(null);
  };

  const resetCalculation = useCallback(() => {
    // Cancel any ongoing auto-solve
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setCalculationMode('edit');
    setLogs([]);
    setActiveLogId(null);
    const clearValues = (node: TreeNode): TreeNode => ({
      ...node,
      calculatedValue: undefined,
      isOptimal: undefined,
      children: node.children.map(clearValues)
    });
    setRoot(prev => clearValues(prev));
  }, []);

  // 求解逻辑
  const handleSolve = async (stepByStep: boolean) => {
    // 取消任何正在进行的自动计算
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (stepByStep) {
      setCalculationMode('step');
      
      let newRoot = { ...root };
      let foundNext = false;

      const stepCalculate = (node: TreeNode): TreeNode => {
        if (node.calculatedValue !== undefined) return node;

        if (node.type === NodeType.TERMINAL) {
            return { ...node, calculatedValue: node.value };
        }

        const children = node.children.map(c => stepCalculate(c));
        const allChildrenCalculated = children.every(c => c.calculatedValue !== undefined);

        if (allChildrenCalculated && !foundNext) {
           foundNext = true;
           const nodeWithChildren = { ...node, children };
           const val = calculateNodeEMV(nodeWithChildren);
           const formula = getCalculationFormula(nodeWithChildren);
           
           setLogs(prev => [...prev, {
             id: generateId(),
             nodeLabel: node.label,
             nodeType: node.type,
             formula: formula,
             result: val,
             timestamp: Date.now()
           }]);

           return { ...nodeWithChildren, calculatedValue: val };
        }

        return { ...node, children };
      };

      const nextRoot = stepCalculate(newRoot);
      
      if (foundNext) {
        setRoot(nextRoot);
      } else {
        const finalRoot = markOptimalPath(nextRoot);
        setRoot(finalRoot);
        setCalculationMode('auto');
      }
    } else {
      // 自动求解（带延迟演示）
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setCalculationMode('step'); // 过程显示为"推演中"
        
        // 1. 克隆并重置，准备从头演示
        let workingRoot = JSON.parse(JSON.stringify(root));
        const clearValues = (node: TreeNode) => {
           if (node.type !== NodeType.TERMINAL) {
             node.calculatedValue = undefined;
             node.isOptimal = undefined;
           }
           node.children.forEach(clearValues);
        };
        // 如果是从编辑模式过来，或者想要完全重播，先清理
        if (calculationMode === 'edit' || calculationMode === 'auto') {
           clearValues(workingRoot);
           setLogs([]);
           setRoot(JSON.parse(JSON.stringify(workingRoot)));
        }

        // 2. 获取后序遍历顺序
        const nodesInOrder = flattenTreePostOrder(workingRoot);

        // 3. 循环计算
        for (const node of nodesInOrder) {
            if (controller.signal.aborted) return;

            // 终止节点直接赋值，方便父节点计算
            if (node.type === NodeType.TERMINAL) {
                node.calculatedValue = node.value;
                continue;
            }

            // 如果节点已经计算过（例如从逐步模式切换过来），跳过
            if (node.calculatedValue !== undefined) continue;

            // 演示延迟：2秒
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (controller.signal.aborted) return;

            // 计算
            const val = calculateNodeEMV(node);
            node.calculatedValue = val;

            // 记录日志
            const newLog: CalculationLog = {
              id: generateId(),
              nodeLabel: node.label,
              nodeType: node.type,
              formula: getCalculationFormula(node),
              result: val,
              timestamp: Date.now()
            };
            setLogs(prev => [...prev, newLog]);

            // 更新视图
            setRoot(JSON.parse(JSON.stringify(workingRoot)));
        }
        
        if (controller.signal.aborted) return;

        // 4. 完成
        workingRoot = markOptimalPath(workingRoot);
        setRoot(workingRoot);
        setCalculationMode('auto');

      } catch (e) {
        console.error("Auto solve aborted or failed", e);
      } finally {
         if (abortControllerRef.current === controller) {
             abortControllerRef.current = null;
         }
      }
    }
  };

  const handleAnalyze = async () => {
    if (!apiKey.trim()) {
      setShowAiSettings(true);
      return;
    }

    // Generate a new Request ID for this attempt
    const requestId = analysisRequestId.current + 1;
    analysisRequestId.current = requestId;

    setIsAnalyzing(true);
    setAiAnalysis(null);
    // 自动折叠设置面板，展示加载状态
    setShowAiSettings(false);

    try {
      const result = await analyzeTree(root, aiProvider, apiKey);
      // Only update state if this is still the active request
      if (requestId === analysisRequestId.current) {
        setAiAnalysis(result);
      }
    } catch (e) {
      if (requestId === analysisRequestId.current) {
        alert(e instanceof Error ? e.message : "分析失败");
        // 失败后重新显示设置，方便用户修改 key
        setShowAiSettings(true);
      }
    } finally {
      if (requestId === analysisRequestId.current) {
        setIsAnalyzing(false);
      }
    }
  };

  const selectedNode = selectedNodeId ? findNode(root, selectedNodeId) : null;
  const activeLog = activeLogId ? logs.find(l => l.id === activeLogId) : null;

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded flex items-center justify-center text-white font-bold text-xl shadow-md">
             Z
          </div>
          <div className="flex items-baseline gap-4">
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">智策 <span className="text-gray-400 font-light mx-2">|</span> <span className="text-sm font-medium text-gray-500">交互式决策树工作台</span></h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
             <div className="text-sm">
              {calculationMode === 'edit' && <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-semibold border border-gray-200">编辑模式</span>}
              {calculationMode === 'step' && <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold border border-blue-200 animate-pulse">逐步推演中...</span>}
              {calculationMode === 'auto' && <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold border border-green-200">计算完成</span>}
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Column: Visualization + Calculation Console */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
           
           {/* Top: Canvas */}
           <div className="flex-1 relative bg-slate-50/50 overflow-hidden">
              {/* Grid Background Pattern */}
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              
              <div 
                 className="absolute inset-0 p-4"
                 onClick={() => setSelectedNodeId(null)} // Add background click to deselect
              >
                  <TreeVisualizer 
                    data={root} 
                    selectedId={selectedNodeId} 
                    onNodeClick={setSelectedNodeId}
                    width={800} 
                    height={600} 
                    showValues={calculationMode !== 'edit'}
                  />
              </div>
              
              {/* Floating Legend */}
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border border-gray-200 text-xs flex gap-4 z-10 pointer-events-none">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-500 rounded-sm shadow-sm"></div> 决策点</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-500 rounded-full shadow-sm"></div> 机会点</div>
                  <div className="flex items-center gap-1.5"><div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-green-500 drop-shadow-sm"></div> 结果</div>
              </div>
           </div>

           {/* Bottom: Enhanced Calculation Console */}
           <div className="h-72 bg-white border-t border-gray-200 flex flex-col shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] z-20">
              {/* Console Toolbar */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-4">
                    <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      计算控制台
                    </h3>
                    
                    {/* Control Buttons Group */}
                    <div className="flex bg-white rounded-md shadow-sm border border-gray-300 divide-x divide-gray-300 ml-4">
                      <button 
                        onClick={() => handleSolve(true)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition flex items-center gap-1"
                        title="逐步执行计算"
                      >
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                         逐步求解
                      </button>
                      <button 
                         onClick={() => handleSolve(false)}
                         className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-green-50 hover:text-green-700 transition flex items-center gap-1"
                         title="演示自动求解过程"
                      >
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                         自动求解
                      </button>
                      <button 
                         onClick={resetCalculation}
                         className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition flex items-center gap-1"
                         title="清除所有计算结果"
                      >
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                         重置
                      </button>
                    </div>
                  </div>
                  
                  <span className="text-xs text-gray-400">总步骤: {logs.length}</span>
              </div>
              
              {/* Console Body: Split View */}
              <div className="flex-1 flex overflow-hidden">
                 {/* Left: Step List */}
                 <div className="w-2/5 border-r border-gray-200 overflow-y-auto bg-white flex flex-col">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0 z-10">
                       计算步骤记录
                    </div>
                    {logs.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-4">
                           <span className="text-sm italic">等待计算...</span>
                           <span className="text-xs mt-1">请点击上方工具栏按钮开始</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                           {logs.map((log, index) => (
                             <div 
                               key={log.id} 
                               onClick={() => setActiveLogId(log.id)}
                               className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between group ${activeLogId === log.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                             >
                                <div className="flex items-center gap-3 overflow-hidden">
                                   <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${activeLogId === log.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                      {index + 1}
                                   </div>
                                   <div className="flex flex-col min-w-0">
                                      <span className={`text-sm font-medium truncate ${activeLogId === log.id ? 'text-blue-800' : 'text-gray-700'}`}>
                                        {log.nodeLabel}
                                      </span>
                                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                        {log.nodeType === NodeType.DECISION ? '决策节点' : '机会节点'}
                                        <span>•</span>
                                        {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                                      </span>
                                   </div>
                                </div>
                                <div className="text-right">
                                   <span className="text-sm font-bold text-gray-900">¥{log.result.toFixed(0)}</span>
                                   <svg className={`w-4 h-4 text-gray-300 ml-auto mt-1 ${activeLogId === log.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                   </svg>
                                </div>
                             </div>
                           ))}
                           <div ref={logsEndRef} />
                        </div>
                    )}
                 </div>

                 {/* Right: Formula Detail */}
                 <div className="flex-1 bg-slate-50 overflow-y-auto p-6 flex flex-col">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">
                       公式详情
                    </div>
                    {activeLog ? (
                       <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                             <div className="flex items-center gap-2 mb-6">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                                   activeLog.nodeType === NodeType.DECISION ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                                }`}>
                                   {activeLog.nodeType === NodeType.DECISION ? '决策计算 (MAX)' : '期望值计算 (EMV)'}
                                </span>
                                <h4 className="text-lg font-bold text-gray-800">{activeLog.nodeLabel}</h4>
                             </div>
                             
                             <div className="mb-2 text-sm text-gray-500 font-medium">计算公式:</div>
                             <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 font-mono text-base text-gray-700 break-all leading-relaxed shadow-inner">
                                {activeLog.formula}
                             </div>
                             
                             <div className="mt-6 flex justify-end items-end gap-3">
                                <span className="text-gray-500 text-sm pb-1">结果 =</span>
                                <span className="text-3xl font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded">¥{activeLog.result.toFixed(2)}</span>
                             </div>
                          </div>
                          
                          <div className="mt-4 text-xs text-gray-400 px-2">
                             提示: {activeLog.nodeType === NodeType.DECISION ? 
                               '决策节点选择所有子分支中期望值(EMV)最大的路径。' : 
                               '机会节点的期望值等于各分支结果与对应概率乘积之和。'}
                          </div>
                       </div>
                    ) : (
                       <div className="h-full flex flex-col items-center justify-center text-gray-300">
                          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <p>选择左侧步骤查看详细公式</p>
                       </div>
                    )}
                 </div>
              </div>
           </div>

        </div>

        {/* Right Column: Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shadow-xl z-30 shrink-0">
          {/* Controls */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
             <Controls 
               selectedNode={selectedNode}
               onUpdateNode={handleUpdateNode}
               onAddNode={handleAddNode}
               onDeleteNode={handleDeleteNode}
               calculationMode={calculationMode}
             />
          </div>

          {/* AI Analysis Panel */}
          <div className={`flex-1 border-t border-gray-200 bg-gray-50 flex flex-col transition-all duration-300 ${aiAnalysis || showAiSettings ? 'min-h-[50%]' : 'min-h-[25%]'}`}>
             <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center shrink-0">
               <h3 className="font-bold text-indigo-800 flex items-center gap-2">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                 AI 洞察报告
               </h3>
               <div className="flex items-center gap-2">
                 <button 
                    onClick={() => setShowAiSettings(!showAiSettings)}
                    className={`p-1 rounded-md transition ${showAiSettings ? 'bg-indigo-200 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-100'}`}
                    title="模型设置"
                 >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                 </button>
                 {aiAnalysis && !showAiSettings && (
                   <button onClick={() => setAiAnalysis(null)} className="text-gray-400 hover:text-gray-600">×</button>
                 )}
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-700 leading-relaxed bg-white">
                {showAiSettings ? (
                   <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                       <div>
                          <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">选择模型</label>
                          <div className="flex bg-gray-50 rounded p-1 border border-gray-200">
                             <button 
                               onClick={() => setAiProvider('gemini')}
                               className={`flex-1 text-xs py-1.5 rounded transition font-medium ${aiProvider === 'gemini' ? 'bg-white text-indigo-700 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
                             >
                               Gemini
                             </button>
                             <button 
                               onClick={() => setAiProvider('deepseek')}
                               className={`flex-1 text-xs py-1.5 rounded transition font-medium ${aiProvider === 'deepseek' ? 'bg-white text-indigo-700 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
                             >
                               DeepSeek
                             </button>
                          </div>
                       </div>
                       <div>
                          <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">API Key <span className="text-red-500">*</span></label>
                          <input 
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={`输入 ${aiProvider === 'gemini' ? 'Gemini' : 'DeepSeek'} API Key`}
                            className="w-full text-xs border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                          />
                       </div>
                       
                       <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || !apiKey.trim()}
                        className={`w-full py-2 px-4 rounded shadow-sm text-xs font-bold transition flex items-center justify-center gap-2 mt-4 ${
                           isAnalyzing || !apiKey.trim() 
                           ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                           : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md'
                        }`}
                      >
                        {isAnalyzing ? '分析中...' : '保存配置并生成报告'}
                      </button>
                   </div>
                ) : isAnalyzing ? (
                   <div className="h-full flex flex-col items-center justify-center text-indigo-500">
                      <svg className="animate-spin h-8 w-8 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <p className="text-xs font-medium">AI 正在深度分析决策树...</p>
                   </div>
                ) : aiAnalysis ? (
                   <div className="prose prose-sm prose-indigo max-w-none">
                      {aiAnalysis.split('\n').map((line, i) => {
                         if (line.trim().startsWith('#')) return <h4 key={i} className="font-bold mt-3 mb-1 text-gray-900">{line.replace(/#/g, '').trim()}</h4>
                         if (line.trim().startsWith('**')) return <p key={i} className="font-bold mt-2 text-gray-800">{line.replace(/\*\*/g, '').trim()}</p>
                         if (line.trim().startsWith('-')) return <div key={i} className="ml-2 flex gap-2 mb-1"><span className="text-indigo-400">•</span><span>{line.replace('-', '').trim()}</span></div>
                         if (line.trim() === '') return <div key={i} className="h-2"></div>
                         return <p key={i} className="mb-1">{line}</p>
                      })}
                   </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center px-6">
                    <svg className="w-10 h-10 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                    <p className="text-xs mb-3">配置 API Key 启用智能分析</p>
                    <button 
                      onClick={() => setShowAiSettings(true)}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded text-xs text-gray-600 hover:text-indigo-600 hover:border-indigo-300 transition shadow-sm"
                    >
                      开始配置
                    </button>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");
const rootReact = createRoot(rootElement);
rootReact.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

export default App;