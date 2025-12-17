export enum NodeType {
  DECISION = 'DECISION', // 决策节点 (方形)
  CHANCE = 'CHANCE',     // 机会节点 (圆形)
  TERMINAL = 'TERMINAL'  // 终止节点 (三角形/点)
}

export interface TreeNode {
  id: string;
  type: NodeType;
  label: string;
  value?: number; // 终止节点的收益/成本，或者中间节点的计算结果
  probability?: number; // 仅用于作为 Chance 节点的子节点时
  children: TreeNode[];
  collapsed?: boolean;
  calculatedValue?: number; // 存储计算后的 EMV
  isOptimal?: boolean; // 标记是否为最优路径
  notes?: string;
}

export interface CalculationLog {
  id: string;
  nodeLabel: string;
  nodeType: NodeType;
  formula: string;
  result: number;
  timestamp: number;
}

export interface TreeContextType {
  root: TreeNode;
  setRoot: (node: TreeNode) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  updateNode: (id: string, updates: Partial<TreeNode>) => void;
  addNode: (parentId: string, type: NodeType) => void;
  deleteNode: (id: string) => void;
  calculationMode: 'edit' | 'step' | 'auto'; // 编辑模式 | 逐步 | 自动
  setCalculationMode: (mode: 'edit' | 'step' | 'auto') => void;
  calculationStep: number;
  nextStep: () => void;
  resetCalculation: () => void;
}
