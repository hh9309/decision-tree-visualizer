import { TreeNode, NodeType } from '../types';

export const generateId = (): string => Math.random().toString(36).substr(2, 9);

// 创建一个适中且典型的初始案例：生产扩能决策
export const createInitialTree = (): TreeNode => {
  const rootId = 'root';
  
  // 方案1：新建自动化工厂 (高风险高回报)
  const t1_high = { id: generateId(), type: NodeType.TERMINAL, label: '净利 2500万', value: 2500, children: [], probability: 0.6 };
  const t1_low = { id: generateId(), type: NodeType.TERMINAL, label: '亏损 500万', value: -500, children: [], probability: 0.4 };
  
  // 注意：在赋给children时，我们需要确保对象是新的，虽然这里t1_high没有被重复使用，
  // 但为了最佳实践，我们在放入数组时构建新对象，或者直接引用（如果ID不需要唯一于位置）。
  // 在树结构中，每个节点ID应当唯一。这里我们直接使用定义好的节点，因为它们在树中只出现一次。
  
  const c1 = {
      id: generateId(), type: NodeType.CHANCE, label: '市场需求',
      value: 0,
      children: [
          {...t1_high, label: '需求旺盛 (60%)'},
          {...t1_low, label: '需求低迷 (40%)'}
      ]
  };

  // 方案2：扩建现有产线 (稳健策略)
  const t2_high = { id: generateId(), type: NodeType.TERMINAL, label: '净利 1200万', value: 1200, children: [], probability: 0.6 };
  const t2_low = { id: generateId(), type: NodeType.TERMINAL, label: '净利 300万', value: 300, children: [], probability: 0.4 };
  
  const c2 = {
      id: generateId(), type: NodeType.CHANCE, label: '市场需求',
      value: 0,
      children: [
          {...t2_high, label: '需求旺盛 (60%)'},
          {...t2_low, label: '需求低迷 (40%)'}
      ]
  };

  // 方案3：外包协作 (低风险低回报)
  const t3_high = { id: generateId(), type: NodeType.TERMINAL, label: '净利 800万', value: 800, children: [], probability: 0.6 };
  const t3_low = { id: generateId(), type: NodeType.TERMINAL, label: '净利 500万', value: 500, children: [], probability: 0.4 };
  
  const c3 = {
      id: generateId(), type: NodeType.CHANCE, label: '市场需求',
      value: 0,
      children: [
          {...t3_high, label: '需求旺盛 (60%)'},
          {...t3_low, label: '需求低迷 (40%)'}
      ]
  };

  return {
    id: rootId,
    type: NodeType.DECISION,
    label: '生产扩能决策',
    children: [
      { ...c1, label: '新建自动化工厂' },
      { ...c2, label: '扩建现有产线' },
      { ...c3, label: '寻求外包协作' }
    ],
    value: 0
  };
};

// 递归查找节点
export const findNode = (root: TreeNode, id: string): TreeNode | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
};

// 递归更新节点
export const updateNodeInTree = (root: TreeNode, id: string, updates: Partial<TreeNode>): TreeNode => {
  if (root.id === id) {
    return { ...root, ...updates };
  }
  return {
    ...root,
    children: root.children.map(child => updateNodeInTree(child, id, updates))
  };
};

// 添加子节点
export const addNodeToTree = (root: TreeNode, parentId: string, type: NodeType): TreeNode => {
  const newNode: TreeNode = {
    id: generateId(),
    type,
    label: type === NodeType.TERMINAL ? '结果' : (type === NodeType.CHANCE ? '不确定事件' : '决策'),
    value: 0,
    probability: 0.5,
    children: []
  };

  if (root.id === parentId) {
    return { ...root, children: [...root.children, newNode] };
  }

  return {
    ...root,
    children: root.children.map(child => addNodeToTree(child, parentId, type))
  };
};

// 删除节点
export const deleteNodeFromTree = (root: TreeNode, id: string): TreeNode => {
  return {
    ...root,
    children: root.children
      .filter(child => child.id !== id)
      .map(child => deleteNodeFromTree(child, id))
  };
};

// 扁平化获取所有节点用于计算顺序
export const flattenTreePostOrder = (node: TreeNode): TreeNode[] => {
  let list: TreeNode[] = [];
  node.children.forEach(child => {
    list = [...list, ...flattenTreePostOrder(child)];
  });
  list.push(node);
  return list;
};

// 计算单个节点的 EMV (Expected Monetary Value)
export const calculateNodeEMV = (node: TreeNode): number => {
  if (node.type === NodeType.TERMINAL) {
    return node.value || 0;
  }

  if (node.children.length === 0) return 0;

  if (node.type === NodeType.DECISION) {
    // 决策节点取最大值 (假设是收益最大化)
    return Math.max(...node.children.map(c => c.calculatedValue ?? 0));
  }

  if (node.type === NodeType.CHANCE) {
    // 机会节点取加权平均
    return node.children.reduce((sum, child) => {
      return sum + (child.calculatedValue ?? 0) * (child.probability ?? 0);
    }, 0);
  }

  return 0;
};

// 生成计算公式描述
export const getCalculationFormula = (node: TreeNode): string => {
  if (node.type === NodeType.TERMINAL) {
    return `直接取值: ${node.value}`;
  }
  
  if (node.type === NodeType.DECISION) {
    const values = node.children.map(c => c.calculatedValue?.toFixed(2) ?? '?');
    return `MAX( ${values.join(', ')} )`;
  }

  if (node.type === NodeType.CHANCE) {
    const parts = node.children.map(c => `(${c.probability} × ${c.calculatedValue?.toFixed(2) ?? '?'})`);
    return parts.join(' + ');
  }

  return '';
};

// 标记最优路径
export const markOptimalPath = (root: TreeNode): TreeNode => {
  const newRoot = { ...root };
  
  if (newRoot.type === NodeType.TERMINAL || newRoot.children.length === 0) {
    return newRoot;
  }

  // 先处理子节点
  newRoot.children = newRoot.children.map(markOptimalPath);

  if (newRoot.type === NodeType.DECISION && newRoot.calculatedValue !== undefined) {
    // 找出哪个子节点贡献了最大值
    const maxVal = newRoot.calculatedValue;
    // 注意：可能有多个相同最大值，这里标记所有符合的
    newRoot.children = newRoot.children.map(child => {
       const isChildOptimal = Math.abs((child.calculatedValue ?? 0) - maxVal) < 0.0001;
       return { ...child, isOptimal: isChildOptimal };
    });
  } else if (newRoot.type === NodeType.CHANCE) {
     // 机会节点的所有路径在逻辑上都是"可能"发生的，通常不标记单一最优，
     // 但为了视觉连贯性，如果父节点是最优，这些路径也是最优流的一部分。
     // 这里我们仅在Decision节点做选择标记。
  }

  return newRoot;
};
