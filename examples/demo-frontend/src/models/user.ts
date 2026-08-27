/** An authenticated user. The `role` enum seeds the backend role guard. */
export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "member";
  createdAt: Date;
}
