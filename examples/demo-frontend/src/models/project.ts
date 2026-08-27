import type { Task } from "./task";

/**
 * A project groups tasks. One project has many tasks (one-to-many).
 */
export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: "active" | "archived";
  budget: number;
  createdAt: Date;
  updatedAt: Date;
  tasks: Task[];
}
