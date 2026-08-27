import type { Task } from "./task";

/** A label attachable to many tasks (many-to-many with Task). */
export interface Tag {
  id: number;
  label: string;
  color: string;
  tasks: Task[];
}
