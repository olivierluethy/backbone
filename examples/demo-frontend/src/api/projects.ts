import { api } from "./client";
import type { Project } from "../models/project";

export function listProjects(): Promise<Project[]> {
  return api.get<Project[]>("/projects");
}

export function getProject(id: number): Promise<Project> {
  return api.get<Project>(`/projects/${id}`);
}

export function createProject(input: Project): Promise<Project> {
  return api.post<Project>("/projects", input);
}

export function updateProject(id: number, input: Project): Promise<Project> {
  return api.put<Project>(`/projects/${id}`, input);
}

export function deleteProject(id: number): Promise<void> {
  return api.delete<void>(`/projects/${id}`);
}
