"use client";

import React, { createContext, useContext, useState } from 'react';

// 定义操作的类型
export type OperationType =
  | 'publish_article'
  | 'sync_photowall'
  | 'sync_friends'
  | 'sync_projects'
  | 'create_moment'
  | 'CONFIG';

type OperationBase = {
  label: string;
  description?: string;
  id?: string;
  timestamp?: string;
};

export type OperationInput = OperationBase & (
  | { type: 'publish_article'; value: Record<string, unknown> }
  | { type: 'sync_photowall' | 'sync_friends' | 'sync_projects'; value: unknown[] }
  | { type: 'create_moment'; payload: Record<string, unknown> }
  | { type: 'CONFIG'; payload: Record<string, unknown>; key?: string; value?: unknown }
);

export type Operation = OperationInput & {
  id: string;
  timestamp: string;
};

export function createOperation(input: OperationInput): Operation {
  return {
    ...input,
    id: input.id || Math.random().toString(36).slice(2, 11),
    timestamp: input.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

interface OperationContextType {
  operations: Operation[];
  addOperation: (op: OperationInput) => void;
  removeOperation: (id: string) => void;
  clearOperations: () => void;
}

const OperationContext = createContext<OperationContextType | undefined>(undefined);

export function OperationProvider({ children }: { children: React.ReactNode }) {
  const [operations, setOperations] = useState<Operation[]>([]);

  // 添加操作（如果同类型的操作已存在，则覆盖，防止重复积攒）
  const addOperation = (op: OperationInput) => {
    const newOp = createOperation(op);

    setOperations(prev => {
      // 如果是修改同一个文件，先过滤掉旧的，再加新的
      const filtered = prev.filter(item => !(item.type === op.type && item.label === op.label));
      return [...filtered, newOp];
    });
  };

  const removeOperation = (id: string) => {
    setOperations(prev => prev.filter(op => op.id !== id));
  };

  const clearOperations = () => setOperations([]);

  return (
    <OperationContext.Provider value={{ operations, addOperation, removeOperation, clearOperations }}>
      {children}
    </OperationContext.Provider>
  );
}

// 导出 Hook 方便其他组件调用
export const useOperations = () => {
  const context = useContext(OperationContext);
  if (!context) throw new Error("useOperations must be used within an OperationProvider");
  return context;
};
