import { useEffect, useState } from "react";
import type { Project } from "./models/project";
import type { Task } from "./models/task";
import { listProjects, createProject } from "./api/projects";
import { listTasks, updateTask } from "./api/tasks";
import { login } from "./api/auth";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!authed) return;
    listProjects().then(setProjects);
    listTasks().then(setTasks);
  }, [authed]);

  async function handleLogin() {
    const res = await login({ email: "demo@backbone.dev", password: "demo" });
    localStorage.setItem("token", res.token);
    setAuthed(true);
  }

  async function toggle(task: Task) {
    const updated = await updateTask(task.id, { ...task, done: !task.done });
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  if (!authed) {
    return (
      <main>
        <h1>Backbone demo</h1>
        <button onClick={handleLogin}>Sign in</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Projects</h1>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
      <button onClick={() => createProject({} as Project)}>New project</button>
      <h1>Tasks</h1>
      <ul>
        {tasks.map((t) => (
          <li key={t.id} onClick={() => toggle(t)}>
            {t.done ? "done" : "open"} — {t.title}
          </li>
        ))}
      </ul>
    </main>
  );
}
