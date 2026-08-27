import type { Project } from "./project";
import type { Tag } from "./tag";

/**
 * A task belongs to one project (many-to-one via projectId) and can carry many tags
 * (many-to-many).
 */
export interface Task {
  id: number;
  title: string;
  description?: string;
  done: boolean;
  priority: "low" | "medium" | "high";
  estimateHours: number;
  projectId: number;
  dueDate: Date | null;
  createdAt: Date;
  project?: Project;
  tags: Tag[];
}
