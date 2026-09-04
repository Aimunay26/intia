export const DEFAULT_TASK_COLUMNS = [
  { name: "Idea o Acción", color: "#8b5cf6", order: 0 },
  { name: "Plan", color: "#3b82f6", order: 1 },
  { name: "Ejecución", color: "#f59e0b", order: 2 },
  { name: "Análisis", color: "#ec4899", order: 3 },
  { name: "Listo", color: "#10b981", order: 4 },
];

export const TASK_KINDS = [
  { value: "ACCION", label: "Acción", icon: "zap", color: "#3b82f6" },
  { value: "IDEA", label: "Idea", icon: "lightbulb", color: "#8b5cf6" },
] as const;

export const TASK_PRIORITIES = [
  { value: "BAJA", label: "Baja", color: "#94a3b8" },
  { value: "NORMAL", label: "Normal", color: "#3b82f6" },
  { value: "ALTA", label: "Alta", color: "#f59e0b" },
  { value: "URGENTE", label: "Urgente", color: "#ef4444" },
] as const;
