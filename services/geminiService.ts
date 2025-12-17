import { GoogleGenAI } from "@google/genai";
import { TreeNode } from "../types";

export type AIProvider = 'gemini' | 'deepseek';

export const analyzeTree = async (root: TreeNode, provider: AIProvider, apiKey: string) => {
  // 序列化树结构为精简的文本描述
  const treeDescription = JSON.stringify(root, (key, value) => {
    if (key === 'children') return value.map((c: any) => ({ id: c.id, label: c.label, type: c.type, value: c.value, probability: c.probability })); 
    if (['collapsed', 'isOptimal', 'selected', 'id'].includes(key)) return undefined;
    return value;
  }, 2);

  const prompt = `
    作为一位专业的决策分析师，请根据以下决策树的JSON结构数据进行分析。
    
    决策树数据:
    ${treeDescription}

    请提供以下内容（请用Markdown格式，使用中文）：
    1. **决策建议**：根据计算结果（EMV），哪条路径是最佳选择？
    2. **风险评估**：在这个决策过程中，最大的风险点或不确定性在哪里？
    3. **敏感性提示**：哪些变量（概率或收益）的变化最可能改变最终决策？
    4. **总结**：简短的执行摘要。

    注意：决策节点取最大值，机会节点取概率加权平均值。请基于数据说话。
  `;

  if (provider === 'gemini') {
    try {
      // Initialize with user provided key (or env if empty, but UI enforces input)
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 1024 } 
        }
      });

      return response.text;
    } catch (error) {
      console.error("Gemini Analysis Error:", error);
      throw new Error("Gemini 调用失败: " + (error instanceof Error ? error.message : String(error)));
    }
  } else if (provider === 'deepseek') {
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a helpful decision analysis assistant.' },
            { role: 'user', content: prompt }
          ],
          stream: false
        })
      });

      if (!response.ok) {
         const errorData = await response.json().catch(() => ({}));
         throw new Error(`DeepSeek API Error: ${response.status} ${errorData.error?.message || ''}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "未获取到内容";
    } catch (error) {
       console.error("DeepSeek Analysis Error:", error);
       throw new Error("DeepSeek 调用失败: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  throw new Error("不支持的模型提供商");
};
