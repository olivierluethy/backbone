import { api } from "./client";
import type { Task } from "../models/task";
import type { Tag } from "../models/tag";

export function listTasks(): Promise<Task[]> {
  return api.get<Task[]>("/tasks");
}

export function getTask(id: number): Promise<Task> {
  return api.get<Task>(`/tasks/${id}`);
}

export function createTask(input: Task): Promise<Task> {
  return api.post<Task>("/tasks", input);
}

export function updateTask(id: number, input: Task): Promise<Task> {
  return api.patch<Task>(`/tasks/${id}`, input);
}

export function deleteTask(id: number): Promise<void> {
  return api.delete<void>(`/tasks/${id}`);
}

export function listTags(): Promise<Tag[]> {
  return api.get<Tag[]>("/tags");
}

export function createTag(input: Tag): Promise<Tag> {
  return api.post<Tag>("/tags", input);
}
